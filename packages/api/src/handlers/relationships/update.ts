import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { authorize } from '../../middleware/auth';
import { errorResponse, successResponse } from '../../middleware/response';
import { RelationshipService } from '../../services/relationship.service';

const service = new RelationshipService();

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    await authorize(event, 'write');
    const id = event.pathParameters?.id;
    if (!id) return errorResponse(new Error('Missing id parameter'));
    const body = JSON.parse(event.body || '{}');
    const relationship = await service.updateMetadata(id, body.metadata || {});
    return successResponse(200, relationship);
  } catch (error) {
    return errorResponse(error);
  }
};
