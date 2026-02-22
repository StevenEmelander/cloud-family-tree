# Cloud Family Tree

A genealogy platform built as a pnpm monorepo with Turborepo. Deployed to AWS with CDK.

## Quick Reference

```bash
pnpm install          # Install dependencies
pnpm build            # Build all packages (shared → api → web → infrastructure)
pnpm test             # Run all tests (vitest at root, NOT per-package)
pnpm test:coverage    # Run tests with V8 coverage
pnpm lint             # Biome check
pnpm lint:fix         # Biome auto-fix
pnpm format           # Biome format
pnpm typecheck        # TypeScript check all packages via turbo
pnpm dev              # Dev servers (web + any watchers)
```

## Monorepo Structure

| Package | Purpose | Build |
|---------|---------|-------|
| `packages/shared` | Types, zod schemas, constants, utils | `tsc` → `dist/` |
| `packages/api` | Lambda handlers, services, repositories | `tsc` → `dist/` |
| `packages/web` | Next.js 14 static export (App Router) | `next build` → `out/` |
| `packages/infrastructure` | AWS CDK stacks | `tsc` → `dist/` |

**Build order matters:** shared must build before api and web (they import from `@cloud-family-tree/shared`). Turbo handles this via `dependsOn: ["^build"]`.

## Configuration

**`config.ts`** at the repo root is the single file to edit for a new deployment. It contains family name, AWS account/region, admin email, domain settings, and access control. No other file should contain family-specific values.

**All user-facing static text specific to this deployment** (hero copy, CTA wording, descriptions, taglines) must live in `config.ts` — never hardcode family-specific strings in component files. Components should reference `siteConfig.*` for any text that would change between deployments.

## Code Style

- **Biome** for linting and formatting (not ESLint/Prettier)
- Single quotes, always semicolons, trailing commas, 2-space indent, 100-char line width
- `import type { ... }` for type-only imports
- Strict TypeScript: `strict`, `noUnusedLocals`, `noUnusedParameters`, `noUncheckedIndexedAccess`
- CSS Modules for all component styling — no inline styles
- CSS variables defined in `packages/web/src/app/globals.css` with `--color-*` prefix

## Testing

Run with `pnpm test` (vitest at root — no per-package scripts). Tests live in `tests/` at each package root, mirroring `src/`:

```
packages/api/src/services/person.service.ts  →  packages/api/tests/services/person.service.test.ts
```

See `packages/api/CLAUDE.md` for test structure, mocking patterns, and data factory conventions.

## API Architecture

### Handler pattern

Every Lambda handler follows this exact structure:
```typescript
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { authorize } from '../../middleware/auth';
import { errorResponse, successResponse } from '../../middleware/response';
import { SomeService } from '../../services/some.service';

const service = new SomeService(); // Module-scoped singleton

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    await authorize(event, 'read' | 'write' | 'admin');
    const result = await service.method(params);
    return successResponse(200, result);
  } catch (error) {
    return errorResponse(error);
  }
};
```

### Layer architecture

`handlers/` → `services/` → `repositories/` → `lib/` (DynamoDB/S3 clients)

- **Handlers**: Parse event, call authorize, delegate to service, return response
- **Services**: Validate input with zod schemas, business logic, call repositories
- **Repositories**: DynamoDB operations, key construction, pagination

### Error hierarchy

`AppError` → `NotFoundError` (404), `ValidationError` (400), `UnauthorizedError` (401), `ForbiddenError` (403), `ConflictError` (409). Defined in `packages/api/src/middleware/error-handler.ts`.

### Auth levels

- `'read'`: Public when `REQUIRE_AUTH_FOR_READ=false`, otherwise requires any authenticated user
- `'write'`: Requires `editors` or `admins` Cognito group
- `'admin'`: Requires `admins` Cognito group

## DynamoDB

Single-table design with entity prefixes. Key scheme: `PK: PREFIX#id`, `SK: METADATA`. GSIs for access patterns (list by type, search by name). `BaseRepository` in `packages/api/src/repositories/base.repository.ts` provides common operations.

**Key rules:**

- **No `Scan`** — always use `Query` against a PK or GSI. Scans read every item and cost money.
- **Minimize GSIs** — each GSI adds write cost and complexity. Before adding one, check whether an existing GSI or a relationship-based lookup can satisfy the access pattern. New GSIs require CDK changes and a stack deploy.
- **Batch independent reads** — use `Promise.all()` or `BatchGetCommand` instead of sequential awaits.
- **Paginate everything** — list endpoints must accept a cursor and respect `API_CONFIG.MAX_PAGE_SIZE`.
- **Project sparse fields** — use `ProjectionExpression` for list/tree views; skip bio/notes unless the full profile is needed.

See `packages/api/CLAUDE.md` for code examples of each rule.

## Web App

- Next.js 14 with `output: 'export'` (fully static)
- Auth via `amazon-cognito-identity-js` directly (not Amplify)
- API client in `packages/web/src/lib/api.ts` — all calls go through `apiFetch<T>()` with typed returns
- Site config in `packages/web/src/lib/site-config.ts` — imports from root `config.ts`
- All pages use CSS Modules; global variables in `globals.css`

## Infrastructure

- CDK v2 with TypeScript
- Stacks: Database, Auth, Storage, Api, Hosting (conditional on domain), Monitoring
- Lambdas: Node.js 22, ARM64 (Graviton), esbuild bundling via `NodejsFunction`
- External modules: `['@aws-sdk/*']` (provided by Lambda runtime)
- **Before adding any AWS resource**, read `packages/infrastructure/CLAUDE.md` — it covers cost considerations, right-sizing, log retention, and the no-baseline-cost design goal.
