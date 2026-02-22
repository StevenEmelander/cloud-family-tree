export interface PaginatedResponse<T> {
  items: T[];
  count: number;
  lastEvaluatedKey?: string; // base64-encoded DynamoDB key for pagination
}

export interface PaginationParams {
  limit?: number;
  cursor?: string; // base64-encoded DynamoDB exclusive start key
}
