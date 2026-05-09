// Hand-rolled session-based auth. Lucia v3 is now deprecated; the maintainer's
// guidance is to manage sessions directly with the database, which is what
// `./session.ts` does.
//
// Login / logout HTTP handlers and the cookie helpers are implemented in
// `apps/web/app/api/auth/*` because they depend on Next.js's request/response
// surfaces. This package owns the framework-agnostic primitives.

export { hashPassword, verifyPassword } from './password.js';
export {
  createSession,
  validateSession,
  invalidateSession,
  invalidateUserSessions,
  purgeExpiredSessions,
  type SessionContext,
} from './session.js';

export const SESSION_COOKIE_NAME = 'eps_session';
export const SESSION_TTL_DAYS = 60;
