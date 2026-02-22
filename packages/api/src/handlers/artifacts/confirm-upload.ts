import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { authorize } from '../../middleware/auth';
import { errorResponse, successResponse } from '../../middleware/response';
import { ArtifactService } from '../../services/artifact.service';

const service = new ArtifactService();

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const user = await authorize(event, 'write');
    const body = JSON.parse(event.body || '{}');
    const artifact = await service.confirmUpload(body, user!.userId);
    return successResponse(201, artifact);
  } catch (error) {
    return errorResponse(error);
  }
};
