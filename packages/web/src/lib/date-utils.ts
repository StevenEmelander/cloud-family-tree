/** Formats an ISO timestamp as a relative time string ("5m ago", "2h ago", etc.) */
export function formatRelativeDate(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

/** Formats birth/death years as a lifespan string ("1920–1985", "b. 1920", "d. 1985") */
export function formatLifespan(birthDate?: string, deathDate?: string): string {
  if (birthDate && deathDate) return `${birthDate.slice(0, 4)}\u2013${deathDate.slice(0, 4)}`;
  if (birthDate) return `b. ${birthDate.slice(0, 4)}`;
  if (deathDate) return `d. ${deathDate.slice(0, 4)}`;
  return '';
}
