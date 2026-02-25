import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { authorize } from '../../middleware/auth';
import { errorResponse, successResponse } from '../../middleware/response';
import { EntryService } from '../../services/entry.service';

const service = new EntryService();

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const user = await authorize(event, 'authenticated');
    if (!user) return errorResponse(new Error('Authentication required'));
    const entryId = event.pathParameters?.id;
    const personId = event.queryStringParameters?.personId;
    if (!entryId || !personId) return errorResponse(new Error('Missing id or personId parameter'));
    const body = JSON.parse(event.body || '{}');
    const result = await service.update(entryId, personId, { content: body.content }, user);
    return successResponse(200, result);
  } catch (error) {
    return errorResponse(error);
  }
};
