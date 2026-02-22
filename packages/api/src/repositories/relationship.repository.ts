import { ENTITY_PREFIX, GSI_NAMES } from '@cloud-family-tree/shared';
import type { Relationship } from '@cloud-family-tree/shared';
import { TableNames } from '../lib/dynamodb';
import { BaseRepository } from './base.repository';

interface RelationshipRecord extends Record<string, unknown> {
  PK: string;
  SK: string;
  GSI1PK: string;
  GSI1SK: string;
  GSI2PK: string;
  GSI2SK: string;
}

export class RelationshipRepository extends BaseRepository {
  protected get tableName() {
    return TableNames.Relationships;
  }

  private toKey(relationshipId: string, relationshipType: string) {
    return {
      PK: `${ENTITY_PREFIX.RELATIONSHIP}#${relationshipId}`,
      SK: `${ENTITY_PREFIX.TYPE}#${relationshipType}`,
    };
  }

  private toRecord(rel: Relationship): RelationshipRecord {
    return {
      ...rel,
      PK: `${ENTITY_PREFIX.RELATIONSHIP}#${rel.relationshipId}`,
      SK: `${ENTITY_PREFIX.TYPE}#${rel.relationshipType}`,
      GSI1PK: `${ENTITY_PREFIX.PERSON}#${rel.person1Id}`,
      GSI1SK: `${ENTITY_PREFIX.TYPE}#${rel.relationshipType}#${rel.person2Id}`,
      GSI2PK: `${ENTITY_PREFIX.PERSON}#${rel.person2Id}`,
      GSI2SK: `${ENTITY_PREFIX.TYPE}#${rel.relationshipType}#${rel.person1Id}`,
    };
  }

  private fromRecord(record: Record<string, unknown>): Relationship {
    const { PK, SK, GSI1PK, GSI1SK, GSI2PK, GSI2SK, ...rest } = record;
    return rest as unknown as Relationship;
  }

  async findById(relationshipId: string, relationshipType: string): Promise<Relationship | null> {
    const result = await this.getItem<Record<string, unknown>>(
      this.toKey(relationshipId, relationshipType),
    );
    return result ? this.fromRecord(result) : null;
  }

  async create(relationship: Relationship): Promise<Relationship> {
    const record = this.toRecord(relationship);
    await this.putItem(record);
    return relationship;
  }

  async delete(relationshipId: string, relationshipType: string): Promise<void> {
    await this.deleteItem(this.toKey(relationshipId, relationshipType));
  }

  async findByPerson(personId: string): Promise<Relationship[]> {
    const [forward, inverse] = await Promise.all([
      this.query<Record<string, unknown>>({
        indexName: GSI_NAMES.RELATIONSHIPS_PERSON_INDEX,
        keyCondition: 'GSI1PK = :pk',
        expressionValues: { ':pk': `${ENTITY_PREFIX.PERSON}#${personId}` },
      }),
      this.query<Record<string, unknown>>({
        indexName: GSI_NAMES.RELATIONSHIPS_INVERSE_PERSON_INDEX,
        keyCondition: 'GSI2PK = :pk',
        expressionValues: { ':pk': `${ENTITY_PREFIX.PERSON}#${personId}` },
      }),
    ]);

    const all = [...forward.items, ...inverse.items];
    // Deduplicate by relationshipId
    const seen = new Set<string>();
    return all
      .map((r) => this.fromRecord(r))
      .filter((r) => {
        if (seen.has(r.relationshipId)) return false;
        seen.add(r.relationshipId);
        return true;
      });
  }

  async findChildrenOf(personId: string): Promise<Relationship[]> {
    const result = await this.query<Record<string, unknown>>({
      indexName: GSI_NAMES.RELATIONSHIPS_PERSON_INDEX,
      keyCondition: 'GSI1PK = :pk AND begins_with(GSI1SK, :type)',
      expressionValues: {
        ':pk': `${ENTITY_PREFIX.PERSON}#${personId}`,
        ':type': `${ENTITY_PREFIX.TYPE}#PARENT_CHILD`,
      },
    });
    return result.items.map((r) => this.fromRecord(r));
  }

  async findParentsOf(personId: string): Promise<Relationship[]> {
    const result = await this.query<Record<string, unknown>>({
      indexName: GSI_NAMES.RELATIONSHIPS_INVERSE_PERSON_INDEX,
      keyCondition: 'GSI2PK = :pk AND begins_with(GSI2SK, :type)',
      expressionValues: {
        ':pk': `${ENTITY_PREFIX.PERSON}#${personId}`,
        ':type': `${ENTITY_PREFIX.TYPE}#PARENT_CHILD`,
      },
    });
    return result.items.map((r) => this.fromRecord(r));
  }

  async findSpousesOf(personId: string): Promise<Relationship[]> {
    const [forward, inverse] = await Promise.all([
      this.query<Record<string, unknown>>({
        indexName: GSI_NAMES.RELATIONSHIPS_PERSON_INDEX,
        keyCondition: 'GSI1PK = :pk AND begins_with(GSI1SK, :type)',
        expressionValues: {
          ':pk': `${ENTITY_PREFIX.PERSON}#${personId}`,
          ':type': `${ENTITY_PREFIX.TYPE}#SPOUSE`,
        },
      }),
      this.query<Record<string, unknown>>({
        indexName: GSI_NAMES.RELATIONSHIPS_INVERSE_PERSON_INDEX,
        keyCondition: 'GSI2PK = :pk AND begins_with(GSI2SK, :type)',
        expressionValues: {
          ':pk': `${ENTITY_PREFIX.PERSON}#${personId}`,
          ':type': `${ENTITY_PREFIX.TYPE}#SPOUSE`,
        },
      }),
    ]);

    const all = [...forward.items, ...inverse.items];
    const seen = new Set<string>();
    return all
      .map((r) => this.fromRecord(r))
      .filter((r) => {
        if (seen.has(r.relationshipId)) return false;
        seen.add(r.relationshipId);
        return true;
      });
  }

  async batchCreate(relationships: Relationship[]): Promise<void> {
    const records = relationships.map((r) => this.toRecord(r));
    await this.batchWrite(records);
  }

  async *iterateAll(): AsyncGenerator<Relationship[]> {
    for await (const batch of this.queryAll<Record<string, unknown>>({
      indexName: GSI_NAMES.RELATIONSHIPS_PERSON_INDEX,
      keyCondition: 'GSI1PK > :empty',
      expressionValues: { ':empty': '' },
      limit: 100,
    })) {
      yield batch.map((r) => this.fromRecord(r));
    }
  }

  async deleteAllForPerson(personId: string): Promise<void> {
    const relationships = await this.findByPerson(personId);
    for (const rel of relationships) {
      await this.delete(rel.relationshipId, rel.relationshipType);
    }
  }
}
