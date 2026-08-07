/** Conversation routes: send messages, list history, edit tasks. */
import { Hono } from "hono";
import { z } from "zod";
import { and, eq, asc } from "drizzle-orm";

import { agentRun, byoKey, task, taskMessage } from "../db/schema.ts";
import { getDb } from "../db/client.ts";
import { authMiddleware } from "../auth/middleware.ts";
import type { AuthPrincipal } from "../auth/index.ts";

export const conversationRoutes = new Hono<{ Variables: { principal: AuthPrincipal } }>();

conversationRoutes.use("*", authMiddleware());

const LOCAL_AGENT_URL = process.env.LOCAL_AGENT_URL ?? "http://localhost:8083";

/** GET /v1/tasks/:id/messages — list conversation history. */
conversationRoutes.get("/v1/tasks/:id/messages", async (c) => {
  const p = c.get("principal")!;
  const id = c.req.param("id");
  const db = getDb();

  // Verify task belongs to org
  const taskRows = await db.select().from(task).where(and(eq(task.id, id), eq(task.org_id, p.org_id))).limit(1);
  if (taskRows.length === 0) return c.json({ error: "not_found" }, 404);

  const messages = await db.select().from(taskMessage).where(eq(taskMessage.task_id, id)).orderBy(asc(taskMessage.created_at));
  return c.json({ messages });
});

/** PATCH /v1/tasks/:id — edit task title, spec, or model. */
conversationRoutes.patch("/v1/tasks/:id", async (c) => {
  const p = c.get("principal")!;
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({})) as {
    title?: string;
    spec?: string;
    model?: string;
  };

  const db = getDb();
  const taskRows = await db.select().from(task).where(and(eq(task.id, id), eq(task.org_id, p.org_id))).limit(1);
  if (taskRows.length === 0) return c.json({ error: "not_found" }, 404);

  const updates: Record<string, unknown> = {};
  if (body.title !== undefined) updates.title = body.title;
  if (body.spec !== undefined) updates.spec = body.spec;
  if (body.model !== undefined) updates.model = body.model || null;

  if (Object.keys(updates).length > 0) {
    await db.update(task).set(updates).where(eq(task.id, id));
  }

  const updated = await db.select().from(task).where(eq(task.id, id)).limit(1);
  return c.json({ task: updated[0] });
});

/** POST /v1/tasks/:id/messages — send a message to the agent and start/continue conversation. */
conversationRoutes.post("/v1/tasks/:id/messages", async (c) => {
  const p = c.get("principal")!;
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({})) as { content?: string; model?: string };
  if (!body.content?.trim()) return c.json({ error: "content required" }, 400);

  const db = getDb();

  // 1. Fetch the task
  const taskRows = await db.select().from(task).where(and(eq(task.id, id), eq(task.org_id, p.org_id))).limit(1);
  if (taskRows.length === 0) return c.json({ error: "not_found" }, 404);
  const t = taskRows[0]!;

  // 2. Save the user message
  await db.insert(taskMessage).values({
    task_id: id,
    org_id: p.org_id,
    role: "user",
    content: body.content,
  });

  // 3. Fetch BYO key
  const keys = await db.select().from(byoKey).where(eq(byoKey.org_id, p.org_id));
  if (keys.length === 0) {
    return c.json({ error: "no_api_key", message: "Add an API key in Settings first." }, 400);
  }

  // Use model from request body, or task's model, or auto-pick
  const model = body.model || t.model ||
    (keys.find((k) => k.provider === "anthropic") ? "anthropic:claude-3-5-sonnet-latest" : "openai:gpt-4o");

  const modelProvider = model.split(":")[0]!;
  const keyForProvider = keys.find((k) => k.provider === modelProvider) ?? keys[0]!;
  const apiKey = Buffer.from(keyForProvider.encrypted_key, "base64").toString("utf8");

  // 4. Fetch conversation history
  const history = await db.select().from(taskMessage).where(eq(taskMessage.task_id, id)).orderBy(asc(taskMessage.created_at));

  // Build messages array for the agent (include task spec as first system-like user message)
  const agentMessages: Array<{ role: string; content: string }> = [];
  // If this is the first message, include the task spec as context
  if (history.length <= 1) {
    agentMessages.push({ role: "user", content: `Task: ${t.title}\n\nInstructions: ${t.spec}\n\nUser message: ${body.content}` });
  } else {
    // Include all history
    for (const m of history) {
      agentMessages.push({ role: m.role, content: m.content });
    }
  }

  // 5. Update task status to running
  await db.update(task).set({ status: "running", model }).where(eq(task.id, id));

  // 6. Dispatch to local agent — swarm mode if agent_count > 1
  const agentCount = t.agent_count ?? 1;

  if (agentCount > 1) {
    // Parse per-agent models if stored
    let agentModels: string[] | undefined;
    try { agentModels = t.agent_models ? JSON.parse(t.agent_models) as string[] : undefined; } catch { /* ignore */ }

    // Build api_keys map for all providers
    const apiKeysMap: Record<string, string> = {};
    for (const k of keys) {
      apiKeysMap[k.provider] = Buffer.from(k.encrypted_key, "base64").toString("utf8");
    }

    // Swarm mode
    const swarmBody = {
      spec: body.content,
      cwd: t.repo_ref ?? process.cwd(),
      org_id: p.org_id,
      agent_count: agentCount,
      model,
      models: agentModels,
      budget_usd: parseFloat(t.budget_usd),
      max_iterations: 20,
      api_key: apiKey,
      api_keys: apiKeysMap,
    };

    let swarmResp: Response;
    try {
      swarmResp = await fetch(`${LOCAL_AGENT_URL}/v1/agent/swarm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(swarmBody),
      });
    } catch {
      return c.json({ error: "agent_unreachable", message: "Local agent is not running." }, 502);
    }

    if (!swarmResp.ok) {
      const errBody = await swarmResp.text();
      return c.json({ error: "agent_error", detail: errBody }, 502);
    }

    const swarmData = await swarmResp.json() as { swarm_id: string; agent_ids: string[]; agent_models: string[]; subtasks: string[] };

    await db.insert(agentRun).values({
      org_id: p.org_id,
      user_id: p.user_id,
      task_id: id,
      runtime: t.runtime_pref ?? "local",
      status: "running",
    });

    return c.json({
      ok: true,
      swarm_id: swarmData.swarm_id,
      agent_ids: swarmData.agent_ids,
      agent_models: swarmData.agent_models,
      subtasks: swarmData.subtasks,
      agent_count: agentCount,
      model,
    });
  }

  // Single agent mode
  const startBody = {
    spec: body.content,
    cwd: t.repo_ref ?? process.cwd(),
    org_id: p.org_id,
    model,
    budget_usd: parseFloat(t.budget_usd),
    max_iterations: 20,
    api_key: apiKey,
    messages: agentMessages,
  };

  let agentResp: Response;
  try {
    agentResp = await fetch(`${LOCAL_AGENT_URL}/v1/agent/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(startBody),
    });
  } catch {
    return c.json({ error: "agent_unreachable", message: "Local agent is not running." }, 502);
  }

  if (!agentResp.ok) {
    const errBody = await agentResp.text();
    return c.json({ error: "agent_error", detail: errBody }, 502);
  }

  const agentData = await agentResp.json() as { task_id: string; run_id: string };

  // 7. Create agent_run record
  await db.insert(agentRun).values({
    org_id: p.org_id,
    user_id: p.user_id,
    task_id: id,
    runtime: t.runtime_pref ?? "local",
    status: "running",
  });

  return c.json({ ok: true, agent_task_id: agentData.task_id, agent_run_id: agentData.run_id, model });
});

// Import agentRun at the top level — need to add it to imports
