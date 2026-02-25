import type { Person, Relationship } from '@cloud-family-tree/shared';
import { Gender, RelationshipType } from '@cloud-family-tree/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotFoundError, ValidationError } from '../../src/middleware/error-handler';
import { RelationshipService } from '../../src/services/relationship.service';

vi.mock('../../src/repositories/relationship.repository', () => ({
  RelationshipRepository: vi.fn().mockImplementation(function () { return ({
    findById: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
    findByPerson: vi.fn(),
    findParentsOf: vi.fn(),
    findChildrenOf: vi.fn(),
  }); }),
}));

vi.mock('../../src/repositories/person.repository', () => ({
  PersonRepository: vi.fn().mockImplementation(function () { return ({
    findById: vi.fn(),
    findByIdForTree: vi.fn(),
  }); }),
}));

const PERSON1_ID = '11111111-1111-4111-8111-111111111111';
const PERSON2_ID = '22222222-2222-4222-8222-222222222222';
const PERSON3_ID = '33333333-3333-4333-8333-333333333333';

function makePerson(id: string): Person {
  return {
    personId: id,
    firstName: 'Test',
    lastName: 'Person',
    gender: Gender.UNKNOWN,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  };
}

function makeRel(overrides: Partial<Relationship> = {}): Relationship {
  return {
    relationshipId: 'rel-123',
    relationshipType: RelationshipType.PARENT_CHILD,
    person1Id: PERSON1_ID,
    person2Id: PERSON2_ID,
    createdAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('RelationshipService', () => {
  let service: RelationshipService;
  let relRepo: Record<string, ReturnType<typeof vi.fn>>;
  let personRepo: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new RelationshipService();
    relRepo = (service as unknown as { relationshipRepo: typeof relRepo }).relationshipRepo;
    personRepo = (service as unknown as { personRepo: typeof personRepo }).personRepo;
  });

  describe('create', () => {
    it('creates a relationship between two existing persons', async () => {
      personRepo.findById.mockImplementation((id: string) => Promise.resolve(makePerson(id)));
      relRepo.findByPerson.mockResolvedValue([]);
      relRepo.findParentsOf.mockResolvedValue([]);
      relRepo.create.mockResolvedValue(undefined);

      const result = await service.create({
        relationshipType: RelationshipType.PARENT_CHILD,
        person1Id: PERSON1_ID,
        person2Id: PERSON2_ID,
      });

      expect(result.relationshipType).toBe(RelationshipType.PARENT_CHILD);
      expect(result.person1Id).toBe(PERSON1_ID);
      expect(result.person2Id).toBe(PERSON2_ID);
      expect(relRepo.create).toHaveBeenCalledOnce();
    });

    it('throws ValidationError when person1Id equals person2Id', async () => {
      await expect(
        service.create({
          relationshipType: RelationshipType.SPOUSE,
          person1Id: PERSON1_ID,
          person2Id: PERSON1_ID,
        }),
      ).rejects.toThrow(ValidationError);
    });

    it('throws NotFoundError when person1 does not exist', async () => {
      personRepo.findById.mockResolvedValue(null);
      await expect(
        service.create({
          relationshipType: RelationshipType.PARENT_CHILD,
          person1Id: PERSON1_ID,
          person2Id: PERSON2_ID,
        }),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('delete', () => {
    it('deletes an existing relationship', async () => {
      relRepo.findById.mockResolvedValue(makeRel());
      relRepo.delete.mockResolvedValue(undefined);

      await service.delete('rel-123', RelationshipType.PARENT_CHILD);
      expect(relRepo.delete).toHaveBeenCalledWith('rel-123', RelationshipType.PARENT_CHILD);
    });
  });

  describe('getAncestors', () => {
    it('traverses parent chain recursively', async () => {
      const parent = makePerson(PERSON1_ID);
      const grandparent = makePerson(PERSON2_ID);

      relRepo.findParentsOf.mockImplementation((id: string) => {
        if (id === PERSON3_ID)
          return Promise.resolve([makeRel({ person1Id: PERSON1_ID, person2Id: PERSON3_ID })]);
        if (id === PERSON1_ID)
          return Promise.resolve([makeRel({ person1Id: PERSON2_ID, person2Id: PERSON1_ID })]);
        return Promise.resolve([]);
      });

      personRepo.findById.mockImplementation((id: string) => {
        if (id === PERSON1_ID) return Promise.resolve(parent);
        if (id === PERSON2_ID) return Promise.resolve(grandparent);
        return Promise.resolve(null);
      });

      const ancestors = await service.getAncestors(PERSON3_ID);
      expect(ancestors).toHaveLength(2);
      expect(ancestors.map((a) => a.personId)).toContain(PERSON1_ID);
      expect(ancestors.map((a) => a.personId)).toContain(PERSON2_ID);
    });

    it('respects maxDepth', async () => {
      relRepo.findParentsOf.mockImplementation((id: string) => {
        if (id === PERSON3_ID)
          return Promise.resolve([makeRel({ person1Id: PERSON1_ID, person2Id: PERSON3_ID })]);
        if (id === PERSON1_ID)
          return Promise.resolve([makeRel({ person1Id: PERSON2_ID, person2Id: PERSON1_ID })]);
        return Promise.resolve([]);
      });

      personRepo.findById.mockImplementation((id: string) => Promise.resolve(makePerson(id)));

      const ancestors = await service.getAncestors(PERSON3_ID, 1);
      // depth=1 means only traverse 1 level from the start node
      expect(ancestors).toHaveLength(1);
    });
  });

  describe('getDescendants', () => {
    it('traverses child chain recursively', async () => {
      relRepo.findChildrenOf.mockImplementation((id: string) => {
        if (id === PERSON1_ID)
          return Promise.resolve([makeRel({ person1Id: PERSON1_ID, person2Id: PERSON2_ID })]);
        if (id === PERSON2_ID)
          return Promise.resolve([makeRel({ person1Id: PERSON2_ID, person2Id: PERSON3_ID })]);
        return Promise.resolve([]);
      });

      personRepo.findById.mockImplementation((id: string) => Promise.resolve(makePerson(id)));

      const descendants = await service.getDescendants(PERSON1_ID);
      expect(descendants).toHaveLength(2);
    });
  });
});
