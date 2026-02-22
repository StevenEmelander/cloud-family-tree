import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeEvent } from '../../../src/handlers/test-helpers';

// Mock auth middleware
vi.mock('../../../src/middleware/auth', () => ({
  authorize: vi.fn().mockResolvedValue({ userId: 'admin', email: 'a@b.com', role: 'admins' }),
}));

// Mock user admin service
const { mockService } = vi.hoisted(() => ({
  mockService: {
    listUsers: vi.fn(),
    approveUser: vi.fn(),
    deleteUser: vi.fn(),
    setUserRole: vi.fn(),
  },
}));

vi.mock('../../../src/services/user-admin.service', () => ({
  UserAdminService: vi.fn().mockImplementation(() => mockService),
}));

describe('Admin handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /admin/users', () => {
    it('returns list of users', async () => {
      mockService.listUsers.mockResolvedValue([
        { userId: 'u1', email: 'a@b.com', name: 'Admin', role: 'admin' },
      ]);
      const { handler } = await import('../../../src/handlers/admin/list-users');

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.data.users).toHaveLength(1);
      expect(body.data.users[0].role).toBe('admin');
    });
  });

  describe('POST /admin/users/approve', () => {
    it('approves a user', async () => {
      mockService.approveUser.mockResolvedValue(undefined);
      const { handler } = await import('../../../src/handlers/admin/approve-user');

      const event = makeEvent({ body: JSON.stringify({ username: 'newuser' }) });
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      expect(mockService.approveUser).toHaveBeenCalledWith('newuser');
    });

    it('returns 400 when username missing', async () => {
      const { handler } = await import('../../../src/handlers/admin/approve-user');

      const event = makeEvent({ body: JSON.stringify({}) });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
    });
  });

  describe('DELETE /admin/users/:username', () => {
    it('deletes a user', async () => {
      mockService.deleteUser.mockResolvedValue(undefined);
      const { handler } = await import('../../../src/handlers/admin/delete-user');

      const event = makeEvent({ pathParameters: { username: 'other@example.com' } });
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      expect(mockService.deleteUser).toHaveBeenCalledWith('other@example.com');
    });

    it('prevents self-deletion', async () => {
      const { handler } = await import('../../../src/handlers/admin/delete-user');

      const event = makeEvent({ pathParameters: { username: 'a@b.com' } });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.data.message).toBe('Cannot delete yourself');
      expect(mockService.deleteUser).not.toHaveBeenCalled();
    });
  });

  describe('POST /admin/users/set-role', () => {
    it('sets user role to admin', async () => {
      mockService.setUserRole.mockResolvedValue(undefined);
      const { handler } = await import('../../../src/handlers/admin/set-user-role');

      const event = makeEvent({
        body: JSON.stringify({ username: 'u1', role: 'admin' }),
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      expect(mockService.setUserRole).toHaveBeenCalledWith('u1', 'admin');
    });

    it('sets user role to editor', async () => {
      mockService.setUserRole.mockResolvedValue(undefined);
      const { handler } = await import('../../../src/handlers/admin/set-user-role');

      const event = makeEvent({
        body: JSON.stringify({ username: 'u1', role: 'editor' }),
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
    });

    it('rejects invalid role', async () => {
      const { handler } = await import('../../../src/handlers/admin/set-user-role');

      const event = makeEvent({
        body: JSON.stringify({ username: 'u1', role: 'superadmin' }),
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
    });

    it('returns 400 when username missing', async () => {
      const { handler } = await import('../../../src/handlers/admin/set-user-role');

      const event = makeEvent({
        body: JSON.stringify({ role: 'admin' }),
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
    });

    it('returns 400 when role missing', async () => {
      const { handler } = await import('../../../src/handlers/admin/set-user-role');

      const event = makeEvent({
        body: JSON.stringify({ username: 'u1' }),
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
    });

    it('prevents self role change', async () => {
      const { handler } = await import('../../../src/handlers/admin/set-user-role');

      const event = makeEvent({
        body: JSON.stringify({ username: 'a@b.com', role: 'editor' }),
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.data.message).toBe('Cannot change your own role');
      expect(mockService.setUserRole).not.toHaveBeenCalled();
    });
  });
});
