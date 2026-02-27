import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getGedzipUploadUrl } from '../../gedcom/gedcom7/gedzip';
import { BucketNames } from '../../lib/s3';
import { authorize } from '../../middleware/auth';
import { errorResponse, successResponse } from '../../middleware/response';

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    await authorize(event, 'admin');
    const { s3Key, uploadUrl } = await getGedzipUploadUrl(BucketNames.Photos);
    return successResponse(200, { s3Key, uploadUrl });
  } catch (error) {
    return errorResponse(error);
  }
};
