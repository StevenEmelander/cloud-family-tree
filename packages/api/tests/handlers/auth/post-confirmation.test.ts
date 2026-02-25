import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockSend, mockCognitoSend } = vi.hoisted(() => ({
  mockSend: vi.fn(),
  mockCognitoSend: vi.fn().mockResolvedValue({}),
}));

vi.mock('@aws-sdk/client-sns', () => ({
  SNSClient: vi.fn().mockImplementation(function () {
    return { send: mockSend };
  }),
  PublishCommand: vi.fn().mockImplementation(function (input) {
    return input;
  }),
}));

vi.mock('@aws-sdk/client-cognito-identity-provider', () => ({
  CognitoIdentityProviderClient: vi.fn().mockImplementation(function () {
    return { send: mockCognitoSend };
  }),
  AdminAddUserToGroupCommand: vi.fn().mockImplementation(function (input) {
    return input;
  }),
}));

import { handler } from '../../../src/handlers/auth/post-confirmation';

function makeEvent(attrs: Record<string, string> = {}) {
  return {
    version: '1',
    triggerSource: 'PostConfirmation_ConfirmSignUp',
    region: 'us-east-1',
    userPoolId: 'pool-123',
    userName: 'user1',
    request: {
      userAttributes: {
        email: 'test@example.com',
        name: 'Test User',
        ...attrs,
      },
    },
    response: {},
  };
}

describe('Post-confirmation handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ALERT_TOPIC_ARN = 'arn:aws:sns:us-east-1:123:test-topic';
  });

  it('publishes SNS notification with user details', async () => {
    mockSend.mockResolvedValue({});

    const event = makeEvent();
    await handler(event);

    expect(mockSend).toHaveBeenCalledOnce();
    const publishInput = mockSend.mock.calls[0][0];
    expect(publishInput.TopicArn).toBe('arn:aws:sns:us-east-1:123:test-topic');
    expect(publishInput.Subject).toBe('New Family Tree Registration');
    expect(publishInput.Message).toContain('Test User');
    expect(publishInput.Message).toContain('test@example.com');
  });

  it('returns the event unchanged', async () => {
    mockSend.mockResolvedValue({});

    const event = makeEvent();
    const result = await handler(event);

    expect(result).toBe(event);
  });

  it('handles missing name gracefully', async () => {
    mockSend.mockResolvedValue({});

    const event = makeEvent({ name: '', email: 'no-name@test.com' });
    // Override name to empty
    event.request.userAttributes.name = '';
    await handler(event);

    const publishInput = mockSend.mock.calls[0][0];
    expect(publishInput.Message).toContain('no-name@test.com');
  });

  it('does not throw on SNS failure', async () => {
    mockSend.mockRejectedValue(new Error('SNS unavailable'));

    const event = makeEvent();
    const result = await handler(event);

    // Should still return the event
    expect(result).toBe(event);
  });
});
