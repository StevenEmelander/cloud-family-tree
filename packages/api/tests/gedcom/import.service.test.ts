import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GedcomImportService } from '../../src/gedcom/import.service';

vi.mock('../../src/repositories/person.repository', () => ({
  PersonRepository: vi.fn().mockImplementation(function () { return ({
    batchCreate: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    iterateAll: vi.fn().mockImplementation(async function* () {
      // Empty DB by default — no existing people
    }),
  }); }),
}));

vi.mock('../../src/repositories/relationship.repository', () => ({
  RelationshipRepository: vi.fn().mockImplementation(function () { return ({
    batchCreate: vi.fn().mockResolvedValue(undefined),
    iterateAll: vi.fn().mockImplementation(async function* () {
      // Empty DB by default — no existing relationships
    }),
  }); }),
}));

const MINIMAL_GEDCOM = `0 HEAD
1 SOUR Test
1 GEDC
2 VERS 5.5.1
2 FORM LINEAGE-LINKED
1 CHAR UTF-8
0 @I1@ INDI
1 NAME John /Doe/
1 SEX M
1 BIRT
2 DATE 15 MAR 1960
2 PLAC Springfield, IL
0 @I2@ INDI
1 NAME Jane /Smith/
1 SEX F
1 BIRT
2 DATE 20 JUN 1962
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 MARR
2 DATE 10 SEP 1985
2 PLAC City Hall
0 TRLR`;

const FAMILY_WITH_CHILDREN = `0 HEAD
1 SOUR Test
1 GEDC
2 VERS 5.5.1
2 FORM LINEAGE-LINKED
1 CHAR UTF-8
0 @I1@ INDI
1 NAME Father /Test/
1 SEX M
0 @I2@ INDI
1 NAME Mother /Test/
1 SEX F
0 @I3@ INDI
1 NAME Child /Test/
1 SEX M
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 CHIL @I3@
0 TRLR`;

describe('GedcomImportService', () => {
  let service: GedcomImportService;
  let personRepo: Record<string, ReturnType<typeof vi.fn>>;
  let relationshipRepo: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new GedcomImportService();
    personRepo = (service as unknown as { personRepo: typeof personRepo }).personRepo;
    relationshipRepo = (service as unknown as { relationshipRepo: typeof relationshipRepo })
      .relationshipRepo;
  });

  it('imports people from GEDCOM', async () => {
    const result = await service.import(MINIMAL_GEDCOM);

    expect(result.peopleAdded).toBe(2);
    expect(result.errors).toHaveLength(0);
    expect(personRepo.batchCreate).toHaveBeenCalledOnce();

    const people = personRepo.batchCreate.mock.calls[0][0];
    expect(people).toHaveLength(2);

    const john = people.find((i: { firstName: string }) => i.firstName === 'John');
    expect(john).toBeDefined();
    expect(john.lastName).toBe('Doe');
    expect(john.gender).toBe('MALE');
    expect(john.birthDate).toBe('1960-03-15');
    expect(john.birthPlace).toBe('Springfield, IL');
  });

  it('imports spouse relationships', async () => {
    const result = await service.import(MINIMAL_GEDCOM);

    expect(result.relationshipsAdded).toBe(1);
    expect(relationshipRepo.batchCreate).toHaveBeenCalledOnce();

    const rels = relationshipRepo.batchCreate.mock.calls[0][0];
    expect(rels).toHaveLength(1);
    expect(rels[0].relationshipType).toBe('SPOUSE');
    expect(rels[0].metadata?.marriageDate).toBe('1985-09-10');
    expect(rels[0].metadata?.marriagePlace).toBe('City Hall');
  });

  it('imports parent-child relationships', async () => {
    const result = await service.import(FAMILY_WITH_CHILDREN);

    expect(result.peopleAdded).toBe(3);
    // 1 spouse + 2 parent-child (father->child, mother->child)
    expect(result.relationshipsAdded).toBe(3);

    const rels = relationshipRepo.batchCreate.mock.calls[0][0];
    const parentChildRels = rels.filter(
      (r: { relationshipType: string }) => r.relationshipType === 'PARENT_CHILD',
    );
    expect(parentChildRels).toHaveLength(2);
  });

  it('handles empty GEDCOM gracefully', async () => {
    const empty = `0 HEAD
1 SOUR Test
1 GEDC
2 VERS 5.5.1
2 FORM LINEAGE-LINKED
1 CHAR UTF-8
0 TRLR`;

    const result = await service.import(empty);
    expect(result.peopleAdded).toBe(0);
    expect(result.relationshipsAdded).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it('returns zero photos added', async () => {
    const result = await service.import(MINIMAL_GEDCOM);
    expect(result.photosAdded).toBe(0);
  });

  it('handles ABT/AFT date prefixes', async () => {
    const gedcom = `0 HEAD
1 SOUR Test
1 GEDC
2 VERS 5.5.1
2 FORM LINEAGE-LINKED
1 CHAR UTF-8
0 @I1@ INDI
1 NAME John /Doe/
1 SEX M
1 BIRT
2 DATE ABT 1715
0 @I2@ INDI
1 NAME Jane /Doe/
1 SEX F
1 BIRT
2 DATE AFT 1970
0 TRLR`;

    const result = await service.import(gedcom);
    expect(result.peopleAdded).toBe(2);
    expect(result.errors).toHaveLength(0);

    const people = personRepo.batchCreate.mock.calls[0][0];
    expect(people[0].birthDate).toBe('1715');
    expect(people[0].birthDateQualifier).toBe('ABT');
    expect(people[1].birthDate).toBe('1970');
    expect(people[1].birthDateQualifier).toBe('AFT');
  });
});
