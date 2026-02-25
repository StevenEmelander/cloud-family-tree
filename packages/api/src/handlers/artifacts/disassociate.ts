import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { authorize } from '../../middleware/auth';
import { errorResponse, successResponse } from '../../middleware/response';
import { ArtifactService } from '../../services/artifact.service';

const service = new ArtifactService();

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    await authorize(event, 'write');
    const artifactId = event.pathParameters?.id;
    const personId = event.pathParameters?.personId;
    if (!artifactId || !personId) return errorResponse(new Error('Missing artifactId or personId'));

    await service.disassociatePerson(artifactId, personId);
    return successResponse(204, null);
  } catch (error) {
    return errorResponse(error);
  }
};
