/**
 * Security headers middleware — adds standard security headers to all
 * responses.
 */
import type { MiddlewareHandler } from "hono";

export function securityHeaders(): MiddlewareHandler {
  return async (c, next) => {
    await next();
    c.header("X-Content-Type-Options", "nosniff");
    c.header("X-Frame-Options", "DENY");
    c.header("Referrer-Policy", "strict-origin-when-cross-origin");
    c.header("X-XSS-Protection", "0"); // Modern browsers use CSP instead
    c.header("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
    // HSTS only meaningful over HTTPS; set in production behind TLS
    if (process.env.NODE_ENV === "production") {
      c.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
    }
  };
}
