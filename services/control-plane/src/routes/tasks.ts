/** Task routes: create, list, get, start agent, stream events, pause/kill. */
import { Hono } from "hono";
import { z } from "zod";
import { and, eq } from "drizzle-orm";

import { agentRun, byoKey, task } from "../db/schema.ts";
import { getDb } from "../db/client.ts";
import { authMiddleware } from "../auth/middleware.ts";
import type { AuthPrincipal } from "../auth/index.ts";

export const taskRoutes = new Hono<{ Variables: { principal: AuthPrincipal } }>();

const LOCAL_AGENT_URL = process.env.LOCAL_AGENT_URL ?? "http://localhost:8083";

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

/** Start the agent on a task. Fetches BYO key, dispatches to local agent. */
taskRoutes.post("/v1/tasks/:id/start", async (c) => {
  const p = c.get("principal")!;
  const id = c.req.param("id");
  const db = getDb();

  // 1. Fetch the task
  const taskRows = await db.select().from(task).where(and(eq(task.id, id), eq(task.org_id, p.org_id))).limit(1);
  if (taskRows.length === 0) return c.json({ error: "not_found" }, 404);
  const t = taskRows[0]!;

  if (t.status === "running") return c.json({ error: "already_running" }, 409);

  // 2. Fetch BYO key for the org (prefer anthropic, then openai)
  const keys = await db.select().from(byoKey).where(eq(byoKey.org_id, p.org_id));
  if (keys.length === 0) {
    return c.json({ error: "no_api_key", message: "Add an API key in Settings first." }, 400);
  }

  // Pick the first available key, prefer anthropic
  const preferredKey = keys.find((k) => k.provider === "anthropic") ?? keys[0]!;
  const decryptedKey = Buffer.from(preferredKey.encrypted_key, "base64").toString("utf8");

  // Determine model based on provider
  const model = preferredKey.provider === "anthropic"
    ? "anthropic:claude-3-5-sonnet-latest"
    : preferredKey.provider === "openai"
      ? "openai:gpt-4o"
      : "anthropic:claude-3-5-sonnet-latest";

  // 3. Dispatch to local agent
  const startBody = {
    spec: t.spec,
    cwd: t.repo_ref ?? process.cwd(),
    org_id: p.org_id,
    model,
    budget_usd: parseFloat(t.budget_usd),
    max_iterations: 20,
    api_key: decryptedKey,
  };

  let agentResp: Response;
  try {
    agentResp = await fetch(`${LOCAL_AGENT_URL}/v1/agent/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(startBody),
    });
  } catch {
    return c.json({ error: "agent_unreachable", message: "Local agent is not running. Start it with: bun scripts/dev-launcher.ts" }, 502);
  }

  if (!agentResp.ok) {
    const errBody = await agentResp.text();
    return c.json({ error: "agent_error", detail: errBody }, 502);
  }

  const agentData = await agentResp.json() as { task_id: string; run_id: string };

  // 4. Create an agent_run record + update task status
  await db.insert(agentRun).values({
    org_id: p.org_id,
    user_id: p.user_id,
    task_id: id,
    runtime: t.runtime_pref ?? "local",
    status: "running",
  });

  await db.update(task).set({ status: "running" }).where(eq(task.id, id));

  return c.json({ ok: true, agent_task_id: agentData.task_id, agent_run_id: agentData.run_id });
});

/** Get agent events for a task (polls local agent). */
taskRoutes.get("/v1/tasks/:id/events", async (c) => {
  const p = c.get("principal")!;
  const id = c.req.param("id");
  const agentTaskId = c.req.query("agent_task_id");

  if (!agentTaskId) return c.json({ error: "agent_task_id required" }, 400);

  // Verify the task belongs to this org
  const db = getDb();
  const taskRows = await db.select().from(task).where(and(eq(task.id, id), eq(task.org_id, p.org_id))).limit(1);
  if (taskRows.length === 0) return c.json({ error: "not_found" }, 404);

  try {
    const resp = await fetch(`${LOCAL_AGENT_URL}/v1/agent/${agentTaskId}`);
    if (!resp.ok) return c.json({ error: "agent_not_found" }, 404);
    const data = await resp.json() as { status: string; events: Array<Record<string, unknown>>; result?: { summary: string; costUsd: number; iterations: number; success: boolean } };
    return c.json(data);
  } catch {
    return c.json({ error: "agent_unreachable" }, 502);
  }
});

taskRoutes.post("/v1/tasks/:id/:action", async (c) => {
  const p = c.get("principal")!;
  const id = c.req.param("id");
  const action = c.req.param("action") as "pause" | "kill" | "redirect";
  if (!["pause", "kill", "redirect"].includes(action)) return c.json({ error: "invalid_action" }, 400);

  if (action === "kill") {
    const agentTaskId = c.req.query("agent_task_id");
    if (agentTaskId) {
      try { await fetch(`${LOCAL_AGENT_URL}/v1/agent/${agentTaskId}/kill`, { method: "POST" }); } catch { /* best effort */ }
    }
    const db = getDb();
    await db.update(task).set({ status: "killed" }).where(eq(task.id, id));
  }

  return c.json({ ok: true, id, action });
});
