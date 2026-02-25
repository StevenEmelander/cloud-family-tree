import type {
  AuthenticatedUser,
  Entry,
  EntryType,
  PaginatedResponse,
} from '@cloud-family-tree/shared';
import { createEntrySchema, isoNow, updateEntrySchema, validate } from '@cloud-family-tree/shared';
import { v4 as uuid } from 'uuid';
import { ForbiddenError, NotFoundError, ValidationError } from '../middleware/error-handler';
import { EntryRepository } from '../repositories/entry.repository';
import { PersonRepository } from '../repositories/person.repository';

export class EntryService {
  private readonly entryRepo = new EntryRepository();
  private readonly personRepo = new PersonRepository();

  async create(
    input: { personId: string; content: string; entryType?: EntryType },
    user: AuthenticatedUser,
  ): Promise<Entry> {
    const result = validate(createEntrySchema, input);
    if (!result.success) throw new ValidationError(result.errors);

    const data = result.data;
    const entryType = data.entryType || 'wall';

    // Verify person exists (skip for SITE — used for bugs)
    if (data.personId !== 'SITE') {
      const person = await this.personRepo.findById(data.personId);
      if (!person) throw new NotFoundError('Person', data.personId);
    }

    // Check for duplicate (same author + same content on this person)
    const existing = await this.entryRepo.findByPerson(data.personId, 50, undefined, entryType);
    const duplicate = existing.items.find(
      (c) => c.authorId === user.userId && c.content === data.content,
    );
    if (duplicate) return duplicate; // Idempotent — return existing entry

    const now = isoNow();
    const entry: Entry = {
      entryId: uuid(),
      personId: data.personId,
      authorId: user.userId,
      authorName: user.name,
      content: data.content,
      entryType,
      createdAt: now,
      updatedAt: now,
    };

    await this.entryRepo.create(entry);
    return entry;
  }

  async update(
    entryId: string,
    personId: string,
    input: { content: string },
    user: AuthenticatedUser,
  ): Promise<Entry> {
    const result = validate(updateEntrySchema, input);
    if (!result.success) throw new ValidationError(result.errors);

    const existing = await this.entryRepo.findById(entryId, personId);
    if (!existing) throw new NotFoundError('Entry', entryId);

    // Only the author can edit their own entry
    if (existing.authorId !== user.userId) {
      throw new ForbiddenError('You can only edit your own entries');
    }

    const now = isoNow();
    await this.entryRepo.update(entryId, personId, result.data.content, now);

    return { ...existing, content: result.data.content, updatedAt: now };
  }

  async delete(entryId: string, personId: string, user: AuthenticatedUser): Promise<void> {
    const existing = await this.entryRepo.findById(entryId, personId);
    if (!existing) return; // Already deleted — nothing to do

    const type = existing.entryType || 'wall';
    let canDelete = false;

    if (type === 'bug') {
      // Only admins can resolve bugs
      canDelete = user.role === 'admins';
    } else if (type === 'issue') {
      // Author, editors, or admins can resolve issues
      canDelete =
        existing.authorId === user.userId || user.role === 'editors' || user.role === 'admins';
    } else {
      // Wall entries: author, editors, or admins
      canDelete =
        existing.authorId === user.userId || user.role === 'editors' || user.role === 'admins';
    }

    if (!canDelete) {
      throw new ForbiddenError('You do not have permission to delete this');
    }

    await this.entryRepo.delete(entryId, personId);
  }

  async listByPerson(
    personId: string,
    limit?: number,
    cursor?: string,
    entryType?: EntryType,
  ): Promise<PaginatedResponse<Entry>> {
    const result = await this.entryRepo.findByPerson(personId, limit, cursor, entryType);
    return {
      items: result.items,
      count: result.items.length,
      lastEvaluatedKey: result.lastEvaluatedKey
        ? Buffer.from(JSON.stringify(result.lastEvaluatedKey)).toString('base64')
        : undefined,
    };
  }

  async listAll(limit?: number, cursor?: string): Promise<PaginatedResponse<Entry>> {
    const result = await this.entryRepo.findAll(limit, cursor);
    return {
      items: result.items,
      count: result.items.length,
      lastEvaluatedKey: result.lastEvaluatedKey
        ? Buffer.from(JSON.stringify(result.lastEvaluatedKey)).toString('base64')
        : undefined,
    };
  }
}
