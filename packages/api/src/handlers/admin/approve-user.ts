import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { authorize } from '../../middleware/auth';
import { AppError } from '../../middleware/error-handler';
import { errorResponse, successResponse } from '../../middleware/response';
import { UserAdminService } from '../../services/user-admin.service';

const service = new UserAdminService();

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    await authorize(event, 'admin');
    const body = JSON.parse(event.body || '{}');
    if (!body.username) {
      throw new AppError(400, 'username is required');
    }
    await service.approveUser(body.username);
    return successResponse(200, { message: 'User approved' });
  } catch (error) {
    return errorResponse(error);
  }
};
