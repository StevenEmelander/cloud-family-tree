import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  AdminUpdateUserAttributesCommand,
  CognitoIdentityProviderClient,
} from '@aws-sdk/client-cognito-identity-provider';
import { PublishCommand, SNSClient } from '@aws-sdk/client-sns';
import { authorize } from '../../middleware/auth';
import { errorResponse, successResponse } from '../../middleware/response';

const sns = new SNSClient({});
const cognito = new CognitoIdentityProviderClient({});

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const user = await authorize(event, 'authenticated');
    if (!user) return errorResponse(new Error('Authentication required'));

    // Only visitors should request editor access
    if (user.role === 'admins' || user.role === 'editors') {
      return successResponse(400, { message: 'You already have editor or admin access' });
    }

    // Set custom attribute to track the request
    await cognito.send(
      new AdminUpdateUserAttributesCommand({
        UserPoolId: process.env.COGNITO_USER_POOL_ID!,
        Username: user.userId,
        UserAttributes: [
          { Name: 'custom:editorRequested', Value: new Date().toISOString() },
        ],
      }),
    );

    await sns.send(
      new PublishCommand({
        TopicArn: process.env.ALERT_TOPIC_ARN,
        Subject: 'Editor Access Request',
        Message: `${user.name} (${user.email}) is requesting editor access. Go to the admin panel to approve or deny this request.`,
      }),
    );

    return successResponse(200, { message: 'Editor access requested. An administrator will review your request.' });
  } catch (error) {
    return errorResponse(error);
  }
};
