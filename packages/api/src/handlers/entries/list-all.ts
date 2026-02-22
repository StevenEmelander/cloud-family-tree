import type { EntryType } from '@cloud-family-tree/shared';
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { authorize } from '../../middleware/auth';
import { errorResponse, successResponse } from '../../middleware/response';
import { EntryService } from '../../services/entry.service';

const service = new EntryService();
const VALID_TYPES = new Set(['wall', 'issue', 'bug']);

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    await authorize(event, 'read');
    const params = event.queryStringParameters || {};
    const type = params.type;
    if (!type || !VALID_TYPES.has(type)) {
      return errorResponse(new Error('Missing or invalid type parameter (wall, issue, bug)'));
    }
    const items = await service.listAllByType(type as EntryType);
    return successResponse(200, { items, count: items.length });
  } catch (error) {
    return errorResponse(error);
  }
};
