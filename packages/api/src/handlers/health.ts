import type { APIGatewayProxyResult } from 'aws-lambda';
import { successResponse } from '../middleware/response';

export const handler = async (): Promise<APIGatewayProxyResult> => {
  return successResponse(200, { status: 'ok', timestamp: new Date().toISOString() });
};
