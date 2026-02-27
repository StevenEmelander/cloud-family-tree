import { isoNow, updateSourceSchema } from '@cloud-family-tree/shared';
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { authorize } from '../../middleware/auth';
import { AppError, ValidationError } from '../../middleware/error-handler';
import { errorResponse, successResponse } from '../../middleware/response';
import { SourceRepository } from '../../repositories/source.repository';

const repo = new SourceRepository();

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    await authorize(event, 'write');
    const id = event.pathParameters?.id;
    if (!id) return errorResponse(new Error('Missing id parameter'));

    const existing = await repo.findById(id);
    if (!existing) throw new AppError(404, 'Source not found');

    const body = JSON.parse(event.body || '{}');
    const parsed = updateSourceSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`));
    }

    await repo.update(id, { ...parsed.data, updatedAt: isoNow() });
    const updated = await repo.findById(id);
    return successResponse(200, updated);
  } catch (error) {
    return errorResponse(error);
  }
};
