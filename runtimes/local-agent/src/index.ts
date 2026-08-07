/**
 * Local agent runtime — HTTP server that the IDE extension connects to.
 *
 * Exposes:
 *   GET  /healthz
 *   POST /v1/agent/start   — start a coding task
 *   GET  /v1/agent/:id     — get task status
 *   POST /v1/agent/:id/kill — kill a running task
 *   WSS  /v1/agent/:id/stream — live event stream
 *
 * The runtime runs as a subprocess of the IDE (or tray agent) and has
 * filesystem access to the user's working directory.
 */
import { Hono } from "hono";
import { logger } from "hono/logger";
import { z } from "zod";
import { randomUUID } from "node:crypto";

import { AgentLoop, type AgentLoopConfig } from "./agentLoop.js";
import { ModelRouterClient } from "./modelRouterClient.js";
import { ToolBus, type ToolContext } from "./toolBus.js";
import { registerBuiltinTools } from "./tools.js";

const app = new Hono();
app.use("*", logger());

const bus = new ToolBus();
registerBuiltinTools(bus);

const router = new ModelRouterClient(process.env.MODEL_ROUTER_URL ?? "http://localhost:8081");

interface RunningTask {
  id: string;
  config: AgentLoopConfig;
  events: AgentMessageEnvelope[];
  status: "running" | "complete" | "failed" | "killed";
  result?: { summary: string; costUsd: number; iterations: number; success: boolean };
  abort: AbortController;
}

// In-memory task registry (M1; persistence comes with control plane integration).
const tasks = new Map<string, RunningTask>();

// Re-import the type here to avoid circular deps in the emit path.
type AgentMessageEnvelope = import("@cascade/agent-protocol").AgentMessageEnvelope;

app.get("/healthz", (c) => c.json({ ok: true, tools: bus.list().map((t) => t.name) }));

const startSchema = z.object({
  spec: z.string().min(1),
  cwd: z.string().min(1),
  org_id: z.string().uuid().optional(),
  model: z.string().default("anthropic:claude-3-5-sonnet-latest"),
  budget_usd: z.number().default(2.0),
  max_iterations: z.number().default(20),
  api_key: z.string().optional(),
  tool_allowlist: z.array(z.string()).optional(),
});

app.post("/v1/agent/start", async (c) => {
  const parsed = startSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
  const body = parsed.data;

  const taskId = randomUUID();
  const runId = randomUUID();
  const abort = new AbortController();

  const events: AgentMessageEnvelope[] = [];

  const config: AgentLoopConfig = {
    orgId: body.org_id ?? "00000000-0000-0000-0000-000000000000",
    runId,
    taskId,
    spec: body.spec,
    cwd: body.cwd,
    budgetUsd: body.budget_usd,
    maxIterations: body.max_iterations,
    model: body.model,
    toolAllowList: body.tool_allowlist,
    permissions: new Set([
      "fs.read", "fs.write", "fs.list",
      "shell.exec", "git.read", "git.write",
      "search.grep", "search.files",
    ]),
    onEvent: (env) => events.push(env),
    requestApproval: async (tool, args, reason) => {
      // M1: auto-approve. The IDE extension will intercept this via WSS in a
      // follow-up to show a real approval dialog.
      console.log(`[approval] auto-approved ${tool}: ${reason}`);
      return true;
    },
    apiKey: body.api_key,
  };

  const task: RunningTask = { id: taskId, config, events, status: "running", abort };
  tasks.set(taskId, task);

  // Run the agent loop in the background.
  const loop = new AgentLoop(bus, router);
  loop.run(config).then((result) => {
    task.result = result;
    task.status = result.success ? "complete" : "failed";
  }).catch((e) => {
    task.status = "failed";
    task.result = { summary: String(e), costUsd: 0, iterations: 0, success: false };
  });

  return c.json({ task_id: taskId, run_id: runId, status: "running" }, 201);
});

app.get("/v1/agent/:id", (c) => {
  const task = tasks.get(c.req.param("id"));
  if (!task) return c.json({ error: "not_found" }, 404);
  return c.json({
    id: task.id,
    status: task.status,
    events: task.events.slice(-50),
    result: task.result,
  });
});

app.post("/v1/agent/:id/kill", (c) => {
  const task = tasks.get(c.req.param("id"));
  if (!task) return c.json({ error: "not_found" }, 404);
  task.abort.abort();
  task.status = "killed";
  return c.json({ ok: true });
});

app.get("/v1/agent/:id/events", (c) => {
  const task = tasks.get(c.req.param("id"));
  if (!task) return c.json({ error: "not_found" }, 404);
  // M1: return all events so far. WSS streaming lands next.
  return c.json({ events: task.events });
});

const port = Number(process.env.PORT ?? 8082);

if (import.meta.main) {
  const server = Bun.serve({ port, fetch: app.fetch });
  console.log(`[local-agent] listening on http://localhost:${server.port}`);
  console.log(`[local-agent] tools: ${bus.list().map((t) => t.name).join(", ")}`);
}

export { app };
