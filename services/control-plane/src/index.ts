/**
 * Control plane entrypoint — assembles Hono routes and starts the server.
 *
 * M0 surface: health, auth/org/seats, byo-keys, tasks (persistence only),
 * usage (read + ingest). Voice, marketplace, webhooks, memory, skills land in
 * later milestones.
 */
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

import { authRoutes } from "./routes/auth.ts";
import { byoKeyRoutes } from "./routes/byo-key.ts";
import { billingRoutes } from "./routes/billing.ts";
import { healthRoutes } from "./routes/health.ts";
import { marketplaceRoutes } from "./routes/marketplace.ts";
import { taskRoutes } from "./routes/tasks.ts";
import { usageRoutes } from "./routes/usage.ts";
import { rateLimit } from "./middleware/rateLimit.ts";
import { securityHeaders } from "./middleware/securityHeaders.ts";

const app = new Hono();

app.use("*", logger());
app.use("*", securityHeaders());

// CORS — tightened for production. Allowed origins from env var.
const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? "http://localhost:3000,http://localhost:5173,http://localhost:8080").split(",");
app.use(
  "*",
  cors({
    origin: (origin) => {
      if (!origin) return null;
      return allowedOrigins.includes(origin) ? origin : null;
    },
    allowHeaders: ["Authorization", "Content-Type"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    exposeHeaders: ["X-Request-Id"],
    maxAge: 600,
  }),
);

// Request ID for tracing
app.use("*", async (c, next) => {
  const reqId = c.req.header("x-request-id") ?? crypto.randomUUID();
  c.header("X-Request-Id", reqId);
  await next();
});

// Rate limit auth endpoints more aggressively (prevent brute force)
app.use("/v1/auth/*", rateLimit({ windowMs: 60_000, max: 10 }));
// General rate limit for all other API endpoints
app.use("/v1/*", rateLimit({ windowMs: 60_000, max: 100 }));

app.route("/", healthRoutes);
app.route("/", authRoutes);
app.route("/", byoKeyRoutes);
app.route("/", billingRoutes);
app.route("/", marketplaceRoutes);
app.route("/", taskRoutes);
app.route("/", usageRoutes);

app.notFound((c) => c.json({ error: "not_found" }, 404));
app.onError((err, c) => {
  console.error("[control-plane] unhandled", err);
  return c.json({ error: "internal" }, 500);
});

const port = Number(process.env.PORT ?? 8080);

if (import.meta.main) {
  const server = Bun.serve({ port, fetch: app.fetch });
  console.log(`[control-plane] listening on http://localhost:${server.port}`);
}

// NOTE: do NOT `export default app` — Bun auto-serves any default export that
// looks like a server config (Hono apps qualify because they're callable with a
// `fetch` method), which double-binds the port. Import `app` explicitly in tests:
//   import { app } from "./index.ts";
export { app };
