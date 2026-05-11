// Hand-rolled session-based auth. Lucia v3 is now deprecated; the maintainer's
// guidance is to manage sessions directly with the database, which is what
// `./session.ts` does.
//
// Login / logout HTTP handlers and the cookie helpers are implemented in
// `apps/web/app/api/auth/*` because they depend on Next.js's request/response
// surfaces. This package owns the framework-agnostic primitives.

export { hashPassword, verifyPassword } from './password';
export {
  createSession,
  validateSession,
  invalidateSession,
  invalidateUserSessions,
  purgeExpiredSessions,
  type SessionContext,
} from './session';

// Cookie name retained as 'eps_session' (not 'sagan_session') so existing
// signed-in browser sessions keep working through the rebrand. Cookies are
// invisible to the user; renaming would log everyone out.
export { SESSION_COOKIE_NAME, SESSION_TTL_DAYS } from './constants';
