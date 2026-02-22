import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { authorize } from '../../middleware/auth';
import { errorResponse, successResponse } from '../../middleware/response';
import { UserAdminService } from '../../services/user-admin.service';

const service = new UserAdminService();

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const user = await authorize(event, 'admin');
    const username = event.pathParameters?.username;
    if (!username) {
      return successResponse(400, { message: 'username is required' });
    }
    if (username === user?.email) {
      return successResponse(400, { message: 'Cannot delete yourself' });
    }
    await service.deleteUser(username);
    return successResponse(200, { message: 'User deleted' });
  } catch (error) {
    return errorResponse(error);
  }
};
