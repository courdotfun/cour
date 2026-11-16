import "server-only";

// Best-effort in-memory limiter (per server isolate). On Vercel this bounds abuse
// per warm instance; a durable store (Upstash/Redis) can replace it later without
// changing callers. Good enough to protect the write endpoints during beta.
type Bucket = { count: number; reset: number };
const buckets = new Map<string, Bucket>();

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { ok: boolean; remaining: number; retryAfter?: number } {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now > b.reset) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    return { ok: true, remaining: limit - 1 };
  }
  if (b.count >= limit) {
    return { ok: false, remaining: 0, retryAfter: Math.ceil((b.reset - now) / 1000) };
  }
  b.count += 1;
  return { ok: true, remaining: limit - b.count };
}

export function clientIp(req: Request): string {
  const h = req.headers;
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "unknown"
  );
}

/** Returns a 429 Response if over the limit, else null. */
export function limitOr429(
  req: Request,
  route: string,
  limit: number,
  windowMs: number,
): Response | null {
  const r = rateLimit(`${route}:${clientIp(req)}`, limit, windowMs);
  if (r.ok) return null;
  return Response.json(
    { error: "rate_limited" },
    { status: 429, headers: r.retryAfter ? { "retry-after": String(r.retryAfter) } : undefined },
  );
}
