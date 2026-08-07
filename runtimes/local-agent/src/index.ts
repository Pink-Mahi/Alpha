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
type AgentMessageEnvelope = import("@alpha/agent-protocol").AgentMessageEnvelope;

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
  messages: z.array(z.object({
    role: z.string(),
    content: z.string(),
  })).optional(),
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
    messages: body.messages,
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

// --- Swarm mode: multiple agents working on the same project ---

interface SwarmTask {
  id: string;
  agentIds: string[];
  status: "coordinating" | "running" | "complete" | "failed";
  subtasks: string[];
}
const swarms = new Map<string, SwarmTask>();

const swarmSchema = z.object({
  spec: z.string().min(1),
  cwd: z.string().min(1),
  agent_count: z.number().int().min(1).max(5).default(2),
  org_id: z.string().uuid().optional(),
  model: z.string().default("anthropic:claude-3-5-sonnet-latest"),
  budget_usd: z.number().default(2.0),
  max_iterations: z.number().default(20),
  api_key: z.string().optional(),
  tool_allowlist: z.array(z.string()).optional(),
});

/** POST /v1/agent/swarm — start N agents working on subtasks of the same project. */
app.post("/v1/agent/swarm", async (c) => {
  const parsed = swarmSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
  const body = parsed.data;

  const swarmId = randomUUID();
  const swarm: SwarmTask = { id: swarmId, agentIds: [], status: "coordinating", subtasks: [] };
  swarms.set(swarmId, swarm);

  // Step 1: Use the LLM to break down the task into N subtasks
  let subtasks: string[];
  try {
    subtasks = await decomposeTask(body.spec, body.agent_count, body.model, body.api_key);
  } catch (e) {
    // Fallback: just split the spec into N identical copies
    console.log(`[swarm:${swarmId.slice(0, 8)}] decomposition failed: ${e}, using fallback`);
    subtasks = Array.from({ length: body.agent_count }, (_, i) =>
      `${body.spec}\n\nYou are agent ${i + 1} of ${body.agent_count}. Focus on a different aspect of this task.`
    );
  }
  swarm.subtasks = subtasks;

  // Step 2: Start N agent loops in parallel
  swarm.status = "running";
  const budgetPerAgent = body.budget_usd / body.agent_count;
  const maxIterPerAgent = Math.max(5, Math.floor(body.max_iterations / body.agent_count) + 5);

  for (let i = 0; i < subtasks.length; i++) {
    const agentTaskId = randomUUID();
    const runId = randomUUID();
    const events: AgentMessageEnvelope[] = [];

    const config: AgentLoopConfig = {
      orgId: body.org_id ?? "00000000-0000-0000-0000-000000000000",
      runId,
      taskId: agentTaskId,
      spec: `You are Agent ${i + 1} of ${subtasks.length} working on a shared project.\n\nYour assigned subtask: ${subtasks[i]}\n\nThe project directory is shared with other agents. Only modify files relevant to your subtask to avoid conflicts.\n\nOriginal task: ${body.spec}`,
      cwd: body.cwd,
      budgetUsd: budgetPerAgent,
      maxIterations: maxIterPerAgent,
      model: body.model,
      toolAllowList: body.tool_allowlist,
      permissions: new Set([
        "fs.read", "fs.write", "fs.list",
        "shell.exec", "git.read", "git.write",
        "search.grep", "search.files",
      ]),
      onEvent: (env) => events.push(env),
      requestApproval: async () => true,
      apiKey: body.api_key,
    };

    const task: RunningTask = { id: agentTaskId, config, events, status: "running", abort: new AbortController() };
    tasks.set(agentTaskId, task);
    swarm.agentIds.push(agentTaskId);

    const loop = new AgentLoop(bus, router);
    loop.run(config).then((result) => {
      task.result = result;
      task.status = result.success ? "complete" : "failed";
    }).catch((e) => {
      task.status = "failed";
      task.result = { summary: String(e), costUsd: 0, iterations: 0, success: false };
    });

    console.log(`[swarm:${swarmId.slice(0, 8)}] agent ${i + 1} started: ${agentTaskId.slice(0, 8)}`);
  }

  return c.json({ swarm_id: swarmId, agent_ids: swarm.agentIds, subtasks, status: "running" }, 201);
});

/** GET /v1/agent/swarm/:id — get swarm status (all agents). */
app.get("/v1/agent/swarm/:id", (c) => {
  const swarm = swarms.get(c.req.param("id"));
  if (!swarm) return c.json({ error: "not_found" }, 404);
  const agents = swarm.agentIds.map((aid) => {
    const t = tasks.get(aid);
    return {
      id: aid,
      status: t?.status ?? "unknown",
      events: t?.events.slice(-30) ?? [],
      result: t?.result,
    };
  });
  const allDone = agents.every((a) => a.status === "complete" || a.status === "failed" || a.status === "killed");
  return c.json({
    id: swarm.id,
    status: allDone ? "complete" : swarm.status,
    subtasks: swarm.subtasks,
    agents,
  });
});

/** Use the LLM to decompose a task into N independent subtasks. */
async function decomposeTask(spec: string, count: number, model: string, apiKey?: string): Promise<string[]> {
  const decomposePrompt = `You are a task coordinator. Break down the following coding task into ${count} independent subtasks that can be worked on in parallel by ${count} agents.

Rules:
- Each subtask should be self-contained and not depend on other agents' work
- Each subtask should modify different files to avoid conflicts
- Cover all aspects of the original task
- Return ONLY a JSON array of ${count} strings, each describing one subtask

Task: ${spec}

Return format: ["subtask 1 description", "subtask 2 description", ...]`;

  const response = await router.complete({
    model,
    messages: [{ role: "user", content: decomposePrompt }],
    system: "You are a task decomposition assistant. Return only valid JSON.",
    max_tokens: 1024,
    api_key: apiKey,
  });

  const content = response.content.trim();
  // Extract JSON array from the response
  const jsonMatch = content.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error("no JSON array in decomposition response");
  const parsed = JSON.parse(jsonMatch[0]) as unknown;
  if (!Array.isArray(parsed)) throw new Error("decomposition is not an array");
  const result = parsed.filter((x): x is string => typeof x === "string").slice(0, count);
  if (result.length < count) {
    // Pad with remaining work
    while (result.length < count) {
      result.push(`General implementation work for: ${spec}`);
    }
  }
  return result;
}

const port = Number(process.env.PORT ?? 8082);

if (import.meta.main) {
  const server = Bun.serve({ port, fetch: app.fetch });
  console.log(`[local-agent] listening on http://localhost:${server.port}`);
  console.log(`[local-agent] tools: ${bus.list().map((t) => t.name).join(", ")}`);
}

export { app };
