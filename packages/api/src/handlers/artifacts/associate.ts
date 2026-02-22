import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { authorize } from '../../middleware/auth';
import { errorResponse, successResponse } from '../../middleware/response';
import { ArtifactService } from '../../services/artifact.service';

const service = new ArtifactService();

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    await authorize(event, 'write');
    const artifactId = event.pathParameters?.id;
    if (!artifactId) return errorResponse(new Error('Missing artifact id'));

    const body = JSON.parse(event.body || '{}');
    const { sourcePersonId, targetPersonIds } = body as {
      sourcePersonId: string;
      targetPersonIds: string[];
    };

    if (!sourcePersonId || !Array.isArray(targetPersonIds) || targetPersonIds.length === 0) {
      return errorResponse(new Error('sourcePersonId and targetPersonIds[] are required'));
    }

    await service.associatePeople(artifactId, sourcePersonId, targetPersonIds);
    return successResponse(200, { message: 'Associations created' });
  } catch (error) {
    return errorResponse(error);
  }
};
