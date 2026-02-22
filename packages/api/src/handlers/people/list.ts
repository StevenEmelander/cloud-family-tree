import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { authorize } from '../../middleware/auth';
import { errorResponse, successResponse } from '../../middleware/response';
import { PersonService } from '../../services/person.service';

const service = new PersonService();

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    await authorize(event, 'read');
    const params = event.queryStringParameters || {};
    const limit = params.limit ? Number.parseInt(params.limit, 10) : undefined;
    const cursor = params.cursor;
    const search = params.search;

    const result = search
      ? await service.search(search, limit, cursor)
      : await service.list(limit, cursor);

    return successResponse(200, result);
  } catch (error) {
    return errorResponse(error);
  }
};
