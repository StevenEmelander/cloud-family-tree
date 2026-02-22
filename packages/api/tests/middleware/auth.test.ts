import type { APIGatewayProxyEvent } from 'aws-lambda';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockVerify } = vi.hoisted(() => ({ mockVerify: vi.fn() }));

vi.mock('aws-jwt-verify', () => ({
  CognitoJwtVerifier: {
    create: () => ({ verify: mockVerify }),
  },
}));

import { authenticate, authorize } from '../../src/middleware/auth';
import { ForbiddenError, UnauthorizedError } from '../../src/middleware/error-handler';

function makeEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    headers: {},
    body: null,
    pathParameters: null,
    queryStringParameters: null,
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    httpMethod: 'GET',
    isBase64Encoded: false,
    path: '/',
    stageVariables: null,
    requestContext: {} as APIGatewayProxyEvent['requestContext'],
    resource: '',
    ...overrides,
  };
}

describe('Auth middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.REQUIRE_AUTH_FOR_READ = 'false';
  });

  describe('authenticate', () => {
    it('throws UnauthorizedError when no Authorization header', async () => {
      const event = makeEvent();
      await expect(authenticate(event)).rejects.toThrow(UnauthorizedError);
    });

    it('verifies Bearer token and returns user', async () => {
      mockVerify.mockResolvedValue({
        sub: 'user-123',
        email: 'test@example.com',
        'cognito:groups': ['admins'],
      });

      const event = makeEvent({ headers: { Authorization: 'Bearer valid-token' } });
      const user = await authenticate(event);

      expect(user.userId).toBe('user-123');
      expect(user.email).toBe('test@example.com');
      expect(user.role).toBe('admins');
      expect(mockVerify).toHaveBeenCalledWith('valid-token');
    });

    it('handles token without Bearer prefix', async () => {
      mockVerify.mockResolvedValue({
        sub: 'user-123',
        email: 'test@example.com',
        'cognito:groups': [],
      });

      const event = makeEvent({ headers: { Authorization: 'raw-token' } });
      const user = await authenticate(event);

      expect(mockVerify).toHaveBeenCalledWith('raw-token');
      expect(user.role).toBeNull();
    });

    it('handles lowercase authorization header', async () => {
      mockVerify.mockResolvedValue({
        sub: 'user-123',
        email: 'test@example.com',
        'cognito:groups': ['editors'],
      });

      const event = makeEvent({ headers: { authorization: 'Bearer token' } });
      const user = await authenticate(event);

      expect(user.role).toBe('editors');
    });

    it('throws UnauthorizedError for invalid token', async () => {
      mockVerify.mockRejectedValue(new Error('Token expired'));

      const event = makeEvent({ headers: { Authorization: 'Bearer expired-token' } });
      await expect(authenticate(event)).rejects.toThrow(UnauthorizedError);
    });

    it('returns null role when user has no groups', async () => {
      mockVerify.mockResolvedValue({
        sub: 'user-123',
        email: 'test@example.com',
      });

      const event = makeEvent({ headers: { Authorization: 'Bearer token' } });
      const user = await authenticate(event);

      expect(user.role).toBeNull();
    });
  });

  describe('authorize', () => {
    describe('read access', () => {
      it('allows public access when REQUIRE_AUTH_FOR_READ is false', async () => {
        process.env.REQUIRE_AUTH_FOR_READ = 'false';
        const event = makeEvent();
        const user = await authorize(event, 'read');
        expect(user).toBeNull();
      });

      it('requires auth when REQUIRE_AUTH_FOR_READ is true', async () => {
        process.env.REQUIRE_AUTH_FOR_READ = 'true';
        const event = makeEvent();
        await expect(authorize(event, 'read')).rejects.toThrow(UnauthorizedError);
      });

      it('authenticates user if token provided even for public read', async () => {
        mockVerify.mockResolvedValue({
          sub: 'user-123',
          email: 'test@example.com',
          'cognito:groups': ['editors'],
        });

        const event = makeEvent({ headers: { Authorization: 'Bearer token' } });
        const user = await authorize(event, 'read');
        expect(user).not.toBeNull();
        expect(user!.userId).toBe('user-123');
      });
    });

    describe('write access', () => {
      it('allows editors to write', async () => {
        mockVerify.mockResolvedValue({
          sub: 'user-123',
          email: 'editor@example.com',
          'cognito:groups': ['editors'],
        });

        const event = makeEvent({ headers: { Authorization: 'Bearer token' } });
        const user = await authorize(event, 'write');
        expect(user).not.toBeNull();
      });

      it('allows admins to write', async () => {
        mockVerify.mockResolvedValue({
          sub: 'user-123',
          email: 'admin@example.com',
          'cognito:groups': ['admins'],
        });

        const event = makeEvent({ headers: { Authorization: 'Bearer token' } });
        const user = await authorize(event, 'write');
        expect(user).not.toBeNull();
      });

      it('denies pending users from writing', async () => {
        mockVerify.mockResolvedValue({
          sub: 'user-123',
          email: 'pending@example.com',
          'cognito:groups': [],
        });

        const event = makeEvent({ headers: { Authorization: 'Bearer token' } });
        await expect(authorize(event, 'write')).rejects.toThrow(ForbiddenError);
      });
    });

    describe('admin access', () => {
      it('allows admins', async () => {
        mockVerify.mockResolvedValue({
          sub: 'user-123',
          email: 'admin@example.com',
          'cognito:groups': ['admins'],
        });

        const event = makeEvent({ headers: { Authorization: 'Bearer token' } });
        const user = await authorize(event, 'admin');
        expect(user).not.toBeNull();
      });

      it('denies editors from admin access', async () => {
        mockVerify.mockResolvedValue({
          sub: 'user-123',
          email: 'editor@example.com',
          'cognito:groups': ['editors'],
        });

        const event = makeEvent({ headers: { Authorization: 'Bearer token' } });
        await expect(authorize(event, 'admin')).rejects.toThrow(ForbiddenError);
      });

      it('denies pending users from admin access', async () => {
        mockVerify.mockResolvedValue({
          sub: 'user-123',
          email: 'pending@example.com',
        });

        const event = makeEvent({ headers: { Authorization: 'Bearer token' } });
        await expect(authorize(event, 'admin')).rejects.toThrow(ForbiddenError);
      });
    });
  });
});
