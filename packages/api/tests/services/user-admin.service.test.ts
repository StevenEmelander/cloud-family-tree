import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockSend } = vi.hoisted(() => ({ mockSend: vi.fn() }));

vi.mock('@aws-sdk/client-cognito-identity-provider', () => ({
  CognitoIdentityProviderClient: vi.fn().mockImplementation(() => ({ send: mockSend })),
  ListUsersCommand: vi.fn().mockImplementation((input) => ({ ...input, _type: 'ListUsers' })),
  AdminListGroupsForUserCommand: vi
    .fn()
    .mockImplementation((input) => ({ ...input, _type: 'AdminListGroups' })),
  AdminAddUserToGroupCommand: vi
    .fn()
    .mockImplementation((input) => ({ ...input, _type: 'AdminAddToGroup' })),
  AdminRemoveUserFromGroupCommand: vi
    .fn()
    .mockImplementation((input) => ({ ...input, _type: 'AdminRemoveFromGroup' })),
  AdminDeleteUserCommand: vi
    .fn()
    .mockImplementation((input) => ({ ...input, _type: 'AdminDeleteUser' })),
  AdminUpdateUserAttributesCommand: vi
    .fn()
    .mockImplementation((input) => ({ ...input, _type: 'AdminUpdateUserAttributes' })),
}));

import { UserAdminService } from '../../src/services/user-admin.service';

describe('UserAdminService', () => {
  let service: UserAdminService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new UserAdminService();
  });

  describe('listUsers', () => {
    it('returns users with their roles', async () => {
      mockSend.mockImplementation((cmd) => {
        if (cmd._type === 'ListUsers') {
          return {
            Users: [
              {
                Username: 'user1',
                Attributes: [
                  { Name: 'email', Value: 'admin@test.com' },
                  { Name: 'name', Value: 'Admin User' },
                ],
                UserCreateDate: new Date('2024-01-01'),
                Enabled: true,
                UserStatus: 'CONFIRMED',
              },
              {
                Username: 'user2',
                Attributes: [
                  { Name: 'email', Value: 'pending@test.com' },
                  { Name: 'name', Value: 'Pending User' },
                ],
                UserCreateDate: new Date('2024-01-02'),
                Enabled: true,
                UserStatus: 'CONFIRMED',
              },
            ],
          };
        }
        if (cmd._type === 'AdminListGroups') {
          if (cmd.Username === 'user1') {
            return { Groups: [{ GroupName: 'admins' }] };
          }
          return { Groups: [] };
        }
        return {};
      });

      const users = await service.listUsers();
      expect(users).toHaveLength(2);
      expect(users[0].role).toBe('admin');
      expect(users[0].email).toBe('admin@test.com');
      expect(users[1].role).toBe('visitor');
    });
  });

  describe('setUserRole', () => {
    it('changes user role from editor to admin', async () => {
      mockSend.mockImplementation((cmd) => {
        if (cmd._type === 'AdminListGroups') {
          return { Groups: [{ GroupName: 'editors' }] };
        }
        return {};
      });

      await service.setUserRole('user1', 'admin');

      const calls = mockSend.mock.calls;
      const removeCall = calls.find((c) => c[0]._type === 'AdminRemoveFromGroup');
      const addCall = calls.find((c) => c[0]._type === 'AdminAddToGroup');
      expect(removeCall).toBeDefined();
      expect(addCall).toBeDefined();
      expect(addCall[0].GroupName).toBe('admins');
    });

    it('changes user role from admin to editor', async () => {
      mockSend.mockImplementation((cmd) => {
        if (cmd._type === 'AdminListGroups') {
          return { Groups: [{ GroupName: 'admins' }] };
        }
        return {};
      });

      await service.setUserRole('user1', 'editor');

      const calls = mockSend.mock.calls;
      const removeCall = calls.find((c) => c[0]._type === 'AdminRemoveFromGroup');
      const addCall = calls.find((c) => c[0]._type === 'AdminAddToGroup');
      expect(removeCall).toBeDefined();
      expect(addCall).toBeDefined();
      expect(addCall[0].GroupName).toBe('editors');
    });
  });

  describe('deleteUser', () => {
    it('deletes a user', async () => {
      mockSend.mockResolvedValue({});

      await service.deleteUser('someuser');

      const deleteCall = mockSend.mock.calls.find((c) => c[0]._type === 'AdminDeleteUser');
      expect(deleteCall).toBeDefined();
      expect(deleteCall[0].Username).toBe('someuser');
    });
  });

  describe('approveUser', () => {
    it('adds user to editors group', async () => {
      mockSend.mockResolvedValue({});

      await service.approveUser('newuser');

      const addCall = mockSend.mock.calls.find((c) => c[0]._type === 'AdminAddToGroup');
      expect(addCall).toBeDefined();
      expect(addCall[0].GroupName).toBe('editors');
      expect(addCall[0].Username).toBe('newuser');
    });
  });

});

