import type { CreateRelationshipInput, Relationship } from '@cloud-family-tree/shared';
import { createRelationshipSchema, isoNow, validate } from '@cloud-family-tree/shared';
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
}
