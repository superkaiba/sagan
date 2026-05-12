const ALLOWED_SCHEMES = ['sagan://', 'exp://', 'exp+sagan://'];

export function isAllowedMobileRedirect(url: string): boolean {
  return ALLOWED_SCHEMES.some((scheme) => url.startsWith(scheme));
}

export function appendQuery(url: string, params: Record<string, string>): string {
  const sep = url.includes('?') ? '&' : '?';
  const qs = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  return `${url}${sep}${qs}`;
}
