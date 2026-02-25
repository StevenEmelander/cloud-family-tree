# API Package

AWS Lambda functions for the Cloud Family Tree API.

## Architecture

```text
src/
  handlers/          # Lambda entry points (one file per route)
    people/          # CRUD for people
    relationships/   # CRUD for family connections
    artifacts/       # Photo/document upload/delete with presigned URLs
    entries/         # Memorial entries (stories, memories)
    gedcom/          # GEDCOM import/export
    auth/            # Auth helpers (token verification)
    admin/           # User management (admin-only)
  services/          # Business logic, validation, orchestration
  repositories/      # DynamoDB access, key construction
  middleware/        # auth.ts, response.ts, error-handler.ts
  lib/               # DynamoDB client, S3 client singletons
  gedcom/            # GEDCOM format import/export logic
```

## Conventions

### Adding a new handler

1. Create the handler file in the appropriate `handlers/` subdirectory
2. Follow the standard pattern: authorize → extract params → call service → successResponse/errorResponse
3. Service is a module-scoped singleton (`const service = new SomeService()`)
4. Always use `authorize(event, level)` — never skip auth
5. Wire it up in `packages/infrastructure/lib/stacks/api.stack.ts`

### Adding a new service method

1. Validate input: `const result = validate(schema, input); if (!result.success) throw new ValidationError(result.errors!);`
2. Use `result.data!` for validated/typed data
3. Perform business logic checks (existence, permissions)
4. Delegate to repository for persistence
5. Update tree metadata counts if entity was created/deleted

### Repository patterns

- All repos extend or follow the pattern of `BaseRepository`
- DynamoDB keys use `ENTITY_PREFIX` constants from shared package
- Pagination cursors are base64-encoded `LastEvaluatedKey`
- Batch operations chunk at 25 items

### Performance & quality rules

**Never full-scan the table.** Always use `Query` with a known PK, or a GSI. `Scan` is forbidden in application code:

```typescript
// WRONG — scans everything:
await docClient.send(new ScanCommand({ TableName }));

// RIGHT — query a GSI or PK:
await docClient.send(new QueryCommand({ TableName, IndexName: GSI_NAMES.BY_TYPE, ... }));
```

**Minimize GSIs.** Each GSI adds write amplification and cost. Before adding one, check whether an existing GSI or a relationship-based traversal can satisfy the access pattern. New GSIs require a CDK stack deploy.

**Minimize round-trips.** Prefer `Promise.all()` for independent fetches rather than sequential awaits. For bulk lookups, use `BatchGetCommand` (up to 100 items) instead of N individual `GetCommand` calls:

```typescript
// WRONG:
for (const id of ids) { const item = await repo.findById(id); ... }

// RIGHT:
const items = await Promise.all(ids.map(id => repo.findById(id)));
// Or for large sets: BatchGetCommand
```

**Project only what you need.** When fetching for list views or tree rendering, use `ProjectionExpression` to skip large fields (bio, notes) that aren't needed. The repository has `findByIdForTree()` variants for this.

**Pagination, not unbounded queries.** Any handler that lists items must support cursor-based pagination. Never return an unbounded result set — enforce `limit` with a max cap from `API_CONFIG.MAX_PAGE_SIZE`.

### Idempotent operations

**Deletes** must be idempotent — if the resource is already deleted, return success (don't throw NotFoundError). This prevents race conditions from double-clicks and stale UI state:

```typescript
async delete(id: string): Promise<void> {
  const existing = await this.repo.findById(id);
  if (!existing) return; // Already deleted — nothing to do
  // Permission checks, then delete
  await this.repo.delete(id);
}
```

**Creates** must check for duplicates to prevent double-click and Lambda retry issues:

- **Entries**: Check same author + same content on same person → return existing (idempotent)
- **People**: Check same firstName + lastName + birthDate → throw ConflictError (409)
- **Relationships**: Check same type + same person pair → throw ValidationError (already implemented)

### Error handling

Throw typed errors — the handler's `errorResponse()` maps them to HTTP status codes:

- `NotFoundError('Entity', 'id')` → 404
- `ValidationError(['field: message'])` → 400 with `errors` array
- `UnauthorizedError()` → 401
- `ForbiddenError()` → 403
- `ConflictError('message')` → 409
- Unhandled errors → 500 (logged via `console.error`)

### Response format

All successful responses wrap data: `{ data: <result> }`
All error responses: `{ error: 'message' }` or `{ error: 'message', errors: [...] }`
CORS headers are always included.

## Testing

Tests live in `tests/` at the package root, mirroring `src/`. Run from the repo root with `pnpm test`.

### Test structure

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('ServiceName', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('methodName', () => {
    it('does the expected thing', async () => { ... });
  });
});
```

### Mocking patterns

All paths are relative to the test file's location inside `tests/`.

**Handler tests** (e.g. `tests/handlers/people/handlers.test.ts`):

```typescript
vi.mock('../../../src/middleware/auth', () => ({
  authorize: vi.fn().mockResolvedValue({ userId: 'admin', email: 'a@b.com', role: 'admins' }),
}));

const { mockService } = vi.hoisted(() => ({
  mockService: { create: vi.fn(), /* ... */ },
}));
vi.mock('../../../src/services/some.service', () => ({
  SomeService: vi.fn().mockImplementation(() => mockService),
}));

// Import handler INSIDE the test (after mocks are set up):
const { handler } = await import('../../../src/handlers/people/get');
```

**Service tests** (e.g. `tests/services/some.service.test.ts`):

```typescript
vi.mock('../../src/repositories/some.repository', () => ({
  SomeRepository: vi.fn().mockImplementation(() => ({
    findById: vi.fn(),
    create: vi.fn(),
  })),
}));

// Access mocked repos from the service instance:
const repo = (service as unknown as { someRepo: Record<string, ReturnType<typeof vi.fn>> }).someRepo;
```

**Repository tests** (e.g. `tests/repositories/some.repository.test.ts`):

```typescript
const { mockSend } = vi.hoisted(() => ({ mockSend: vi.fn() }));
vi.mock('../../src/lib/dynamodb', () => ({
  docClient: { send: mockSend },
}));
```

### Test data factories

Use local `make*` functions that accept `Partial<T>` overrides:

```typescript
function makePerson(overrides: Partial<Person> = {}): Person {
  return {
    personId: 'test-id-123',
    firstName: 'John',
    lastName: 'Doe',
    gender: Gender.MALE,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}
```

The shared `makeEvent()` helper for API Gateway events lives in `tests/helpers/test-helpers.ts`.
