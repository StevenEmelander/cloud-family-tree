import {
  BatchWriteCommand,
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import type { NativeAttributeValue } from '@aws-sdk/util-dynamodb';
import { docClient } from '../lib/dynamodb';

export interface QueryParams {
  indexName?: string;
  keyCondition: string;
  expressionValues: Record<string, NativeAttributeValue>;
  expressionNames?: Record<string, string>;
  filterExpression?: string;
  limit?: number;
  exclusiveStartKey?: Record<string, NativeAttributeValue>;
  scanIndexForward?: boolean;
  projectionExpression?: string;
}

export interface QueryResult<T> {
  items: T[];
  lastEvaluatedKey?: Record<string, NativeAttributeValue>;
}

export abstract class BaseRepository {
  protected abstract readonly tableName: string;

  protected async getItem<T>(key: Record<string, NativeAttributeValue>): Promise<T | null> {
    const result = await docClient.send(
      new GetCommand({
        TableName: this.tableName,
        Key: key,
      }),
    );
    return (result.Item as T) || null;
  }

  protected async putItem<T extends Record<string, unknown>>(item: T): Promise<T> {
    await docClient.send(
      new PutCommand({
        TableName: this.tableName,
        Item: item,
      }),
    );
    return item;
  }

  protected async updateItem(
    key: Record<string, NativeAttributeValue>,
    updates: Record<string, unknown>,
  ): Promise<void> {
    const setParts: string[] = [];
    const removeParts: string[] = [];
    const expressionValues: Record<string, NativeAttributeValue> = {};
    const expressionNames: Record<string, string> = {};

    for (const [attr, value] of Object.entries(updates)) {
      if (value === undefined) continue; // skip untouched fields
      const safeAttr = `#${attr}`;
      expressionNames[safeAttr] = attr;
      if (value === null) {
        // null means remove the attribute from DynamoDB
        removeParts.push(safeAttr);
      } else {
        const safeVal = `:${attr}`;
        setParts.push(`${safeAttr} = ${safeVal}`);
        expressionValues[safeVal] = value as NativeAttributeValue;
      }
    }

    if (setParts.length === 0 && removeParts.length === 0) return;

    const parts: string[] = [];
    if (setParts.length > 0) parts.push(`SET ${setParts.join(', ')}`);
    if (removeParts.length > 0) parts.push(`REMOVE ${removeParts.join(', ')}`);

    await docClient.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: key,
        UpdateExpression: parts.join(' '),
        ExpressionAttributeNames: expressionNames,
        ...(Object.keys(expressionValues).length > 0 && {
          ExpressionAttributeValues: expressionValues,
        }),
      }),
    );
  }

  protected async deleteItem(key: Record<string, NativeAttributeValue>): Promise<void> {
    await docClient.send(
      new DeleteCommand({
        TableName: this.tableName,
        Key: key,
      }),
    );
  }

  protected async query<T>(params: QueryParams): Promise<QueryResult<T>> {
    const result = await docClient.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: params.indexName,
        KeyConditionExpression: params.keyCondition,
        ExpressionAttributeValues: params.expressionValues,
        ExpressionAttributeNames: params.expressionNames,
        FilterExpression: params.filterExpression,
        Limit: params.limit,
        ExclusiveStartKey: params.exclusiveStartKey,
        ScanIndexForward: params.scanIndexForward,
        ProjectionExpression: params.projectionExpression,
      }),
    );

    return {
      items: (result.Items as T[]) || [],
      lastEvaluatedKey: result.LastEvaluatedKey,
    };
  }

  protected async *queryAll<T>(
    params: Omit<QueryParams, 'exclusiveStartKey'>,
  ): AsyncGenerator<T[]> {
    let lastKey: Record<string, NativeAttributeValue> | undefined;

    do {
      const result = await this.query<T>({
        ...params,
        exclusiveStartKey: lastKey,
      });

      if (result.items.length > 0) {
        yield result.items;
      }

      lastKey = result.lastEvaluatedKey;
    } while (lastKey);
  }

  protected async batchWrite(items: Record<string, unknown>[]): Promise<void> {
    const BATCH_SIZE = 25;
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      const batch = items.slice(i, i + BATCH_SIZE);
      await docClient.send(
        new BatchWriteCommand({
          RequestItems: {
            [this.tableName]: batch.map((item) => ({
              PutRequest: { Item: item },
            })),
          },
        }),
      );
    }
  }
}
