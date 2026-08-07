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
  model: z.string().optional(), // e.g. "anthropic:claude-3-5-sonnet-latest"
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
      model: body.model,
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

  if (t.status === "running") {
    // Check if the agent is actually still running by probing the local agent.
    // If the agent task is gone (e.g. agent restarted), allow re-starting.
    // We can't know the old agent_task_id here, so just allow re-start and
    // let the local agent handle it. The old run is orphaned.
  }

  // 2. Fetch BYO key for the org (prefer anthropic, then openai)
  const keys = await db.select().from(byoKey).where(eq(byoKey.org_id, p.org_id));
  if (keys.length === 0) {
    return c.json({ error: "no_api_key", message: "Add an API key in Settings first." }, 400);
  }

  // Pick the first available key, prefer anthropic
  const preferredKey = keys.find((k) => k.provider === "anthropic") ?? keys[0]!;
  const decryptedKey = Buffer.from(preferredKey.encrypted_key, "base64").toString("utf8");

  // Use the model selected at task creation, or fall back to a default
  // based on the available provider key. Note: use || not ?? because
  // older tasks may have model='' (empty string) instead of null.
  const model = t.model ||
    (preferredKey.provider === "anthropic"
      ? "anthropic:claude-3-5-sonnet-latest"
      : preferredKey.provider === "openai"
        ? "openai:gpt-4o"
        : "anthropic:claude-3-5-sonnet-latest");

  // Verify the selected model's provider has a BYO key
  const modelProvider = model.split(":")[0];
  const keyForProvider = keys.find((k) => k.provider === modelProvider) ?? preferredKey;
  const apiKey = Buffer.from(keyForProvider.encrypted_key, "base64").toString("utf8");

  // 3. Dispatch to local agent
  const startBody = {
    spec: t.spec,
    cwd: t.repo_ref ?? process.cwd(),
    org_id: p.org_id,
    model,
    budget_usd: parseFloat(t.budget_usd),
    max_iterations: 20,
    api_key: apiKey,
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

    // Sync task status in DB when agent finishes
    if (data.status === "complete") {
      await db.update(task).set({ status: "complete" }).where(eq(task.id, id));
    } else if (data.status === "failed") {
      await db.update(task).set({ status: "failed" }).where(eq(task.id, id));
    } else if (data.status === "killed") {
      await db.update(task).set({ status: "killed" }).where(eq(task.id, id));
    }

    return c.json(data);
  } catch {
    return c.json({ error: "agent_unreachable" }, 502);
  }
});

taskRoutes.post("/v1/tasks/:id/pause", async (c) => {
  const p = c.get("principal")!;
  const id = c.req.param("id");
  const db = getDb();
  await db.update(task).set({ status: "killed" }).where(and(eq(task.id, id), eq(task.org_id, p.org_id)));
  return c.json({ ok: true, id, action: "pause" });
});

taskRoutes.post("/v1/tasks/:id/kill", async (c) => {
  const p = c.get("principal")!;
  const id = c.req.param("id");
  const agentTaskId = c.req.query("agent_task_id");
  if (agentTaskId) {
    try { await fetch(`${LOCAL_AGENT_URL}/v1/agent/${agentTaskId}/kill`, { method: "POST" }); } catch { /* best effort */ }
  }
  const db = getDb();
  await db.update(task).set({ status: "killed" }).where(and(eq(task.id, id), eq(task.org_id, p.org_id)));
  return c.json({ ok: true, id, action: "kill" });
});

/** GET /v1/tasks/:id/files — list files created by the agent (in the task's cwd). */
taskRoutes.get("/v1/tasks/:id/files", async (c) => {
  const p = c.get("principal")!;
  const id = c.req.param("id");
  const db = getDb();
  const taskRows = await db.select().from(task).where(and(eq(task.id, id), eq(task.org_id, p.org_id))).limit(1);
  if (taskRows.length === 0) return c.json({ error: "not_found" }, 404);
  const t = taskRows[0]!;
  const cwd = t.repo_ref ?? process.cwd();

  try {
    const files = await listFiles(cwd);
    return c.json({ files, cwd });
  } catch (e) {
    return c.json({ error: "failed_to_list", detail: String(e) }, 500);
  }
});

/** GET /v1/tasks/:id/file?path=<path> — read a file's contents. */
taskRoutes.get("/v1/tasks/:id/file", async (c) => {
  const p = c.get("principal")!;
  const id = c.req.param("id");
  const filePath = c.req.query("path");
  if (!filePath) return c.json({ error: "path required" }, 400);

  const db = getDb();
  const taskRows = await db.select().from(task).where(and(eq(task.id, id), eq(task.org_id, p.org_id))).limit(1);
  if (taskRows.length === 0) return c.json({ error: "not_found" }, 404);
  const t = taskRows[0]!;
  const cwd = t.repo_ref ?? process.cwd();

  // Resolve path relative to cwd, prevent path traversal
  const resolved = resolve(cwd, filePath);
  if (!resolved.startsWith(resolve(cwd))) return c.json({ error: "path_outside_cwd" }, 400);

  try {
    const content = await Bun.file(resolved).text();
    const ext = resolved.split(".").pop()?.toLowerCase() ?? "";
    return c.json({ path: filePath, content, ext, absolute: resolved });
  } catch {
    return c.json({ error: "file_not_found" }, 404);
  }
});

/** POST /v1/tasks/:id/run — run a file (Python) and return stdout/stderr. */
taskRoutes.post("/v1/tasks/:id/run", async (c) => {
  const p = c.get("principal")!;
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({})) as { path?: string };
  if (!body.path) return c.json({ error: "path required" }, 400);

  const db = getDb();
  const taskRows = await db.select().from(task).where(and(eq(task.id, id), eq(task.org_id, p.org_id))).limit(1);
  if (taskRows.length === 0) return c.json({ error: "not_found" }, 404);
  const t = taskRows[0]!;
  const cwd = t.repo_ref ?? process.cwd();

  const resolved = resolve(cwd, body.path);
  if (!resolved.startsWith(resolve(cwd))) return c.json({ error: "path_outside_cwd" }, 400);

  const ext = resolved.split(".").pop()?.toLowerCase() ?? "";
  let cmd: string[];
  if (ext === "py") {
    cmd = ["python", resolved];
  } else if (ext === "js") {
    cmd = ["node", resolved];
  } else if (ext === "ts") {
    cmd = ["bun", resolved];
  } else {
    return c.json({ error: "unsupported_file_type", ext }, 400);
  }

  try {
    const proc = Bun.spawn({
      cmd,
      cwd: resolve(cwd),
      stdout: "pipe",
      stderr: "pipe",
    });
    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;
    return c.json({ stdout, stderr, exitCode, path: body.path });
  } catch (e) {
    return c.json({ error: "run_failed", detail: String(e) }, 500);
  }
});

/** List files in a directory (non-recursive, top-level only). */
async function listFiles(dir: string): Promise<Array<{ name: string; size: number; ext: string }>> {
  const { readdirSync, statSync } = await import("node:fs");
  const { join } = await import("node:path");
  const entries: Array<{ name: string; size: number; ext: string }> = [];
  try {
    const names = readdirSync(dir);
    for (const name of names) {
      if (name.startsWith(".") || name === "node_modules") continue;
      const fullPath = join(dir, name);
      try {
        const stat = statSync(fullPath);
        if (!stat.isFile()) continue;
      } catch { continue; }
      const ext = name.split(".").pop()?.toLowerCase() ?? "";
      if (["py", "js", "ts", "html", "css", "json", "md", "txt"].includes(ext) ||
          name === "package.json" || name === "tsconfig.json") {
        const file = Bun.file(fullPath);
        entries.push({ name, size: file.size, ext });
      }
    }
  } catch (e) {
    throw new Error(`Cannot read directory: ${String(e)}`);
  }
  return entries.sort((a, b) => a.name.localeCompare(b.name));
}

/** Resolve a path relative to a base directory. */
function resolve(...paths: string[]): string {
  const { resolve: pathResolve } = require("node:path");
  return pathResolve(...paths);
}
