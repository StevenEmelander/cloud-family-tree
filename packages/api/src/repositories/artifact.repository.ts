import type { NativeAttributeValue } from '@aws-sdk/util-dynamodb';
import type { Artifact } from '@cloud-family-tree/shared';
import { ENTITY_PREFIX, GSI_NAMES } from '@cloud-family-tree/shared';
import { TableNames } from '../lib/dynamodb';
import { AppError } from '../middleware/error-handler';
import type { QueryResult } from './base.repository';
import { BaseRepository } from './base.repository';

export class ArtifactRepository extends BaseRepository {
  protected get tableName() {
    return TableNames.Artifacts;
  }

  private toKey(artifactId: string, personId: string) {
    return {
      PK: `${ENTITY_PREFIX.ARTIFACT}#${artifactId}`,
      SK: `${ENTITY_PREFIX.PERSON}#${personId}`,
    };
  }

  private toRecord(artifact: Artifact): Record<string, unknown> {
    return {
      ...artifact,
      PK: `${ENTITY_PREFIX.ARTIFACT}#${artifact.artifactId}`,
      SK: `${ENTITY_PREFIX.PERSON}#${artifact.personId}`,
      GSI1PK: `${ENTITY_PREFIX.PERSON}#${artifact.personId}`,
      GSI1SK: `${ENTITY_PREFIX.UPLOADED}#${artifact.uploadedAt}`,
    };
  }

  private fromRecord(record: Record<string, unknown>): Artifact {
    const { PK, SK, GSI1PK, GSI1SK, ...rest } = record;
    return rest as unknown as Artifact;
  }

  async findById(artifactId: string, personId: string): Promise<Artifact | null> {
    const result = await this.getItem<Record<string, unknown>>(this.toKey(artifactId, personId));
    return result ? this.fromRecord(result) : null;
  }

  async create(artifact: Artifact): Promise<Artifact> {
    const record = this.toRecord(artifact);
    await this.putItem(record);
    return artifact;
  }

  async update(
    artifactId: string,
    personId: string,
    updates: Record<string, unknown>,
  ): Promise<void> {
    await this.updateItem(this.toKey(artifactId, personId), updates);
  }

  async delete(artifactId: string, personId: string): Promise<void> {
    await this.deleteItem(this.toKey(artifactId, personId));
  }

  async findByPerson(
    personId: string,
    limit?: number,
    cursor?: string,
  ): Promise<QueryResult<Artifact>> {
    let exclusiveStartKey: Record<string, NativeAttributeValue> | undefined;
    if (cursor) {
      try {
        exclusiveStartKey = JSON.parse(Buffer.from(cursor, 'base64').toString()) as Record<
          string,
          NativeAttributeValue
        >;
      } catch {
        throw new AppError(400, 'Invalid cursor');
      }
    }

    const result = await this.query<Record<string, unknown>>({
      indexName: GSI_NAMES.ARTIFACT_PERSON_INDEX,
      keyCondition: 'GSI1PK = :pk',
      expressionValues: { ':pk': `${ENTITY_PREFIX.PERSON}#${personId}` },
      limit,
      exclusiveStartKey,
      scanIndexForward: false, // newest first
    });

    return {
      items: result.items.map((r) => this.fromRecord(r)),
      lastEvaluatedKey: result.lastEvaluatedKey,
    };
  }

  async findAllAssociations(artifactId: string): Promise<Artifact[]> {
    const result = await this.query<Record<string, unknown>>({
      keyCondition: 'PK = :pk',
      expressionValues: { ':pk': `${ENTITY_PREFIX.ARTIFACT}#${artifactId}` },
    });
    return result.items.map((r) => this.fromRecord(r));
  }

  async findByPersonAndType(
    personId: string,
    artifactType: string,
    limit?: number,
  ): Promise<Artifact[]> {
    const result = await this.query<Record<string, unknown>>({
      indexName: GSI_NAMES.ARTIFACT_PERSON_INDEX,
      keyCondition: 'GSI1PK = :pk',
      expressionValues: {
        ':pk': `${ENTITY_PREFIX.PERSON}#${personId}`,
        ':atype': artifactType,
      },
      filterExpression: 'artifactType = :atype',
      limit,
      scanIndexForward: false,
    });
    return result.items.map((r) => this.fromRecord(r));
  }

  async deleteAllForPerson(personId: string): Promise<void> {
    let cursor: string | undefined;
    do {
      const result = await this.findByPerson(personId, 25, cursor);
      for (const artifact of result.items) {
        await this.delete(artifact.artifactId, artifact.personId);
      }
      cursor = result.lastEvaluatedKey
        ? Buffer.from(JSON.stringify(result.lastEvaluatedKey)).toString('base64')
        : undefined;
    } while (cursor);
  }
}
