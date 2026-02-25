import { API_CONFIG } from '@cloud-family-tree/shared';
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { authorize } from '../../middleware/auth';
import { errorResponse, successResponse } from '../../middleware/response';
import { EntryService } from '../../services/entry.service';

const service = new EntryService();

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    await authorize(event, 'read');
    const params = event.queryStringParameters || {};
    const limit = Math.min(
      Number(params.limit) || API_CONFIG.PAGINATION_DEFAULT_LIMIT,
      API_CONFIG.PAGINATION_MAX_LIMIT,
    );
    const result = await service.listAll(limit, params.cursor ?? undefined);
    return successResponse(200, result);
  } catch (error) {
    return errorResponse(error);
  }
};
