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
import { taskRoutes } from "./routes/tasks.ts";
import { usageRoutes } from "./routes/usage.ts";

const app = new Hono();

app.use("*", logger());
app.use(
  "*",
  cors({
    origin: (origin) => origin, // M0: permissive; tighten before launch.
    allowHeaders: ["Authorization", "Content-Type"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  }),
);

app.route("/", healthRoutes);
app.route("/", authRoutes);
app.route("/", byoKeyRoutes);
app.route("/", billingRoutes);
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
