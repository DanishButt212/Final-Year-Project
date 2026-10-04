/** Strips the IPv4-in-IPv6 prefix so "::ffff:203.0.113.45" and "203.0.113.45" are the same host. */
export function normalizeIp(ip?: string | null): string | null {
  if (!ip) return null;
  const v = ip.trim();
  if (!v) return null;
  return (v.startsWith('::ffff:') ? v.slice(7) : v).slice(0, 64);
}

/** Loopback hosts (this machine) must never be blocked: that would lock the developer out. */
export function isLoopback(ip: string | null | undefined): boolean {
  const v = normalizeIp(ip);
  return v === '::1' || v === 'localhost' || (v !== null && /^127\./.test(v));
}
