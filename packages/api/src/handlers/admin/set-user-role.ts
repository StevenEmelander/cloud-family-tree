import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { authorize } from '../../middleware/auth';
import { AppError } from '../../middleware/error-handler';
import { errorResponse, successResponse } from '../../middleware/response';
import { UserAdminService } from '../../services/user-admin.service';

const service = new UserAdminService();

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const user = await authorize(event, 'admin');
    const body = JSON.parse(event.body || '{}');
    if (!body.username || !body.role) {
      throw new AppError(400, 'username and role are required');
    }
    if (body.role !== 'admin' && body.role !== 'editor' && body.role !== 'visitor') {
      throw new AppError(400, 'role must be admin, editor, or visitor');
    }
    if (body.username === user?.email) {
      throw new AppError(400, 'Cannot change your own role');
    }
    await service.setUserRole(body.username, body.role);
    return successResponse(200, { message: `User role set to ${body.role}` });
  } catch (error) {
    return errorResponse(error);
  }
};
