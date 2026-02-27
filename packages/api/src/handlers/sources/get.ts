import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { authorize } from '../../middleware/auth';
import { AppError } from '../../middleware/error-handler';
import { errorResponse, successResponse } from '../../middleware/response';
import { SourceRepository } from '../../repositories/source.repository';

const repo = new SourceRepository();

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    await authorize(event, 'read');
    const id = event.pathParameters?.id;
    if (!id) return errorResponse(new Error('Missing id parameter'));
    const source = await repo.findById(id);
    if (!source) throw new AppError(404, 'Source not found');
    return successResponse(200, source);
  } catch (error) {
    return errorResponse(error);
  }
};
