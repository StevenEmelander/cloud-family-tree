import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { authorize } from '../../middleware/auth';
import { errorResponse, successResponse } from '../../middleware/response';
import { PersonService } from '../../services/person.service';

const service = new PersonService();

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    await authorize(event, 'write');
    const id = event.pathParameters?.id;
    if (!id) return errorResponse(new Error('Missing id parameter'));
    const body = JSON.parse(event.body || '{}');
    const person = await service.update(id, body);
    return successResponse(200, person);
  } catch (error) {
    return errorResponse(error);
  }
};
