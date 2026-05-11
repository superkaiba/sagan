import type { SessionContext } from '@sagan/auth';

const DEFAULT_FULL_ACCESS_EMAIL = 'thomasjiralerspong@gmail.com';

function splitEmails(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function getFullDashboardEmails(): string[] {
  return [
    DEFAULT_FULL_ACCESS_EMAIL,
    ...splitEmails(process.env.DASHBOARD_OWNER_EMAIL),
    ...splitEmails(process.env.DASHBOARD_FULL_ACCESS_EMAILS),
  ].filter((email, index, all) => all.indexOf(email) === index);
}

export function hasFullDashboardAccessEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return getFullDashboardEmails().includes(email.trim().toLowerCase());
}

export function hasFullDashboardAccess(session: SessionContext): boolean {
  return session.user.role === 'owner' || hasFullDashboardAccessEmail(session.user.email);
}
