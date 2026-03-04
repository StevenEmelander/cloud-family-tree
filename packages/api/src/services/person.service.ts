import type {
  CreatePersonInput,
  PaginatedResponse,
  Person,
  Relationship,
  UpdatePersonInput,
} from '@cloud-family-tree/shared';
import {
  API_CONFIG,
  createPersonSchema,
  isoNow,
  updatePersonSchema,
  validate,
} from '@cloud-family-tree/shared';
import { decodeCursor, encodeCursor } from '../lib/cursor';
import { applyClears } from '../lib/service.utils';
import { v4 as uuid } from 'uuid';
import { ConflictError, NotFoundError, ValidationError } from '../middleware/error-handler';
import { ArtifactRepository } from '../repositories/artifact.repository';
import { EntryRepository } from '../repositories/entry.repository';
import { PersonRepository } from '../repositories/person.repository';
import { RelationshipRepository } from '../repositories/relationship.repository';

export class PersonService {
  private readonly personRepo = new PersonRepository();
  private readonly relationshipRepo = new RelationshipRepository();
  private readonly artifactRepo = new ArtifactRepository();
  private readonly entryRepo = new EntryRepository();

  async create(input: CreatePersonInput): Promise<Person> {
    const result = validate(createPersonSchema, input);
    if (!result.success) throw new ValidationError(result.errors);

    const data = result.data;

    // Check for duplicate (same firstName + lastName + birthDate)
    const nameMatches = await this.personRepo.findByExactName(data.firstName, data.lastName);
    const duplicate = nameMatches.find((m) => (m.birthDate ?? null) === (data.birthDate ?? null));
    if (duplicate) {
      throw new ConflictError(
        `${data.firstName} ${data.lastName}${data.birthDate ? ` (born ${data.birthDate})` : ''} already exists`,
      );
    }

    const now = isoNow();
    const person: Person = {
      personId: uuid(),
      ...data,
      createdAt: now,
      updatedAt: now,
    };

    await this.personRepo.create(person);
    return person;
  }

  async getById(id: string): Promise<Person> {
    const person = await this.personRepo.findById(id);
    if (!person) throw new NotFoundError('Person', id);
    return person;
  }

  async update(id: string, input: UpdatePersonInput): Promise<Person> {
    const result = validate(updatePersonSchema, input);
    if (!result.success) throw new ValidationError(result.errors);

    await this.getById(id); // verify exists

    // Convert undefined values from cleared fields to null so DynamoDB removes them
    const updates = applyClears(input as Record<string, unknown>, result.data as Record<string, unknown>, [
      'middleName',
      'birthDate',
      'birthPlace',
      'deathDate',
      'deathPlace',
      'burialPlace',
      'biography',
    ]);

    await this.personRepo.update(id, updates as Partial<Person>);

    return this.getById(id);
  }

  async delete(id: string): Promise<void> {
    const existing = await this.personRepo.findById(id);
    if (!existing) return; // Already deleted — nothing to do
    // Cascade: delete relationships, artifacts, and entries for this person
    await this.relationshipRepo.deleteAllForPerson(id);
    await this.artifactRepo.deleteAllForPerson(id);
    await this.entryRepo.deleteAllForPerson(id);
    await this.personRepo.delete(id);
  }

  async list(limit?: number, cursor?: string): Promise<PaginatedResponse<Person>> {
    const effectiveLimit = Math.min(
      limit || API_CONFIG.PAGINATION_DEFAULT_LIMIT,
      API_CONFIG.PAGINATION_MAX_LIMIT,
    );
    // Decode HMAC-signed cursor back to plain base64 for the repository
    const repoCursor = cursor
      ? Buffer.from(JSON.stringify(decodeCursor(cursor))).toString('base64')
      : undefined;
    const result = await this.personRepo.findAll(effectiveLimit, repoCursor);
    return {
      items: result.items,
      count: result.items.length,
      lastEvaluatedKey: result.lastEvaluatedKey
        ? encodeCursor(result.lastEvaluatedKey as Record<string, unknown>)
        : undefined,
    };
  }

  async search(
    namePrefix: string,
    limit?: number,
    cursor?: string,
  ): Promise<PaginatedResponse<Person>> {
    const effectiveLimit = Math.min(
      limit || API_CONFIG.PAGINATION_DEFAULT_LIMIT,
      API_CONFIG.PAGINATION_MAX_LIMIT,
    );
    // Decode HMAC-signed cursor back to plain base64 for the repository
    const repoCursor = cursor
      ? Buffer.from(JSON.stringify(decodeCursor(cursor))).toString('base64')
      : undefined;
    const result = await this.personRepo.searchByName(namePrefix, effectiveLimit, repoCursor);
    return {
      items: result.items,
      count: result.items.length,
      lastEvaluatedKey: result.lastEvaluatedKey
        ? encodeCursor(result.lastEvaluatedKey as Record<string, unknown>)
        : undefined,
    };
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
    visiblePeople.add(personId);
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

    // Find marriage info for parent pairs
    const parentMarriages: Record<string, { marriageDate?: string; divorceDate?: string }> = {};
    const parentIdSets: { childId: string; parentIds: string[] }[] = [];

    const focalParentIds = visibleRelationships
      .filter((r) => r.relationshipType === 'PARENT_CHILD' && r.person2Id === personId)
      .map((r) => r.person1Id);
    if (focalParentIds.length >= 2) {
      parentIdSets.push({ childId: personId, parentIds: focalParentIds });
    }

    for (const [spouseId, pids] of Object.entries(visibleSpouseParents)) {
      if (pids.length >= 2) {
        parentIdSets.push({ childId: spouseId, parentIds: pids });
      }
    }

    if (parentIdSets.length > 0) {
      await Promise.all(
        parentIdSets.map(async ({ childId, parentIds }) => {
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

    let currentIds = [personId];
    visited.add(personId);

    for (let d = 0; d < depth && currentIds.length > 0; d++) {
      const parentRelArrays = await Promise.all(
        currentIds.map((id) => this.relationshipRepo.findParentsOf(id)),
      );

      const parentIds: string[] = [];
      for (const rels of parentRelArrays) {
        for (const rel of rels) {
          if (!visited.has(rel.person1Id)) {
            visited.add(rel.person1Id);
            parentIds.push(rel.person1Id);
          }
        }
      }

      if (parentIds.length === 0) break;

      const parents = await Promise.all(
        parentIds.map((id) => this.personRepo.findById(id)),
      );

      const nextIds: string[] = [];
      for (let i = 0; i < parents.length; i++) {
        const parent = parents[i];
        if (parent) {
          ancestors.push(parent);
          // biome-ignore lint/style/noNonNullAssertion: parentIds always has an entry at index i
          nextIds.push(parentIds[i]!);
        }
      }

      currentIds = nextIds;
    }

    return ancestors;
  }

  async getDescendants(personId: string, maxDepth?: number): Promise<Person[]> {
    const depth = maxDepth || API_CONFIG.MAX_DESCENDANT_DEPTH;
    const visited = new Set<string>();
    const descendants: Person[] = [];

    let currentIds = [personId];
    visited.add(personId);

    for (let d = 0; d < depth && currentIds.length > 0; d++) {
      const childRelArrays = await Promise.all(
        currentIds.map((id) => this.relationshipRepo.findChildrenOf(id)),
      );

      const childIds: string[] = [];
      for (const rels of childRelArrays) {
        for (const rel of rels) {
          if (!visited.has(rel.person2Id)) {
            visited.add(rel.person2Id);
            childIds.push(rel.person2Id);
          }
        }
      }

      if (childIds.length === 0) break;

      const children = await Promise.all(
        childIds.map((id) => this.personRepo.findById(id)),
      );

      const nextIds: string[] = [];
      for (let i = 0; i < children.length; i++) {
        const child = children[i];
        if (child) {
          descendants.push(child);
          // biome-ignore lint/style/noNonNullAssertion: childIds always has an entry at index i
          nextIds.push(childIds[i]!);
        }
      }

      currentIds = nextIds;
    }

    return descendants;
  }
}
