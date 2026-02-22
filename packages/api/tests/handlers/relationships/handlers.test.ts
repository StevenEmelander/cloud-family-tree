import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeEvent } from '../../../src/handlers/test-helpers';

// Mock auth middleware
vi.mock('../../../src/middleware/auth', () => ({
  authorize: vi.fn().mockResolvedValue({ userId: 'admin', email: 'a@b.com', role: 'admins' }),
}));

// Mock relationship service
const { mockService } = vi.hoisted(() => ({
  mockService: {
    create: vi.fn(),
    delete: vi.fn(),
    listByPerson: vi.fn(),
    getAncestors: vi.fn(),
    getDescendants: vi.fn(),
  },
}));

vi.mock('../../../src/services/relationship.service', () => ({
  RelationshipService: vi.fn().mockImplementation(() => mockService),
}));

describe('Relationship handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /relationships', () => {
    it('creates a relationship', async () => {
      const rel = {
        relationshipId: 'rel-1',
        person1Id: 'p1',
        person2Id: 'p2',
        relationshipType: 'PARENT_CHILD',
      };
      mockService.create.mockResolvedValue(rel);
      const { handler } = await import('../../../src/handlers/relationships/create');

      const event = makeEvent({
        body: JSON.stringify({
          person1Id: 'p1',
          person2Id: 'p2',
          relationshipType: 'PARENT_CHILD',
        }),
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(201);
      const body = JSON.parse(result.body);
      expect(body.data.relationshipId).toBe('rel-1');
    });
  });

  describe('DELETE /relationships/:id', () => {
    it('deletes a relationship', async () => {
      mockService.delete.mockResolvedValue(undefined);
      const { handler } = await import('../../../src/handlers/relationships/delete');

      const event = makeEvent({
        pathParameters: { id: 'rel-1' },
        queryStringParameters: { type: 'PARENT_CHILD' },
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(204);
      expect(mockService.delete).toHaveBeenCalledWith('rel-1', 'PARENT_CHILD');
    });
  });

  describe('GET /people/:id/relationships', () => {
    it('lists relationships for a person', async () => {
      mockService.listByPerson.mockResolvedValue([
        { relationshipId: 'r1', relationshipType: 'SPOUSE' },
      ]);
      const { handler } = await import('../../../src/handlers/relationships/list-by-person');

      const event = makeEvent({
        pathParameters: { id: 'person-1' },
        queryStringParameters: null,
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.data.items).toHaveLength(1);
    });

    it('returns ancestors when view=ancestors', async () => {
      mockService.getAncestors.mockResolvedValue([
        { personId: 'anc-1', firstName: 'Grandpa', lastName: 'Doe' },
      ]);
      const { handler } = await import('../../../src/handlers/relationships/list-by-person');

      const event = makeEvent({
        pathParameters: { id: 'person-1' },
        queryStringParameters: { view: 'ancestors' },
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.data.items).toHaveLength(1);
      expect(mockService.getAncestors).toHaveBeenCalledWith('person-1');
    });

    it('returns descendants when view=descendants', async () => {
      mockService.getDescendants.mockResolvedValue([
        { personId: 'desc-1', firstName: 'Child', lastName: 'Doe' },
      ]);
      const { handler } = await import('../../../src/handlers/relationships/list-by-person');

      const event = makeEvent({
        pathParameters: { id: 'person-1' },
        queryStringParameters: { view: 'descendants' },
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      expect(mockService.getDescendants).toHaveBeenCalledWith('person-1');
    });

    it('returns error when id is missing', async () => {
      const { handler } = await import('../../../src/handlers/relationships/list-by-person');

      const event = makeEvent({
        pathParameters: null,
        queryStringParameters: null,
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(500);
    });
  });
});
