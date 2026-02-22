/** Returns true if the user has edit permissions (admin or editor role) */
export function canEditPeople(user: { role?: string | null } | null | undefined): boolean {
  return user?.role === 'admins' || user?.role === 'editors';
}
