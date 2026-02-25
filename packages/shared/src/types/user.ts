/** Cognito group names (plural form). Used in JWT tokens and auth middleware. */
export enum UserRole {
  ADMIN = 'admins',
  EDITOR = 'editors',
  VISITOR = 'visitors',
}

/** Display-friendly role names (singular form). Used in admin UI. */
export type DisplayRole = 'admin' | 'editor' | 'visitor';

export interface AuthenticatedUser {
  userId: string;
  email: string;
  name: string;
  role: UserRole | null;
}

export interface AdminUserListItem {
  userId: string;
  email: string;
  name: string;
  role: DisplayRole;
  createdAt: string;
  enabled: boolean;
  status: string;
  editorRequested?: string; // ISO timestamp when editor access was requested
}
