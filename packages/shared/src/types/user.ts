export enum UserRole {
  ADMIN = 'admins',
  EDITOR = 'editors',
  VISITOR = 'visitors',
}

export interface User {
  userId: string;
  email: string;
  name: string;
  role: UserRole | null;
  createdAt: string; // ISO timestamp
  lastLoginAt?: string; // ISO timestamp
}

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
  role: 'admin' | 'editor' | 'visitor';
  createdAt: string;
  enabled: boolean;
  status: string;
  editorRequested?: string; // ISO timestamp when editor access was requested
}
