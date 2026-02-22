import type { NativeAttributeValue } from '@aws-sdk/util-dynamodb';
import { ENTITY_PREFIX, GSI_NAMES } from '@cloud-family-tree/shared';
import type { Person } from '@cloud-family-tree/shared';
import { TableNames } from '../lib/dynamodb';
import { BaseRepository } from './base.repository';
import type { QueryResult } from './base.repository';

interface PersonRecord extends Record<string, unknown> {
  PK: string;
  SK: string;
  GSI1PK: string;
  GSI1SK: string;
  searchName: string;
}

export class PersonRepository extends BaseRepository {
  protected get tableName() {
    return TableNames.People;
  }

  private toKey(personId: string) {
    return {
      PK: `${ENTITY_PREFIX.PERSON}#${personId}`,
      SK: ENTITY_PREFIX.METADATA,
    };
  }

  private toRecord(person: Person): PersonRecord {
    return {
      ...person,
      PK: `${ENTITY_PREFIX.PERSON}#${person.personId}`,
      SK: ENTITY_PREFIX.METADATA,
      GSI1PK: ENTITY_PREFIX.PERSON,
      GSI1SK: `${ENTITY_PREFIX.LASTNAME}#${person.lastName.toUpperCase()}#${ENTITY_PREFIX.FIRSTNAME}#${person.firstName.toUpperCase()}`,
      searchName: [person.firstName, person.middleName, person.lastName].filter(Boolean).join(' ').toUpperCase(),
    };
  }

  private fromRecord(record: Record<string, unknown>): Person {
    const { PK, SK, GSI1PK, GSI1SK, searchName, ...rest } = record;
    return rest as unknown as Person;
  }

  async findById(personId: string): Promise<Person | null> {
    const result = await this.getItem<Record<string, unknown>>(this.toKey(personId));
    if (!result) return null;
    return this.fromRecord(result);
  }

  async create(person: Person): Promise<Person> {
    const record = this.toRecord(person);
    await this.putItem(record);
    return person;
  }

  async update(personId: string, updates: Partial<Person>): Promise<void> {
    const key = this.toKey(personId);
    const enrichedUpdates: Record<string, unknown> = { ...updates };

    // Update GSI1SK if name fields changed (bypass privacy filter for internal read)
    if (updates.firstName || updates.lastName) {
      const raw = await this.getItem<Record<string, unknown>>(key);
      if (raw) {
        const existing = this.fromRecord(raw);
        const firstName = updates.firstName || existing.firstName;
        const middleName = updates.middleName !== undefined ? updates.middleName : existing.middleName;
        const lastName = updates.lastName || existing.lastName;
        enrichedUpdates.GSI1SK = `${ENTITY_PREFIX.LASTNAME}#${lastName.toUpperCase()}#${ENTITY_PREFIX.FIRSTNAME}#${firstName.toUpperCase()}`;
        enrichedUpdates.searchName = [firstName, middleName, lastName].filter(Boolean).join(' ').toUpperCase();
      }
    }

    await this.updateItem(key, enrichedUpdates);
  }

  async delete(personId: string): Promise<void> {
    await this.deleteItem(this.toKey(personId));
  }

  async findAll(limit?: number, cursor?: string): Promise<QueryResult<Person>> {
    const exclusiveStartKey = cursor
      ? (JSON.parse(Buffer.from(cursor, 'base64').toString()) as Record<
          string,
          NativeAttributeValue
        >)
      : undefined;

    const result = await this.query<Record<string, unknown>>({
      indexName: GSI_NAMES.PEOPLE_NAME_INDEX,
      keyCondition: 'GSI1PK = :pk',
      expressionValues: { ':pk': ENTITY_PREFIX.PERSON },
      limit,
      exclusiveStartKey,
    });

    return {
      items: result.items.map((r) => this.fromRecord(r)),
      lastEvaluatedKey: result.lastEvaluatedKey,
    };
  }

  async searchByName(
    namePrefix: string,
    limit: number = 100,
    cursor?: string,
  ): Promise<QueryResult<Person>> {
    // Query the GSI partition with a server-side filter on searchName.
    // DynamoDB's Limit applies BEFORE FilterExpression, so a single query
    // with Limit=10 might return fewer than 10 matching items. We loop
    // over DynamoDB pages, accumulating filtered results until we have
    // enough or exhaust the partition.
    // Split search into words so "Donald A Emelander" matches searchName "DONALD A EMELANDER"
    const words = namePrefix.toUpperCase().replace(/\./g, '').split(/\s+/).filter(Boolean);
    const matchedRecords: Record<string, unknown>[] = [];

    let exclusiveStartKey = cursor
      ? (JSON.parse(Buffer.from(cursor, 'base64').toString()) as Record<
          string,
          NativeAttributeValue
        >)
      : undefined;

    // Build filter: each word must appear in searchName
    const expressionValues: Record<string, string> = { ':pk': ENTITY_PREFIX.PERSON };
    const filterParts: string[] = [];
    for (let i = 0; i < words.length; i++) {
      const key = `:w${i}`;
      expressionValues[key] = words[i]!;
      filterParts.push(`contains(searchName, ${key})`);
    }
    const filterExpression = filterParts.join(' AND ');

    // Over-read factor: request more items per DynamoDB page than we need
    // since the filter will discard non-matching items.
    const batchSize = Math.max(limit * 3, 50);

    while (matchedRecords.length < limit) {
      const result = await this.query<Record<string, unknown>>({
        indexName: GSI_NAMES.PEOPLE_NAME_INDEX,
        keyCondition: 'GSI1PK = :pk',
        expressionValues,
        filterExpression,
        limit: batchSize,
        exclusiveStartKey,
      });

      matchedRecords.push(...result.items);
      exclusiveStartKey = result.lastEvaluatedKey;

      // No more data in the partition
      if (!result.lastEvaluatedKey) break;
    }

    // If we collected more than needed, trim and build a cursor from the
    // last included item's GSI keys so the next page resumes after it.
    const hasMore = matchedRecords.length > limit || !!exclusiveStartKey;
    const pageRecords = matchedRecords.slice(0, limit);

    let lastEvaluatedKey: Record<string, NativeAttributeValue> | undefined;
    const lastRecord = pageRecords[pageRecords.length - 1];
    if (hasMore && lastRecord) {
      // DynamoDB needs all key attributes (table PK/SK + GSI PK/SK)
      lastEvaluatedKey = {
        PK: lastRecord.PK as NativeAttributeValue,
        SK: lastRecord.SK as NativeAttributeValue,
        GSI1PK: lastRecord.GSI1PK as NativeAttributeValue,
        GSI1SK: lastRecord.GSI1SK as NativeAttributeValue,
      };
    }

    return {
      items: pageRecords.map((r) => this.fromRecord(r)),
      lastEvaluatedKey,
    };
  }

  async findByExactName(firstName: string, lastName: string): Promise<Person[]> {
    const gsi1sk = `${ENTITY_PREFIX.LASTNAME}#${lastName.toUpperCase()}#${ENTITY_PREFIX.FIRSTNAME}#${firstName.toUpperCase()}`;
    const result = await this.query<Record<string, unknown>>({
      indexName: GSI_NAMES.PEOPLE_NAME_INDEX,
      keyCondition: 'GSI1PK = :pk AND GSI1SK = :sk',
      expressionValues: {
        ':pk': ENTITY_PREFIX.PERSON,
        ':sk': gsi1sk,
      },
    });
    return result.items.map((r) => this.fromRecord(r));
  }

  async batchCreate(people: Person[]): Promise<void> {
    const records = people.map((p) => this.toRecord(p));
    await this.batchWrite(records);
  }

  async *iterateAll(): AsyncGenerator<Person[]> {
    for await (const batch of this.queryAll<Record<string, unknown>>({
      indexName: GSI_NAMES.PEOPLE_NAME_INDEX,
      keyCondition: 'GSI1PK = :pk',
      expressionValues: { ':pk': ENTITY_PREFIX.PERSON },
      limit: 100,
    })) {
      yield batch.map((r) => this.fromRecord(r));
    }
  }
}
