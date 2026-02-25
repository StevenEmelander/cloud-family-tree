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

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const QUALIFIER_LABELS: Record<string, string> = {
  ABT: 'About',
  BEF: 'Before',
  AFT: 'After',
  EST: 'About',
  CAL: 'About',
};

/** Formats a stored flex date (YYYY, YYYY-MM, or YYYY-MM-DD) for display */
export function formatDate(date: string, qualifier?: string): string {
  const parts = date.split('-');
  let formatted: string;
  if (parts.length === 1) formatted = parts[0] ?? '';
  else if (parts.length === 2) {
    const monthIdx = Number.parseInt(parts[1] ?? '', 10) - 1;
    formatted = `${MONTH_NAMES[monthIdx] ?? parts[1]} ${parts[0]}`;
  } else {
    const monthIdx = Number.parseInt(parts[1] ?? '', 10) - 1;
    formatted = `${Number.parseInt(parts[2] ?? '', 10)} ${MONTH_NAMES[monthIdx] ?? parts[1]} ${parts[0]}`;
  }
  if (qualifier) {
    const label = QUALIFIER_LABELS[qualifier] || qualifier;
    return `${label} ${formatted}`;
  }
  return formatted;
}

/** Formats birth/death years as a lifespan string ("1920–1985", "b. 1920", "d. 1985") */
export function formatLifespan(birthDate?: string, deathDate?: string): string {
  if (birthDate && deathDate) return `${birthDate.slice(0, 4)}\u2013${deathDate.slice(0, 4)}`;
  if (birthDate) return `b. ${birthDate.slice(0, 4)}`;
  if (deathDate) return `d. ${deathDate.slice(0, 4)}`;
  return '';
}
