import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { authorize } from '../../middleware/auth';
import { errorResponse, successResponse } from '../../middleware/response';
import { ArtifactService } from '../../services/artifact.service';

const service = new ArtifactService();

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const user = await authorize(event, 'write');
    const id = event.pathParameters?.id;
    const personId = event.queryStringParameters?.personId;
    if (!id || !personId)
      return errorResponse(new Error('Missing id or personId parameter'));
    await service.delete(id, personId, user!);
    return successResponse(204, null);
  } catch (error) {
    return errorResponse(error);
  }
};
