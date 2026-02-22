import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { authorize } from '../../middleware/auth';
import { errorResponse, successResponse } from '../../middleware/response';
import { RelationshipService } from '../../services/relationship.service';

const service = new RelationshipService();

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    await authorize(event, 'admin');
    const id = event.pathParameters?.id;
    const type = event.queryStringParameters?.type;
    if (!id || !type) return errorResponse(new Error('Missing id or type parameter'));
    await service.delete(id, type);
    return successResponse(204, null);
  } catch (error) {
    return errorResponse(error);
  }
};
