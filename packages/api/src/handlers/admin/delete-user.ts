import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { authorize } from '../../middleware/auth';
import { AppError } from '../../middleware/error-handler';
import { errorResponse, successResponse } from '../../middleware/response';
import { UserAdminService } from '../../services/user-admin.service';

const service = new UserAdminService();

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const user = await authorize(event, 'admin');
    const username = event.pathParameters?.username;
    if (!username) {
      throw new AppError(400, 'username is required');
    }
    if (username === user?.email) {
      throw new AppError(400, 'Cannot delete yourself');
    }
    await service.deleteUser(username);
    return successResponse(200, { message: 'User deleted' });
  } catch (error) {
    return errorResponse(error);
  }
};
