import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { authorize } from '../../middleware/auth';
import { errorResponse, successResponse } from '../../middleware/response';
import { SourceService } from '../../services/source.service';

const service = new SourceService();

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    await authorize(event, 'read');
    const sources = await service.findAll();
    return successResponse(200, { items: sources, count: sources.length });
  } catch (error) {
    return errorResponse(error);
  }
};
