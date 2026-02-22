import { config } from '../../../../config';

export const siteConfig = {
  treeName: config.treeName,
  description: config.description,
  owner: config.owner,
  familyName: config.familyName,
  heroEyebrow: config.heroEyebrow,
  heroBody: config.heroBody,
  ctaHeading: config.ctaHeading,
  ctaBody: config.ctaBody,
  adminEmail: config.admin.email,
  about: config.about,
} as const;

const ROLE_LABELS: Record<string, string> = {
  admins: 'Admin',
  editors: 'Editor',
  visitors: 'Visitor',
};

export function displayRole(role: string | null): string {
  if (!role) return 'Visitor';
  return ROLE_LABELS[role] ?? role;
}
