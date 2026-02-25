import {
  AdminAddUserToGroupCommand,
  AdminDeleteUserCommand,
  AdminListGroupsForUserCommand,
  AdminRemoveUserFromGroupCommand,
  AdminUpdateUserAttributesCommand,
  CognitoIdentityProviderClient,
  ListUsersCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import type { AdminUserListItem, DisplayRole } from '@cloud-family-tree/shared';

const cognito = new CognitoIdentityProviderClient({});
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID ?? '';

function getAttr(attrs: { Name?: string; Value?: string }[] | undefined, name: string): string {
  return attrs?.find((a) => a.Name === name)?.Value || '';
}

export class UserAdminService {
  async listUsers(): Promise<AdminUserListItem[]> {
    const result = await cognito.send(new ListUsersCommand({ UserPoolId: USER_POOL_ID }));

    const users: AdminUserListItem[] = [];
    for (const u of result.Users || []) {
      const groupsResult = await cognito.send(
        new AdminListGroupsForUserCommand({
          UserPoolId: USER_POOL_ID,
          Username: u.Username ?? '',
        }),
      );

      const group = groupsResult.Groups?.[0]?.GroupName;
      let role: AdminUserListItem['role'] = 'visitor';
      if (group === 'admins') role = 'admin';
      else if (group === 'editors') role = 'editor';
      else if (group === 'visitors') role = 'visitor';

      const editorRequested = getAttr(u.Attributes, 'custom:editorRequested');
      users.push({
        userId: u.Username ?? '',
        email: getAttr(u.Attributes, 'email'),
        name: getAttr(u.Attributes, 'name'),
        role,
        createdAt: u.UserCreateDate?.toISOString() || '',
        enabled: u.Enabled ?? true,
        status: u.UserStatus || '',
        ...(editorRequested ? { editorRequested } : {}),
      });
    }

    return users;
  }

  async approveUser(username: string): Promise<void> {
    // Remove from visitors group first
    try {
      await cognito.send(
        new AdminRemoveUserFromGroupCommand({
          UserPoolId: USER_POOL_ID,
          Username: username,
          GroupName: 'visitors',
        }),
      );
    } catch {
      // User may not be in visitors group
    }

    await cognito.send(
      new AdminAddUserToGroupCommand({
        UserPoolId: USER_POOL_ID,
        Username: username,
        GroupName: 'editors',
      }),
    );

    // Clear the editor request flag
    await cognito.send(
      new AdminUpdateUserAttributesCommand({
        UserPoolId: USER_POOL_ID,
        Username: username,
        UserAttributes: [{ Name: 'custom:editorRequested', Value: '' }],
      }),
    );
  }

  async deleteUser(username: string): Promise<void> {
    await cognito.send(
      new AdminDeleteUserCommand({
        UserPoolId: USER_POOL_ID,
        Username: username,
      }),
    );
  }

  async setUserRole(username: string, role: DisplayRole): Promise<void> {
    // Remove from all groups first
    const groupsResult = await cognito.send(
      new AdminListGroupsForUserCommand({
        UserPoolId: USER_POOL_ID,
        Username: username,
      }),
    );

    for (const group of groupsResult.Groups || []) {
      await cognito.send(
        new AdminRemoveUserFromGroupCommand({
          UserPoolId: USER_POOL_ID,
          Username: username,
          GroupName: group.GroupName ?? '',
        }),
      );
    }

    // Add to new group
    const groupName = role === 'admin' ? 'admins' : role === 'editor' ? 'editors' : 'visitors';
    await cognito.send(
      new AdminAddUserToGroupCommand({
        UserPoolId: USER_POOL_ID,
        Username: username,
        GroupName: groupName,
      }),
    );
  }
}
