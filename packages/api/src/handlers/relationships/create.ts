import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { authorize } from '../../middleware/auth';
import { errorResponse, successResponse } from '../../middleware/response';
import { RelationshipService } from '../../services/relationship.service';

const service = new RelationshipService();

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    await authorize(event, 'write');
    const body = JSON.parse(event.body || '{}');
    const relationship = await service.create(body);
    return successResponse(201, relationship);
  } catch (error) {
    return errorResponse(error);
  }
};
