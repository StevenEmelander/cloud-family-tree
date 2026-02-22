import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import type { NativeAttributeValue } from '@aws-sdk/util-dynamodb';
import { ENTITY_PREFIX, GSI_NAMES } from '@cloud-family-tree/shared';
import type { Entry, EntryType } from '@cloud-family-tree/shared';
import { TableNames, docClient } from '../lib/dynamodb';
import { BaseRepository } from './base.repository';
import type { QueryResult } from './base.repository';

export class EntryRepository extends BaseRepository {
  protected get tableName() {
    return TableNames.Entries;
  }

  private toKey(entryId: string, personId: string) {
    return {
      PK: `${ENTITY_PREFIX.ENTRY}#${entryId}`,
      SK: `${ENTITY_PREFIX.PERSON}#${personId}`,
    };
  }

  private toRecord(entry: Entry): Record<string, unknown> {
    return {
      ...entry,
      PK: `${ENTITY_PREFIX.ENTRY}#${entry.entryId}`,
      SK: `${ENTITY_PREFIX.PERSON}#${entry.personId}`,
      GSI1PK: `${ENTITY_PREFIX.PERSON}#${entry.personId}`,
      GSI1SK: `${ENTITY_PREFIX.ENTRY}#${entry.createdAt}`,
    };
  }

  private fromRecord(record: Record<string, unknown>): Entry {
    const { PK, SK, GSI1PK, GSI1SK, ...rest } = record;
    return rest as unknown as Entry;
  }

  async findById(entryId: string, personId: string): Promise<Entry | null> {
    const result = await this.getItem<Record<string, unknown>>(
      this.toKey(entryId, personId),
    );
    return result ? this.fromRecord(result) : null;
  }

  async create(entry: Entry): Promise<Entry> {
    const record = this.toRecord(entry);
    await this.putItem(record);
    return entry;
  }

  async update(entryId: string, personId: string, content: string, updatedAt: string): Promise<void> {
    await this.updateItem(this.toKey(entryId, personId), {
      content,
      updatedAt,
    });
  }

  async delete(entryId: string, personId: string): Promise<void> {
    await this.deleteItem(this.toKey(entryId, personId));
  }

  async findByPerson(
    personId: string,
    limit?: number,
    cursor?: string,
    entryType?: EntryType,
  ): Promise<QueryResult<Entry>> {
    const exclusiveStartKey = cursor
      ? (JSON.parse(Buffer.from(cursor, 'base64').toString()) as Record<
          string,
          NativeAttributeValue
        >)
      : undefined;

    const expressionValues: Record<string, NativeAttributeValue> = {
      ':pk': `${ENTITY_PREFIX.PERSON}#${personId}`,
    };
    let filterExpression: string | undefined;

    if (entryType) {
      expressionValues[':et'] = entryType;
      filterExpression = 'entryType = :et';
    }

    const result = await this.query<Record<string, unknown>>({
      indexName: GSI_NAMES.ENTRIES_PERSON_INDEX,
      keyCondition: 'GSI1PK = :pk',
      expressionValues,
      filterExpression,
      limit,
      exclusiveStartKey,
      scanIndexForward: false, // newest first
    });

    return {
      items: result.items.map((r) => this.fromRecord(r)),
      lastEvaluatedKey: result.lastEvaluatedKey,
    };
  }

  async findAllByType(entryType: EntryType): Promise<Entry[]> {
    const items: Entry[] = [];
    let lastKey: Record<string, NativeAttributeValue> | undefined;

    do {
      const result = await docClient.send(
        new ScanCommand({
          TableName: this.tableName,
          FilterExpression: 'entryType = :et',
          ExpressionAttributeValues: { ':et': entryType },
          ExclusiveStartKey: lastKey,
        }),
      );

      if (result.Items) {
        items.push(...result.Items.map((r) => this.fromRecord(r as Record<string, unknown>)));
      }
      lastKey = result.LastEvaluatedKey;
    } while (lastKey);

    return items;
  }

  async deleteAllForPerson(personId: string): Promise<void> {
    let cursor: string | undefined;
    do {
      const result = await this.findByPerson(personId, 25, cursor);
      for (const entry of result.items) {
        await this.delete(entry.entryId, entry.personId);
      }
      cursor = result.lastEvaluatedKey
        ? Buffer.from(JSON.stringify(result.lastEvaluatedKey)).toString('base64')
        : undefined;
    } while (cursor);
  }
}
