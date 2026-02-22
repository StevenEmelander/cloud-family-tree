import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { authorize } from '../../middleware/auth';
import { errorResponse, successResponse } from '../../middleware/response';
import { ArtifactService } from '../../services/artifact.service';

const service = new ArtifactService();

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    await authorize(event, 'read');
    const personId = event.pathParameters?.id;
    if (!personId) return errorResponse(new Error('Missing id parameter'));
    const params = event.queryStringParameters || {};
    const limit = params.limit ? Number.parseInt(params.limit, 10) : undefined;
    const cursor = params.cursor;
    const result = await service.listByPerson(personId, limit, cursor);
    return successResponse(200, result);
  } catch (error) {
    return errorResponse(error);
  }
};
