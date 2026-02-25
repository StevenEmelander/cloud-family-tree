import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { authorize } from '../../middleware/auth';
import { errorResponse, successResponse } from '../../middleware/response';
import { ArtifactService } from '../../services/artifact.service';

const service = new ArtifactService();

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    await authorize(event, 'read');
    const artifactId = event.pathParameters?.id;
    const personId = event.queryStringParameters?.personId;
    if (!artifactId || !personId) return errorResponse(new Error('Missing artifactId or personId'));

    const associations = await service.getAssociations(artifactId, personId);
    return successResponse(200, { associations });
  } catch (error) {
    return errorResponse(error);
  }
};
