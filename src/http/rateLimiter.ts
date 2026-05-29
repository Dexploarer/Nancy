// Fixed-window rate limiter for the public HTTP API. The /api/* endpoints are
// unauthenticated relative to the resource and some (deployment/execution
// verification) hold a request open while polling the chain, so an unthrottled
// caller can exhaust the event loop, sockets, and the RPC quota. We apply a
// per-client window plus a global ceiling as a backstop against header spoofing.

export class FixedWindowRateLimiter {
  private readonly windows = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = () => Date.now()
  ) {}

  // Returns true if the request is allowed; false once the key exceeds `limit`
  // within the current window.
  allow(key: string): boolean {
    const t = this.now();
    const window = this.windows.get(key);
    if (window === undefined || t >= window.resetAt) {
      this.windows.set(key, { count: 1, resetAt: t + this.windowMs });
      this.prune(t);
      return true;
    }
    if (window.count >= this.limit) {
      return false;
    }
    window.count += 1;
    return true;
  }

  // Drop expired windows so the map cannot grow without bound under key churn.
  private prune(t: number): void {
    for (const [key, window] of this.windows) {
      if (t >= window.resetAt) {
        this.windows.delete(key);
      }
    }
  }
}

// Best-effort client identity for rate-limit bucketing. Behind cloudflared the
// socket peer is always localhost, so we trust the proxy-set headers; the global
// ceiling covers the case where a caller forges these.
export function clientKeyFromHeaders(headers: Headers): string {
  const cf = headers.get("cf-connecting-ip");
  if (cf !== null && cf.length > 0) {
    return cf;
  }
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded !== null && forwarded.length > 0) {
    return forwarded.split(",")[0]!.trim();
  }
  return "anonymous";
}
