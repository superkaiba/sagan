import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC_PATHS = [
  '/login',
  '/signup',
  '/api/auth/login',
  '/api/auth/signup',
  '/api/auth/logout',
  '/api/auth/me',
  '/api/auth/google/start',
  '/api/auth/google/callback',
];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-sagan-pathname', pathname);

  // Allow public paths and asset paths.
  if (
    PUBLIC_PATHS.includes(pathname) ||
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/favicon') ||
    pathname === '/manifest.webmanifest' ||
    pathname.startsWith('/digest/') ||
    pathname.startsWith('/d/') ||
    pathname.startsWith('/p/') ||
    pathname.startsWith('/r/') ||
    pathname.startsWith('/artifact/') ||
    pathname === '/mentor/updates' ||
    pathname === '/api/artifacts/publish' ||
    pathname.startsWith('/api/mentor/')
  ) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  if (pathname.startsWith('/api/') && req.headers.get('authorization')?.startsWith('Bearer ')) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  // Cheap check: presence of session cookie. Validation happens in the
  // server component / route handler that needs the user. Bouncing
  // unauthenticated requests at the edge keeps DB-touching auth out of
  // the middleware (which would slow every request).
  const hasSession = req.cookies.has('eps_session');
  if (!hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
