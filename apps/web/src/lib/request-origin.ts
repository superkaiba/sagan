export function getRequestOrigin(req: Request) {
  const url = new URL(req.url);
  const forwardedHost = req.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
  const forwardedProto = req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const host = forwardedHost || req.headers.get('host') || url.host;
  const proto = forwardedProto || url.protocol.replace(':', '') || 'http';
  return `${proto}://${host}`;
}
