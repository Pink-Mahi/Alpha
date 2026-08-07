/**
 * Rate limiting middleware — simple in-memory token bucket per IP.
 *
 * M4: in-memory (single process). For multi-instance deployments, swap to
 * Redis-backed rate limiting.
 */
import type { MiddlewareHandler } from "hono";

interface Bucket {
  tokens: number;
  lastRefill: number;
}

const buckets = new Map<string, Bucket>();

export function rateLimit(opts: {
  windowMs: number;
  max: number;
}): MiddlewareHandler {
  return async (c, next) => {
    // Skip rate limiting in test mode
    if (process.env.RATE_LIMIT_DISABLED === "1") {
      await next();
      return;
    }

    const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? c.req.header("x-real-ip") ?? "unknown";
    const key = `${ip}`;
    const now = Date.now();

    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { tokens: opts.max, lastRefill: now };
      buckets.set(key, bucket);
    }

    // Refill tokens based on elapsed time
    const elapsed = now - bucket.lastRefill;
    const refill = (elapsed / opts.windowMs) * opts.max;
    bucket.tokens = Math.min(opts.max, bucket.tokens + refill);
    bucket.lastRefill = now;

    if (bucket.tokens < 1) {
      return c.json(
        { error: "rate_limited", retry_after_ms: opts.windowMs - elapsed },
        429,
      );
    }

    bucket.tokens -= 1;
    await next();
  };
}
