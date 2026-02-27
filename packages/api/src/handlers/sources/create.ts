import { createSourceSchema, isoNow } from '@cloud-family-tree/shared';
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { v4 as uuid } from 'uuid';
import { authorize } from '../../middleware/auth';
import { ValidationError } from '../../middleware/error-handler';
import { errorResponse, successResponse } from '../../middleware/response';
import { SourceRepository } from '../../repositories/source.repository';

const repo = new SourceRepository();

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    await authorize(event, 'write');
    const body = JSON.parse(event.body || '{}');
    const parsed = createSourceSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`));
    }

    const now = isoNow();
    const source = await repo.create({
      sourceId: uuid(),
      ...parsed.data,
      createdAt: now,
      updatedAt: now,
    });

    return successResponse(201, source);
  } catch (error) {
    return errorResponse(error);
  }
};
