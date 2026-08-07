/** Usage routes: read aggregated usage + raw events for an org. M0: reads from
 * the usage_event table directly; ClickHouse aggregation lands when volume
 * justifies it. */
import { Hono } from "hono";
import { eq, desc, and, gte } from "drizzle-orm";

import { usageEvent } from "../db/schema.ts";
import { getDb } from "../db/client.ts";
import { authMiddleware } from "../auth/middleware.ts";
import type { AuthPrincipal } from "../auth/index.ts";

export const usageRoutes = new Hono<{ Variables: { principal: AuthPrincipal } }>();

usageRoutes.use("*", authMiddleware());

usageRoutes.get("/v1/usage", async (c) => {
  const p = c.get("principal")!;
  const db = getDb();
  const since = c.req.query("since") ? new Date(c.req.query("since")!) : new Date(Date.now() - 30 * 86400_000);
  const rows = await db
    .select()
    .from(usageEvent)
    .where(and(eq(usageEvent.org_id, p.org_id), gte(usageEvent.ts, since)))
    .orderBy(desc(usageEvent.ts))
    .limit(500);
  // Aggregate by type.
  const byType: Record<string, { units: number; cost_usd: number }> = {};
  for (const r of rows) {
    const k = r.type;
    byType[k] ??= { units: 0, cost_usd: 0 };
    byType[k]!.units += Number(r.units);
    byType[k]!.cost_usd += Number(r.cost_usd);
  }
  return c.json({ events: rows, by_type: byType });
});

/** Internal endpoint for runtimes to record usage events. Auth via mTLS in prod;
 * M0: API key with `usage:write` scope. */
usageRoutes.post("/v1/usage/events", authMiddleware(), async (c) => {
  const p = c.get("principal")!;
  const body = (await c.req.json().catch(() => ({}))) as {
    agent_run_id?: string;
    type?: string;
    units?: number;
    cost_usd?: number;
  };
  if (!body.type || body.units == null || body.cost_usd == null) {
    return c.json({ error: "invalid_body" }, 400);
  }
  const db = getDb();
  const row = await db
    .insert(usageEvent)
    .values({
      org_id: p.org_id,
      agent_run_id: body.agent_run_id,
      type: body.type as never,
      units: String(body.units),
      cost_usd: String(body.cost_usd),
    })
    .returning({ id: usageEvent.id, ts: usageEvent.ts });
  return c.json({ event: row[0] }, 201);
});
