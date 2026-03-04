import type { CreateSourceInput, Source, UpdateSourceInput } from '@cloud-family-tree/shared';
import { createSourceSchema, isoNow, updateSourceSchema, validate } from '@cloud-family-tree/shared';
import { applyClears } from '../lib/service.utils';
import { v4 as uuid } from 'uuid';
import { NotFoundError, ValidationError } from '../middleware/error-handler';
import { SourceRepository } from '../repositories/source.repository';

export class SourceService {
  private readonly sourceRepo = new SourceRepository();

  async create(input: CreateSourceInput): Promise<Source> {
    const result = validate(createSourceSchema, input);
    if (!result.success) throw new ValidationError(result.errors);

    const now = isoNow();
    const source: Source = {
      sourceId: uuid(),
      ...result.data,
      createdAt: now,
      updatedAt: now,
    };

    await this.sourceRepo.create(source);
    return source;
  }

  async findById(id: string): Promise<Source> {
    const source = await this.sourceRepo.findById(id);
    if (!source) throw new NotFoundError('Source', id);
    return source;
  }

  async findAll(): Promise<Source[]> {
    return this.sourceRepo.findAll();
  }

  async update(id: string, input: UpdateSourceInput): Promise<Source> {
    const result = validate(updateSourceSchema, input);
    if (!result.success) throw new ValidationError(result.errors);

    await this.findById(id); // verify exists

    // Convert undefined values from cleared fields to null so DynamoDB removes them
    const updates = applyClears(input as Record<string, unknown>, result.data as Record<string, unknown>, [
      'author',
      'publicationInfo',
      'repositoryName',
      'url',
      'notes',
    ]);

    await this.sourceRepo.update(id, updates as Partial<Source>);
    return this.findById(id);
  }

  async delete(id: string): Promise<void> {
    const existing = await this.sourceRepo.findById(id);
    if (!existing) return; // Already deleted — nothing to do
    await this.sourceRepo.delete(id);
  }
}
