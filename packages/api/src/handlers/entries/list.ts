import type { EntryType } from '@cloud-family-tree/shared';
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { authorize } from '../../middleware/auth';
import { errorResponse, successResponse } from '../../middleware/response';
import { EntryService } from '../../services/entry.service';

const service = new EntryService();
const VALID_ENTRY_TYPES: EntryType[] = ['wall', 'issue', 'bug'];

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    await authorize(event, 'read');
    const personId = event.pathParameters?.id;
    if (!personId) return errorResponse(new Error('Missing id parameter'));
    const params = event.queryStringParameters || {};
    const limit = params.limit ? Number.parseInt(params.limit, 10) : undefined;
    const cursor = params.cursor;
    const type = VALID_ENTRY_TYPES.find((t) => t === params.type);
    const result = await service.listByPerson(personId, limit, cursor, type);
    return successResponse(200, result);
  } catch (error) {
    return errorResponse(error);
  }
};
