/** Task routes: create, list, get, pause/kill/redirect. M0: persistence only;
 * actual agent scheduling lands in M3 (agent-control service). */
import { Hono } from "hono";
import { z } from "zod";
import { and, eq } from "drizzle-orm";

import { agentRun, task } from "../db/schema.ts";
import { getDb } from "../db/client.ts";
import { authMiddleware } from "../auth/middleware.ts";
import type { AuthPrincipal } from "../auth/index.ts";

export const taskRoutes = new Hono<{ Variables: { principal: AuthPrincipal } }>();

const createSchema = z.object({
  title: z.string().min(1).max(200),
  spec: z.string().min(1),
  budget_usd: z.number().positive().max(100),
  deadline: z.string().datetime().optional(),
  runtime_pref: z.enum(["local", "cloud"]).default("local"),
  repo_ref: z.string().optional(),
});

taskRoutes.use("*", authMiddleware());

taskRoutes.post("/v1/tasks", async (c) => {
  const p = c.get("principal")!;
  const parsed = createSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
  const body = parsed.data;
  const db = getDb();
  const t = await db
    .insert(task)
    .values({
      org_id: p.org_id,
      user_id: p.user_id,
      title: body.title,
      spec: body.spec,
      budget_usd: String(body.budget_usd),
      deadline: body.deadline ? new Date(body.deadline) : null,
      runtime_pref: body.runtime_pref,
      repo_ref: body.repo_ref,
    })
    .returning();
  return c.json({ task: t[0] }, 201);
});

taskRoutes.get("/v1/tasks", async (c) => {
  const p = c.get("principal")!;
  const db = getDb();
  const rows = await db.select().from(task).where(eq(task.org_id, p.org_id)).limit(100);
  return c.json({ tasks: rows });
});

taskRoutes.get("/v1/tasks/:id", async (c) => {
  const p = c.get("principal")!;
  const id = c.req.param("id");
  const db = getDb();
  const rows = await db.select().from(task).where(and(eq(task.id, id), eq(task.org_id, p.org_id))).limit(1);
  if (rows.length === 0) return c.json({ error: "not_found" }, 404);
  const runs = await db.select().from(agentRun).where(eq(agentRun.task_id, id)).limit(50);
  return c.json({ task: rows[0], runs });
});

taskRoutes.post("/v1/tasks/:id/:action", async (c) => {
  const p = c.get("principal")!;
  const id = c.req.param("id");
  const action = c.req.param("action") as "pause" | "kill" | "redirect";
  if (!["pause", "kill", "redirect"].includes(action)) return c.json({ error: "invalid_action" }, 400);
  // M0: stub. Real implementation will signal agent-control via the event bus.
  return c.json({ ok: true, id, action, todo: "wire_to_agent_control_in_M3" });
});
