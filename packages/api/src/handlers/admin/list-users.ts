import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { authorize } from '../../middleware/auth';
import { errorResponse, successResponse } from '../../middleware/response';
import { UserAdminService } from '../../services/user-admin.service';

const service = new UserAdminService();

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    await authorize(event, 'admin');
    const users = await service.listUsers();
    return successResponse(200, { users });
  } catch (error) {
    return errorResponse(error);
  }
};
