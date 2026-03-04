import type { Person, Relationship } from '@cloud-family-tree/shared';
import { Gender, RelationshipType } from '@cloud-family-tree/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotFoundError, ValidationError } from '../../src/middleware/error-handler';
import { PersonService } from '../../src/services/person.service';

// Mock all repositories
vi.mock('../../src/repositories/person.repository', () => ({
  PersonRepository: vi.fn().mockImplementation(function () {
    return {
      findById: vi.fn(),
      findByExactName: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findAll: vi.fn(),
      searchByName: vi.fn(),
    };
  }),
}));

vi.mock('../../src/repositories/relationship.repository', () => ({
  RelationshipRepository: vi.fn().mockImplementation(function () {
    return {
      deleteAllForPerson: vi.fn(),
      findByPerson: vi.fn().mockResolvedValue([]),
      findParentsOf: vi.fn().mockResolvedValue([]),
      findChildrenOf: vi.fn().mockResolvedValue([]),
      findSpousesOf: vi.fn().mockResolvedValue([]),
    };
  }),
}));

vi.mock('../../src/repositories/artifact.repository', () => ({
  ArtifactRepository: vi.fn().mockImplementation(function () {
    return {
      deleteAllForPerson: vi.fn(),
    };
  }),
}));

vi.mock('../../src/repositories/entry.repository', () => ({
  EntryRepository: vi.fn().mockImplementation(function () {
    return {
      deleteAllForPerson: vi.fn(),
    };
  }),
}));

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

describe('PersonService', () => {
  let service: PersonService;
  let personRepo: ReturnType<typeof vi.fn>;
  let relationshipRepo: ReturnType<typeof vi.fn>;
  let artifactRepo: ReturnType<typeof vi.fn>;
  let entryRepo: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new PersonService();
    personRepo = (service as unknown as { personRepo: Record<string, ReturnType<typeof vi.fn>> })
      .personRepo;
    relationshipRepo = (
      service as unknown as { relationshipRepo: Record<string, ReturnType<typeof vi.fn>> }
    ).relationshipRepo;
    artifactRepo = (
      service as unknown as { artifactRepo: Record<string, ReturnType<typeof vi.fn>> }
    ).artifactRepo;
    entryRepo = (service as unknown as { entryRepo: Record<string, ReturnType<typeof vi.fn>> })
      .entryRepo;
  });

  describe('create', () => {
    it('creates a person with valid input', async () => {
      personRepo.create.mockResolvedValue(undefined);

      const result = await service.create({
        firstName: 'John',
        lastName: 'Doe',
        gender: Gender.MALE,
      });

      expect(result.firstName).toBe('John');
      expect(result.lastName).toBe('Doe');
      expect(result.gender).toBe(Gender.MALE);
      expect(result.personId).toBeDefined();
      expect(result.createdAt).toBeDefined();
      expect(personRepo.create).toHaveBeenCalledOnce();
    });

    it('throws ValidationError for empty firstName', async () => {
      await expect(
        service.create({ firstName: '', lastName: 'Doe', gender: Gender.MALE }),
      ).rejects.toThrow(ValidationError);
    });

    it('throws ValidationError for invalid gender', async () => {
      await expect(
        service.create({ firstName: 'John', lastName: 'Doe', gender: 'INVALID' as Gender }),
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('getById', () => {
    it('returns person when found', async () => {
      const person = makePerson();
      personRepo.findById.mockResolvedValue(person);

      const result = await service.getById('test-id-123');
      expect(result).toEqual(person);
    });

    it('throws NotFoundError when not found', async () => {
      personRepo.findById.mockResolvedValue(null);
      await expect(service.getById('nonexistent')).rejects.toThrow(NotFoundError);
    });
  });

  describe('update', () => {
    it('updates an existing person', async () => {
      const existing = makePerson();
      personRepo.findById.mockResolvedValue(existing);
      personRepo.update.mockResolvedValue(undefined);
      personRepo.findById.mockResolvedValue({ ...existing, firstName: 'Jane' });

      const result = await service.update('test-id-123', { firstName: 'Jane' });
      expect(result.firstName).toBe('Jane');
      expect(personRepo.update).toHaveBeenCalledOnce();
    });

    it('throws NotFoundError for non-existent person', async () => {
      personRepo.findById.mockResolvedValue(null);
      await expect(service.update('nonexistent', { firstName: 'Jane' })).rejects.toThrow(
        NotFoundError,
      );
    });
  });

  describe('delete', () => {
    it('deletes person and cascades to relationships, artifacts, and entries', async () => {
      personRepo.findById.mockResolvedValue(makePerson());
      personRepo.delete.mockResolvedValue(undefined);
      relationshipRepo.deleteAllForPerson.mockResolvedValue(undefined);
      artifactRepo.deleteAllForPerson.mockResolvedValue(undefined);
      entryRepo.deleteAllForPerson.mockResolvedValue(undefined);

      await service.delete('test-id-123');

      expect(relationshipRepo.deleteAllForPerson).toHaveBeenCalledWith('test-id-123');
      expect(artifactRepo.deleteAllForPerson).toHaveBeenCalledWith('test-id-123');
      expect(entryRepo.deleteAllForPerson).toHaveBeenCalledWith('test-id-123');
      expect(personRepo.delete).toHaveBeenCalledWith('test-id-123');
    });

    it('does nothing for non-existent person', async () => {
      personRepo.findById.mockResolvedValue(null);
      await service.delete('nonexistent');
      expect(personRepo.delete).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('returns paginated results', async () => {
      personRepo.findAll.mockResolvedValue({
        items: [makePerson()],
        lastEvaluatedKey: undefined,
      });

      const result = await service.list();
      expect(result.items).toHaveLength(1);
      expect(result.count).toBe(1);
      expect(result.lastEvaluatedKey).toBeUndefined();
    });

    it('caps limit to PAGINATION_MAX_LIMIT', async () => {
      personRepo.findAll.mockResolvedValue({ items: [], lastEvaluatedKey: undefined });

      await service.list(5000);
      expect(personRepo.findAll).toHaveBeenCalledWith(1000, undefined);
    });
  });

  describe('getAncestors', () => {
    const PERSON1_ID = '11111111-1111-4111-8111-111111111111';
    const PERSON2_ID = '22222222-2222-4222-8222-222222222222';
    const PERSON3_ID = '33333333-3333-4333-8333-333333333333';

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

    it('traverses parent chain recursively', async () => {
      const parent = makePerson({ personId: PERSON1_ID });
      const grandparent = makePerson({ personId: PERSON2_ID });

      relationshipRepo.findParentsOf.mockImplementation((id: string) => {
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
      relationshipRepo.findParentsOf.mockImplementation((id: string) => {
        if (id === PERSON3_ID)
          return Promise.resolve([makeRel({ person1Id: PERSON1_ID, person2Id: PERSON3_ID })]);
        if (id === PERSON1_ID)
          return Promise.resolve([makeRel({ person1Id: PERSON2_ID, person2Id: PERSON1_ID })]);
        return Promise.resolve([]);
      });

      personRepo.findById.mockImplementation((id: string) => Promise.resolve(makePerson({ personId: id })));

      const ancestors = await service.getAncestors(PERSON3_ID, 1);
      expect(ancestors).toHaveLength(1);
    });
  });

  describe('getDescendants', () => {
    const PERSON1_ID = '11111111-1111-4111-8111-111111111111';
    const PERSON2_ID = '22222222-2222-4222-8222-222222222222';
    const PERSON3_ID = '33333333-3333-4333-8333-333333333333';

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

    it('traverses child chain recursively', async () => {
      relationshipRepo.findChildrenOf.mockImplementation((id: string) => {
        if (id === PERSON1_ID)
          return Promise.resolve([makeRel({ person1Id: PERSON1_ID, person2Id: PERSON2_ID })]);
        if (id === PERSON2_ID)
          return Promise.resolve([makeRel({ person1Id: PERSON2_ID, person2Id: PERSON3_ID })]);
        return Promise.resolve([]);
      });

      personRepo.findById.mockImplementation((id: string) => Promise.resolve(makePerson({ personId: id })));

      const descendants = await service.getDescendants(PERSON1_ID);
      expect(descendants).toHaveLength(2);
    });
  });
});
