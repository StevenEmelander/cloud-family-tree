import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { authorize } from '../../middleware/auth';
import { errorResponse, successResponse } from '../../middleware/response';
import { SourceService } from '../../services/source.service';

const service = new SourceService();

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    await authorize(event, 'write');
    const body = JSON.parse(event.body || '{}');
    const source = await service.create(body);
    return successResponse(201, source);
  } catch (error) {
    return errorResponse(error);
  }
};
