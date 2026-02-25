import type {
  CreatePersonInput,
  PaginatedResponse,
  Person,
  UpdatePersonInput,
} from '@cloud-family-tree/shared';
import {
  API_CONFIG,
  createPersonSchema,
  isoNow,
  updatePersonSchema,
  validate,
} from '@cloud-family-tree/shared';
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
    if (!result.success) throw new ValidationError(result.errors!);

    const data = result.data!;

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
    if (!result.success) throw new ValidationError(result.errors!);

    await this.getById(id); // verify exists

    // Convert undefined values from cleared fields to null so DynamoDB removes them
    const clearableFields = [
      'middleName',
      'birthDate',
      'birthPlace',
      'deathDate',
      'deathPlace',
      'burialPlace',
      'biography',
    ] as const;
    const updates: Record<string, unknown> = { ...result.data!, updatedAt: isoNow() };
    for (const field of clearableFields) {
      if (field in input && updates[field] === undefined) {
        updates[field] = null;
      }
    }

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
    const result = await this.personRepo.findAll(effectiveLimit, cursor);
    return {
      items: result.items,
      count: result.items.length,
      lastEvaluatedKey: result.lastEvaluatedKey
        ? Buffer.from(JSON.stringify(result.lastEvaluatedKey)).toString('base64')
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
    const result = await this.personRepo.searchByName(namePrefix, effectiveLimit, cursor);
    return {
      items: result.items,
      count: result.items.length,
      lastEvaluatedKey: result.lastEvaluatedKey
        ? Buffer.from(JSON.stringify(result.lastEvaluatedKey)).toString('base64')
        : undefined,
    };
  }
}
