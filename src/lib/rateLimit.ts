/**
 * Fixed-window counters for the two endpoints that must not be free to hammer:
 * the operator password gate and the OTP send that puts a real SMS on the wire.
 *
 * Deliberately in-memory. The console runs as a single Node process on one VM
 * (see fly.toml), so a shared store would be infrastructure for no gain — but it
 * does mean the windows reset on deploy or restart, and would not be shared if
 * this were ever scaled to several machines. The password gate is the one that
 * would need a real store first.
 */

export interface RateLimitResult {
  /** False when the caller is over budget and must be turned away. */
  allowed: boolean;
  /** Seconds until the window rolls over — sent as Retry-After. */
  retryAfterSec: number;
  /** Requests left in the current window once this one is counted. */
  remaining: number;
}

interface Window {
  count: number;
  resetAt: number;
}

interface Bucket {
  limit: number;
  windowMs: number;
  windows: Map<string, Window>;
}

const buckets = new Map<string, Bucket>();

/** Keeps abandoned keys (one per attacker IP, one per phone number) from piling up. */
function sweep(bucket: Bucket, nowMs: number) {
  for (const [key, window] of bucket.windows) {
    if (window.resetAt <= nowMs) bucket.windows.delete(key);
  }
}

function bucketFor(name: string, limit: number, windowMs: number): Bucket {
  let bucket = buckets.get(name);
  if (!bucket) {
    bucket = { limit, windowMs, windows: new Map() };
    buckets.set(name, bucket);
  }
  // Env-driven limits are read at call time, so keep the bucket in step with them.
  bucket.limit = limit;
  bucket.windowMs = windowMs;
  return bucket;
}

/**
 * Count one hit against `key` and say whether it fits in the budget.
 *
 * `peek` asks the same question without spending anything, for a caller that
 * wants to reject before doing expensive work and count only the real attempt.
 */
export function rateLimit(
  name: string,
  key: string,
  limit: number,
  windowMs: number,
  { peek = false }: { peek?: boolean } = {}
): RateLimitResult {
  const nowMs = Date.now();
  const bucket = bucketFor(name, limit, windowMs);

  if (bucket.windows.size > 512) sweep(bucket, nowMs);

  let window = bucket.windows.get(key);
  if (!window || window.resetAt <= nowMs) {
    window = { count: 0, resetAt: nowMs + windowMs };
    bucket.windows.set(key, window);
  }

  const retryAfterSec = Math.max(1, Math.ceil((window.resetAt - nowMs) / 1000));

  if (window.count >= limit) {
    return { allowed: false, retryAfterSec, remaining: 0 };
  }
  if (!peek) window.count += 1;
  return { allowed: true, retryAfterSec, remaining: Math.max(0, limit - window.count) };
}

/** Wipe a key's window — used to forgive an IP the moment it authenticates. */
export function rateLimitReset(name: string, key: string) {
  buckets.get(name)?.windows.delete(key);
}

/**
 * Best-effort caller identity. Fly terminates TLS and forwards the real address,
 * so trust its header first; `x-forwarded-for` may carry a proxy chain, and its
 * first entry is the client. Falls back to a single shared bucket rather than
 * letting an unidentifiable caller through unmetered.
 */
export function clientIp(req: Request): string {
  const flyIp = req.headers.get("fly-client-ip");
  if (flyIp) return flyIp.trim();
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

/** Positive integer from the environment, or the built-in default. */
export function limitFromEnv(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : fallback;
}
