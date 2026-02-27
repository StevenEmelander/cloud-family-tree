import type { Source } from '@cloud-family-tree/shared';
import { ENTITY_PREFIX, GSI_NAMES } from '@cloud-family-tree/shared';
import { TableNames } from '../lib/dynamodb';
import { AppError } from '../middleware/error-handler';
import { BaseRepository } from './base.repository';

interface SourceRecord extends Record<string, unknown> {
  PK: string;
  SK: string;
  GSI1PK: string;
  GSI1SK: string;
}

export class SourceRepository extends BaseRepository {
  protected get tableName() {
    return TableNames.Sources;
  }

  private toKey(sourceId: string) {
    return {
      PK: `${ENTITY_PREFIX.SOURCE}#${sourceId}`,
      SK: ENTITY_PREFIX.METADATA,
    };
  }

  private toRecord(source: Source): SourceRecord {
    return {
      ...source,
      PK: `${ENTITY_PREFIX.SOURCE}#${source.sourceId}`,
      SK: ENTITY_PREFIX.METADATA,
      GSI1PK: ENTITY_PREFIX.SOURCE,
      GSI1SK: `${ENTITY_PREFIX.TITLE}#${source.title.toUpperCase()}`,
    };
  }

  private fromRecord(record: Record<string, unknown>): Source {
    const { PK, SK, GSI1PK, GSI1SK, ...rest } = record;
    return rest as unknown as Source;
  }

  async findById(sourceId: string): Promise<Source | null> {
    const result = await this.getItem<Record<string, unknown>>(this.toKey(sourceId));
    if (!result) return null;
    return this.fromRecord(result);
  }

  async create(source: Source): Promise<Source> {
    const record = this.toRecord(source);
    await this.putItem(record);
    return source;
  }

  async update(sourceId: string, updates: Partial<Source>): Promise<void> {
    const key = this.toKey(sourceId);
    const enrichedUpdates: Record<string, unknown> = { ...updates };

    if (updates.title) {
      enrichedUpdates.GSI1SK = `${ENTITY_PREFIX.TITLE}#${updates.title.toUpperCase()}`;
    }

    await this.updateItem(key, enrichedUpdates);
  }

  async delete(sourceId: string): Promise<void> {
    const existing = await this.findById(sourceId);
    if (!existing) throw new AppError(404, 'Source not found');
    await this.deleteItem(this.toKey(sourceId));
  }

  async findAll(): Promise<Source[]> {
    const sources: Source[] = [];
    for await (const batch of this.queryAll<Record<string, unknown>>({
      indexName: GSI_NAMES.SOURCES_TITLE_INDEX,
      keyCondition: 'GSI1PK = :pk',
      expressionValues: { ':pk': ENTITY_PREFIX.SOURCE },
    })) {
      sources.push(...batch.map((r) => this.fromRecord(r)));
    }
    return sources;
  }

  async batchCreate(sources: Source[]): Promise<void> {
    const records = sources.map((s) => this.toRecord(s));
    await this.batchWrite(records);
  }

  async *iterateAll(): AsyncGenerator<Source[]> {
    for await (const batch of this.queryAll<Record<string, unknown>>({
      indexName: GSI_NAMES.SOURCES_TITLE_INDEX,
      keyCondition: 'GSI1PK = :pk',
      expressionValues: { ':pk': ENTITY_PREFIX.SOURCE },
    })) {
      yield batch.map((r) => this.fromRecord(r));
    }
  }
}
