import {
  AdminAddUserToGroupCommand,
  CognitoIdentityProviderClient,
} from '@aws-sdk/client-cognito-identity-provider';
import { PublishCommand, SNSClient } from '@aws-sdk/client-sns';

const sns = new SNSClient({});
const cognito = new CognitoIdentityProviderClient({});

interface CognitoPostConfirmationEvent {
  version: string;
  triggerSource: string;
  region: string;
  userPoolId: string;
  userName: string;
  request: {
    userAttributes: Record<string, string>;
  };
  response: Record<string, unknown>;
}

export async function handler(event: CognitoPostConfirmationEvent) {
  const { userAttributes } = event.request;
  const name = userAttributes.name || 'Unknown';
  const email = userAttributes.email || 'Unknown';

  // Auto-assign to visitors group so the user can immediately browse and contribute
  try {
    await cognito.send(
      new AdminAddUserToGroupCommand({
        UserPoolId: event.userPoolId,
        Username: event.userName,
        GroupName: 'visitors',
      }),
    );
  } catch (err) {
    console.error('Failed to add user to visitors group:', err);
  }

  try {
    await sns.send(
      new PublishCommand({
        TopicArn: process.env.ALERT_TOPIC_ARN,
        Subject: 'New Family Tree Registration',
        Message: `New visitor: ${name} (${email}) has registered and can now browse and contribute.`,
      }),
    );
  } catch (err) {
    console.error('Failed to send SNS notification:', err);
  }

  return event;
}
