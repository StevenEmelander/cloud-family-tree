import type { CreateRelationshipInput, Person, Relationship } from '@cloud-family-tree/shared';
import { API_CONFIG, createRelationshipSchema, isoNow, validate } from '@cloud-family-tree/shared';
import { v4 as uuid } from 'uuid';
import { NotFoundError, ValidationError } from '../middleware/error-handler';
import { PersonRepository } from '../repositories/person.repository';
import { RelationshipRepository } from '../repositories/relationship.repository';
export class RelationshipService {
  private readonly relationshipRepo = new RelationshipRepository();
  private readonly personRepo = new PersonRepository();

  async create(input: CreateRelationshipInput): Promise<Relationship> {
    const result = validate(createRelationshipSchema, input);
    if (!result.success) throw new ValidationError(result.errors);

    const data = result.data;

    if (data.person1Id === data.person2Id) {
      throw new ValidationError(['person1Id and person2Id cannot be the same']);
    }

    // Verify both persons exist
    const [person1, person2] = await Promise.all([
      this.personRepo.findById(data.person1Id),
      this.personRepo.findById(data.person2Id),
    ]);
    if (!person1) throw new NotFoundError('Person', data.person1Id);
    if (!person2) throw new NotFoundError('Person', data.person2Id);

    // Prevent duplicate relationships
    const existingRels = await this.relationshipRepo.findByPerson(data.person1Id);
    const isDuplicate = existingRels.some((r) => {
      if (r.relationshipType !== data.relationshipType) return false;
      if (data.relationshipType === 'SPOUSE') {
        // SPOUSE is bidirectional
        return (
          (r.person1Id === data.person1Id && r.person2Id === data.person2Id) ||
          (r.person1Id === data.person2Id && r.person2Id === data.person1Id)
        );
      }
      // PARENT_CHILD is directional
      return r.person1Id === data.person1Id && r.person2Id === data.person2Id;
    });
    if (isDuplicate) {
      throw new ValidationError(['This relationship already exists']);
    }

    // Max 2 parents per child
    if (data.relationshipType === 'PARENT_CHILD') {
      const existingParents = await this.relationshipRepo.findParentsOf(data.person2Id);
      if (existingParents.length >= 2) {
        throw new ValidationError(['A person cannot have more than 2 parents']);
      }
    }

    const relationship: Relationship = {
      relationshipId: uuid(),
      ...data,
      createdAt: isoNow(),
    };

    await this.relationshipRepo.create(relationship);

    return relationship;
  }

  async updateMetadata(
    relationshipId: string,
    metadata: Record<string, unknown>,
  ): Promise<Relationship> {
    // Find the relationship across types
    let rel: Relationship | null = null;
    for (const type of ['SPOUSE', 'PARENT_CHILD']) {
      rel = await this.relationshipRepo.findById(relationshipId, type);
      if (rel) break;
    }
    if (!rel) throw new NotFoundError('Relationship', relationshipId);

    if (rel.relationshipType !== 'SPOUSE') {
      throw new ValidationError(['Only spouse relationships can have metadata']);
    }

    // Merge metadata and re-create (DynamoDB composite keys make in-place update complex)
    const updatedRel: Relationship = {
      ...rel,
      metadata: { ...rel.metadata, ...metadata },
    };
    await this.relationshipRepo.delete(rel.relationshipId, rel.relationshipType);
    await this.relationshipRepo.create(updatedRel);
    return updatedRel;
  }

  async delete(relationshipId: string, relationshipType: string): Promise<void> {
    const existing = await this.relationshipRepo.findById(relationshipId, relationshipType);
    if (!existing) return; // Already deleted — nothing to do
    await this.relationshipRepo.delete(relationshipId, relationshipType);
  }

  async listByPerson(personId: string): Promise<Relationship[]> {
    // Verify person exists
    const person = await this.personRepo.findById(personId);
    if (!person) throw new NotFoundError('Person', personId);
    return this.relationshipRepo.findByPerson(personId);
  }

  async getPersonDetail(personId: string): Promise<{
    person: Person;
    relationships: Relationship[];
    otherParent: Record<string, string>;
    spouseParents: Record<string, string[]>;
    parentMarriages: Record<string, { marriageDate?: string; divorceDate?: string }>;
    relatedPeople: Record<
      string,
      {
        name: string;
        gender: string;
        birthDate?: string;
        birthDateQualifier?: string;
        deathDate?: string;
        deathDateQualifier?: string;
      }
    >;
  }> {
    const person = await this.personRepo.findById(personId);
    if (!person) throw new NotFoundError('Person', personId);

    const relationships = await this.relationshipRepo.findByPerson(personId);

    // Collect all related person IDs
    const relatedIds = new Set<string>();
    for (const r of relationships) {
      if (r.person1Id !== personId) relatedIds.add(r.person1Id);
      if (r.person2Id !== personId) relatedIds.add(r.person2Id);
    }

    const childIds = relationships
      .filter((r) => r.relationshipType === 'PARENT_CHILD' && r.person1Id === personId)
      .map((r) => r.person2Id);
    const spouseIds = new Set(
      relationships
        .filter((r) => r.relationshipType === 'SPOUSE')
        .map((r) => (r.person1Id === personId ? r.person2Id : r.person1Id)),
    );

    // For each spouse, find their parents
    const spouseParents: Record<string, string[]> = {};
    if (spouseIds.size > 0) {
      await Promise.all(
        [...spouseIds].map(async (spouseId) => {
          const parentRels = await this.relationshipRepo.findParentsOf(spouseId);
          const parentIds = parentRels.map((r) => r.person1Id);
          if (parentIds.length > 0) {
            spouseParents[spouseId] = parentIds;
            for (const pid of parentIds) relatedIds.add(pid);
          }
        }),
      );
    }

    // Batch-fetch related people (parallel)
    const relatedPeople: Record<
      string,
      {
        name: string;
        gender: string;
        birthDate?: string;
        birthDateQualifier?: string;
        deathDate?: string;
        deathDateQualifier?: string;
      }
    > = {};
    await Promise.all(
      [...relatedIds].map(async (relId) => {
        const p = await this.personRepo.findById(relId);
        if (p) {
          const name = `${p.firstName}${p.middleName ? ` ${p.middleName}` : ''} ${p.lastName}`;
          relatedPeople[relId] = {
            name,
            gender: p.gender,
            birthDate: p.birthDate,
            birthDateQualifier: p.birthDateQualifier,
            deathDate: p.deathDate,
            deathDateQualifier: p.deathDateQualifier,
          };
        }
      }),
    );

    // Filter out relationships that reference people not found in DB
    const visiblePeople = new Set(Object.keys(relatedPeople));
    visiblePeople.add(personId); // Focal person is always visible (they passed the get check)
    const visibleRelationships = relationships.filter(
      (r) => visiblePeople.has(r.person1Id) && visiblePeople.has(r.person2Id),
    );

    // For each visible child, find which spouse is also their parent
    const otherParent: Record<string, string> = {};
    const visibleChildIds = childIds.filter((id) => visiblePeople.has(id));
    if (visibleChildIds.length > 0 && spouseIds.size > 0) {
      await Promise.all(
        visibleChildIds.map(async (childId) => {
          const parentRels = await this.relationshipRepo.findParentsOf(childId);
          for (const rel of parentRels) {
            if (spouseIds.has(rel.person1Id)) {
              otherParent[childId] = rel.person1Id;
              break;
            }
          }
        }),
      );
    }

    // Filter spouseParents to only include visible people
    const visibleSpouseParents: Record<string, string[]> = {};
    for (const [spouseId, pids] of Object.entries(spouseParents)) {
      if (!visiblePeople.has(spouseId)) continue;
      const visiblePids = pids.filter((pid) => visiblePeople.has(pid));
      if (visiblePids.length > 0) {
        visibleSpouseParents[spouseId] = visiblePids;
      }
    }

    // Find marriage info for parent pairs (keyed by the child they belong to)
    // For focal person's parents: key is personId
    // For spouse's parents: key is spouseId
    const parentMarriages: Record<string, { marriageDate?: string; divorceDate?: string }> = {};
    const parentIdSets: { childId: string; parentIds: string[] }[] = [];

    // Focal person's parents
    const focalParentIds = visibleRelationships
      .filter((r) => r.relationshipType === 'PARENT_CHILD' && r.person2Id === personId)
      .map((r) => r.person1Id);
    if (focalParentIds.length >= 2) {
      parentIdSets.push({ childId: personId, parentIds: focalParentIds });
    }

    // Spouse parents
    for (const [spouseId, pids] of Object.entries(visibleSpouseParents)) {
      if (pids.length >= 2) {
        parentIdSets.push({ childId: spouseId, parentIds: pids });
      }
    }

    if (parentIdSets.length > 0) {
      await Promise.all(
        parentIdSets.map(async ({ childId, parentIds }) => {
          // Find SPOUSE relationship between the first parent and any other parent in the set
          // biome-ignore lint/style/noNonNullAssertion: parentIds always has at least one entry
          const firstParent = parentIds[0]!;
          const spouseRels = await this.relationshipRepo.findSpousesOf(firstParent);
          const parentSet = new Set(parentIds);
          for (const rel of spouseRels) {
            const otherId = rel.person1Id === firstParent ? rel.person2Id : rel.person1Id;
            if (parentSet.has(otherId)) {
              parentMarriages[childId] = {
                marriageDate: rel.metadata?.marriageDate,
                divorceDate: rel.metadata?.divorceDate,
              };
              break;
            }
          }
        }),
      );
    }

    return {
      person,
      relationships: visibleRelationships,
      otherParent,
      spouseParents: visibleSpouseParents,
      parentMarriages,
      relatedPeople,
    };
  }

  async getAncestors(personId: string, maxDepth?: number): Promise<Person[]> {
    const depth = maxDepth || API_CONFIG.MAX_ANCESTOR_DEPTH;
    const visited = new Set<string>();
    const ancestors: Person[] = [];

    const traverse = async (currentId: string, currentDepth: number) => {
      if (currentDepth >= depth || visited.has(currentId)) return;
      visited.add(currentId);

      const parentRels = await this.relationshipRepo.findParentsOf(currentId);
      for (const rel of parentRels) {
        const parentId = rel.person1Id;
        if (!visited.has(parentId)) {
          const parent = await this.personRepo.findById(parentId);
          if (parent) {
            ancestors.push(parent);
            await traverse(parentId, currentDepth + 1);
          }
        }
      }
    };

    await traverse(personId, 0);
    return ancestors;
  }

  async getDescendants(personId: string, maxDepth?: number): Promise<Person[]> {
    const depth = maxDepth || API_CONFIG.MAX_DESCENDANT_DEPTH;
    const visited = new Set<string>();
    const descendants: Person[] = [];

    const traverse = async (currentId: string, currentDepth: number) => {
      if (currentDepth >= depth || visited.has(currentId)) return;
      visited.add(currentId);

      const childRels = await this.relationshipRepo.findChildrenOf(currentId);
      for (const rel of childRels) {
        const childId = rel.person2Id;
        if (!visited.has(childId)) {
          const child = await this.personRepo.findById(childId);
          if (child) {
            descendants.push(child);
            await traverse(childId, currentDepth + 1);
          }
        }
      }
    };

    await traverse(personId, 0);
    return descendants;
  }
}
