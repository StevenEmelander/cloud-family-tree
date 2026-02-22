import { Gender, RelationshipType } from '@cloud-family-tree/shared';
import type { Person, Relationship } from '@cloud-family-tree/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GedcomExportService } from '../../src/gedcom/export.service';

vi.mock('../../src/repositories/person.repository', () => ({
  PersonRepository: vi.fn().mockImplementation(() => ({
    iterateAll: vi.fn(),
  })),
}));

vi.mock('../../src/repositories/relationship.repository', () => ({
  RelationshipRepository: vi.fn().mockImplementation(() => ({
    findByPerson: vi.fn(),
  })),
}));

function makePerson(overrides: Partial<Person> = {}): Person {
  return {
    personId: 'ind-1',
    firstName: 'John',
    lastName: 'Doe',
    gender: Gender.MALE,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('GedcomExportService', () => {
  let service: GedcomExportService;
  let personRepo: Record<string, ReturnType<typeof vi.fn>>;
  let relationshipRepo: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new GedcomExportService();
    personRepo = (service as unknown as { personRepo: typeof personRepo })
      .personRepo;
    relationshipRepo = (service as unknown as { relationshipRepo: typeof relationshipRepo })
      .relationshipRepo;
  });

  it('exports empty tree', async () => {
    personRepo.iterateAll.mockImplementation(async function* () {
      // yield nothing
    });

    const result = await service.export();
    expect(result.peopleExported).toBe(0);
    expect(result.relationshipsExported).toBe(0);
    expect(result.gedcomContent).toContain('0 HEAD');
    expect(result.gedcomContent).toContain('0 TRLR');
  });

  it('exports people with GEDCOM format', async () => {
    const john = makePerson({
      personId: 'ind-1',
      firstName: 'John',
      lastName: 'Doe',
      gender: Gender.MALE,
      birthDate: '1960-03-15',
      birthPlace: 'Springfield, IL',
    });

    personRepo.iterateAll.mockImplementation(async function* () {
      yield [john];
    });
    relationshipRepo.findByPerson.mockResolvedValue([]);

    const result = await service.export();
    expect(result.peopleExported).toBe(1);
    expect(result.gedcomContent).toContain('1 NAME John /Doe/');
    expect(result.gedcomContent).toContain('1 SEX M');
    expect(result.gedcomContent).toContain('2 DATE 15 MAR 1960');
    expect(result.gedcomContent).toContain('2 PLAC Springfield, IL');
  });

  it('exports spouse relationships as FAM records', async () => {
    const john = makePerson({ personId: 'ind-1', gender: Gender.MALE });
    const jane = makePerson({
      personId: 'ind-2',
      firstName: 'Jane',
      lastName: 'Smith',
      gender: Gender.FEMALE,
    });

    const spouseRel: Relationship = {
      relationshipId: 'rel-1',
      relationshipType: RelationshipType.SPOUSE,
      person1Id: 'ind-1',
      person2Id: 'ind-2',
      metadata: { marriageDate: '1985-09-10', marriagePlace: 'City Hall' },
      createdAt: '2024-01-01T00:00:00.000Z',
    };

    personRepo.iterateAll.mockImplementation(async function* () {
      yield [john, jane];
    });
    relationshipRepo.findByPerson.mockImplementation((id: string) => {
      if (id === 'ind-1' || id === 'ind-2') return Promise.resolve([spouseRel]);
      return Promise.resolve([]);
    });

    const result = await service.export();
    expect(result.peopleExported).toBe(2);
    expect(result.gedcomContent).toContain('1 HUSB');
    expect(result.gedcomContent).toContain('1 WIFE');
    expect(result.gedcomContent).toContain('1 MARR');
    expect(result.gedcomContent).toContain('2 DATE 10 SEP 1985');
  });

  it('includes GEDC version header', async () => {
    personRepo.iterateAll.mockImplementation(async function* () {
      // empty
    });

    const result = await service.export();
    expect(result.gedcomContent).toContain('2 VERS 5.5.1');
    expect(result.gedcomContent).toContain('2 FORM LINEAGE-LINKED');
    expect(result.gedcomContent).toContain('1 CHAR UTF-8');
  });
});
