import type { Person } from '@cloud-family-tree/shared';
import { Gender } from '@cloud-family-tree/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeEvent } from '../../helpers/test-helpers';

// Mock auth middleware
vi.mock('../../../src/middleware/auth', () => ({
  authorize: vi.fn().mockResolvedValue({ userId: 'admin', email: 'a@b.com', role: 'admins' }),
}));

// Mock person service
const { mockService } = vi.hoisted(() => ({
  mockService: {
    create: vi.fn(),
    getById: vi.fn(),
    list: vi.fn(),
    search: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('../../../src/services/person.service', () => ({
  PersonService: vi.fn().mockImplementation(function () {
    return mockService;
  }),
}));

import { handler as createPerson } from '../../../src/handlers/people/create';
import { handler as deletePerson } from '../../../src/handlers/people/delete';
// Static imports — mocks are guaranteed to be in place before module loads
import { handler as getPerson } from '../../../src/handlers/people/get';
import { handler as listPeople } from '../../../src/handlers/people/list';
import { handler as updatePerson } from '../../../src/handlers/people/update';

const person: Person = {
  personId: 'id-1',
  firstName: 'John',
  lastName: 'Doe',
  gender: Gender.MALE,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

describe('Person handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /people/:id', () => {
    it('returns person by id', async () => {
      mockService.getById.mockResolvedValue(person);

      const event = makeEvent({ pathParameters: { id: 'id-1' } });
      const result = await getPerson(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.data.firstName).toBe('John');
      expect(mockService.getById).toHaveBeenCalledWith('id-1');
    });

    it('returns error when id is missing', async () => {
      const event = makeEvent({ pathParameters: null });
      const result = await getPerson(event);

      expect(result.statusCode).toBe(500);
    });

    it('returns 404 when person not found', async () => {
      const { NotFoundError } = await import('../../../src/middleware/error-handler');
      mockService.getById.mockRejectedValue(new NotFoundError('Person', 'xyz'));

      const event = makeEvent({ pathParameters: { id: 'xyz' } });
      const result = await getPerson(event);

      expect(result.statusCode).toBe(404);
    });
  });

  describe('GET /people', () => {
    it('lists all people without search', async () => {
      mockService.list.mockResolvedValue({ items: [person], count: 1 });

      const event = makeEvent({ queryStringParameters: null });
      const result = await listPeople(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.data.items).toHaveLength(1);
      expect(mockService.list).toHaveBeenCalled();
    });

    it('searches people when search param provided', async () => {
      mockService.search.mockResolvedValue({ items: [person], count: 1 });

      const event = makeEvent({ queryStringParameters: { search: 'Doe' } });
      const result = await listPeople(event);

      expect(result.statusCode).toBe(200);
      expect(mockService.search).toHaveBeenCalledWith('Doe', undefined, undefined);
    });

    it('passes limit and cursor params', async () => {
      mockService.list.mockResolvedValue({ items: [], count: 0 });

      const event = makeEvent({
        queryStringParameters: { limit: '50', cursor: 'abc123' },
      });
      await listPeople(event);

      expect(mockService.list).toHaveBeenCalledWith(50, 'abc123');
    });
  });

  describe('POST /people', () => {
    it('creates person and returns 201', async () => {
      mockService.create.mockResolvedValue(person);

      const event = makeEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ firstName: 'John', lastName: 'Doe', gender: 'MALE' }),
      });
      const result = await createPerson(event);

      expect(result.statusCode).toBe(201);
      const body = JSON.parse(result.body);
      expect(body.data.firstName).toBe('John');
    });

    it('returns 400 for validation errors', async () => {
      const { ValidationError } = await import('../../../src/middleware/error-handler');
      mockService.create.mockRejectedValue(new ValidationError(['firstName is required']));

      const event = makeEvent({
        body: JSON.stringify({ gender: 'MALE' }),
      });
      const result = await createPerson(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.errors).toContain('firstName is required');
    });
  });

  describe('PUT /people/:id', () => {
    it('updates person', async () => {
      mockService.update.mockResolvedValue({ ...person, firstName: 'Jane' });

      const event = makeEvent({
        pathParameters: { id: 'id-1' },
        body: JSON.stringify({ firstName: 'Jane' }),
      });
      const result = await updatePerson(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.data.firstName).toBe('Jane');
    });
  });

  describe('DELETE /people/:id', () => {
    it('deletes person and returns 204', async () => {
      mockService.delete.mockResolvedValue(undefined);

      const event = makeEvent({ pathParameters: { id: 'id-1' } });
      const result = await deletePerson(event);

      expect(result.statusCode).toBe(204);
      expect(mockService.delete).toHaveBeenCalledWith('id-1');
    });
  });
});
