import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { authorize } from '../../middleware/auth';
import { errorResponse, successResponse } from '../../middleware/response';
import { EntryService } from '../../services/entry.service';

const service = new EntryService();

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const user = await authorize(event, 'authenticated');
    if (!user) return errorResponse(new Error('Authentication required'));
    const personId = event.pathParameters?.id;
    if (!personId) return errorResponse(new Error('Missing id parameter'));
    const body = JSON.parse(event.body || '{}');
    const result = await service.create(
      { personId, content: body.content, entryType: body.entryType },
      user,
    );
    return successResponse(201, result);
  } catch (error) {
    return errorResponse(error);
  }
};
