import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});

export const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

// Table names from environment variables (set by CDK)
export const TableNames = {
  People: process.env.PEOPLE_TABLE_NAME!,
  Relationships: process.env.RELATIONSHIPS_TABLE_NAME!,
  Artifacts: process.env.ARTIFACTS_TABLE_NAME!,
  Entries: process.env.ENTRIES_TABLE_NAME!,
};
