import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { authorize } from '../../middleware/auth';
import { errorResponse, successResponse } from '../../middleware/response';
import { PersonService } from '../../services/person.service';

const service = new PersonService();

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    await authorize(event, 'write');
    const body = JSON.parse(event.body || '{}');
    const person = await service.create(body);
    return successResponse(201, person);
  } catch (error) {
    return errorResponse(error);
  }
};
