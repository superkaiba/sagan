import { NextResponse, type NextRequest } from 'next/server';

// 2026-07-06: login is no longer required to view the dashboard. The edge
// layer only tags the request with its pathname (consumed by the (app)
// layout); reads are public, and mutating API routes still enforce auth
// in their handlers via requireSession/requireOwner.
export function proxy(req: NextRequest) {
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-sagan-pathname', req.nextUrl.pathname);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
