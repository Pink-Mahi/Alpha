/**
 * Local agent runtime â€” HTTP server that the IDE extension connects to.
 *
 * Exposes:
 *   GET  /healthz
 *   POST /v1/agent/start   â€” start a coding task
 *   GET  /v1/agent/:id     â€” get task status
 *   POST /v1/agent/:id/kill â€” kill a running task
 *   WSS  /v1/agent/:id/stream â€” live event stream
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

const router = new ModelRouterClient(process.env.MODEL_ROUTER_URL ?? "http://localhost:8081");
const bus = new ToolBus();
registerBuiltinTools(bus, router, "openai:gpt-4o", process.env.OPENAI_API_KEY);

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
      "web.search", "web.fetch",
      "browser.navigate", "browser.screenshot", "browser.click", "browser.fill",
      "browser.extract", "browser.get_html", "browser.analyze_seo",
      "browser.scroll", "browser.list_elements", "browser.wait",
      "memory.recall", "memory.learn", "memory.guideline", "memory.list",
      "vision.analyze", "code.run", "http.request", "fs.edit", "deploy.static", "image.generate",
      "db.query", "db.execute", "browser.analyze_accessibility", "browser.lighthouse",
      "notify.webhook", "test.generate", "browser.set_viewport",
      "mobile.convert", "mobile.config", "mobile.icon", "mobile.build", "mobile.run",
      "git.branch", "git.checkout", "git.log", "git.merge", "git.stash",
      "docker.build", "docker.run", "docker.compose",
      "code.analyze", "security.scan", "docs.generate", "project.scaffold", "data.transform", "pkg.install",
      "math.solve", "math.calculate", "physics.solve", "chemistry.solve", "science.constant",
      "medical.symptoms", "medical.drug", "medical.anatomy", "medical.lab", "circuit.analyze", "magnetism.solve", "semiconductor.solve", "digital.logic", "finance.calculate", "economics.indicators", "stats.describe", "stats.hypothesis_test", "stats.regression", "stats.distribution", "mechanical.solve", "fluid.mechanics", "heat.transfer", "astronomy.solve", "crypto.hash", "crypto.encode", "crypto.cipher", "geo.distance", "geo.timezone", "text.analyze", "text.summarize", "sys.process", "sys.network", "sys.cron", "stock.indicators", "stock.options", "stock.data", "stock.predict", "stock.strategies", "stock.market",
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
  agentModels: string[];
  supervisorIds: string[];
  supervisorModels: string[];
  status: "coordinating" | "running" | "complete" | "failed";
  subtasks: string[];
  sharedContext: Map<string, string>;
  supervisorDirectives: Map<string, string[]>; // workerAgentId â†’ directives from supervisors
  userMessages: Array<{ id: string; text: string; ts: string; source: "web" | "telegram" | "voice" }>; // real-time user messages to supervisor
}
const swarms = new Map<string, SwarmTask>();

const swarmSchema = z.object({
  spec: z.string().min(1),
  cwd: z.string().min(1),
  agent_count: z.number().int().min(1).max(5).default(2),
  org_id: z.string().uuid().optional(),
  model: z.string().default("anthropic:claude-3-5-sonnet-latest"),
  models: z.array(z.string()).optional(),
  budget_usd: z.number().default(2.0),
  max_iterations: z.number().default(20),
  api_key: z.string().optional(),
  api_keys: z.record(z.string()).optional(),
  tool_allowlist: z.array(z.string()).optional(),
  supervisor_enabled: z.boolean().default(false),
  supervisor_count: z.number().int().min(0).max(2).default(0),
  supervisor_models: z.array(z.string()).optional(),
  persistence_mode: z.enum(["standard", "persistent", "relentless"]).default("standard"),
});

/** POST /v1/agent/swarm â€” start N agents working on subtasks of the same project. */
app.post("/v1/agent/swarm", async (c) => {
  const parsed = swarmSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
  const body = parsed.data;

  const swarmId = randomUUID();
  const swarm: SwarmTask = {
    id: swarmId,
    agentIds: [],
    agentModels: [],
    supervisorIds: [],
    supervisorModels: [],
    status: "coordinating",
    subtasks: [],
    sharedContext: new Map(),
    supervisorDirectives: new Map(),
    userMessages: [],
  };
  swarms.set(swarmId, swarm);

  // Determine per-agent models
  const models = body.models && body.models.length >= body.agent_count
    ? body.models.slice(0, body.agent_count)
    : Array.from({ length: body.agent_count }, () => body.model);

  // Helper to get the right API key for a model
  function getKeyForModel(model: string): string | undefined {
    if (!body.api_keys) return body.api_key;
    const provider = model.split(":")[0]!;
    return body.api_keys[provider] ?? body.api_key;
  }

  // Step 1: Use the LLM to break down the task into N subtasks (use first agent's model)
  let subtasks: string[];
  try {
    subtasks = await decomposeTask(body.spec, body.agent_count, models[0]!, getKeyForModel(models[0]!));
  } catch (e) {
    console.log(`[swarm:${swarmId.slice(0, 8)}] decomposition failed: ${e}, using fallback`);
    subtasks = Array.from({ length: body.agent_count }, (_, i) =>
      `${body.spec}\n\nYou are agent ${i + 1} of ${body.agent_count}. Focus on a different aspect of this task.`
    );
  }
  swarm.subtasks = subtasks;
  swarm.agentModels = models;

  // Step 2: Start N agent loops in parallel
  swarm.status = "running";
  const budgetPerAgent = body.budget_usd / body.agent_count;
  // Adjust iterations based on persistence mode
  const persistenceMultiplier = body.persistence_mode === "relentless" ? 3 : body.persistence_mode === "persistent" ? 2 : 1;
  const maxIterPerAgent = Math.max(5, Math.floor(body.max_iterations / body.agent_count) + 5) * persistenceMultiplier;

  for (let i = 0; i < subtasks.length; i++) {
    const agentTaskId = randomUUID();
    const runId = randomUUID();
    const events: AgentMessageEnvelope[] = [];
    const agentModel = models[i]!;
    const agentKey = getKeyForModel(agentModel);
    const agentNum = i + 1;

    // Build spec with cross-agent awareness
    const otherModels = models.map((m, idx) => idx !== i ? `Agent ${idx + 1} (${m})` : null).filter(Boolean).join(", ");
    const spec = `You are Agent ${agentNum} of ${subtasks.length} working on a shared project.
You are powered by ${agentModel}. Other agents in this swarm: ${otherModels}.

Your assigned subtask: ${subtasks[i]}

IMPORTANT:
- The project directory is shared with other agents. Only modify files relevant to your subtask to avoid conflicts.
- You can see other agents' latest outputs in the shared context below. Learn from their approaches and build on their insights.
- If you notice issues in other agents' work, you may fix them, but note what you changed and why.

Original task: ${body.spec}`;

    const config: AgentLoopConfig = {
      orgId: body.org_id ?? "00000000-0000-0000-0000-000000000000",
      runId,
      taskId: agentTaskId,
      spec,
      cwd: body.cwd,
      budgetUsd: budgetPerAgent,
      maxIterations: maxIterPerAgent,
      model: agentModel,
      toolAllowList: body.tool_allowlist,
      permissions: new Set([
        "fs.read", "fs.write", "fs.list",
        "shell.exec", "git.read", "git.write",
        "search.grep", "search.files",
        "web.search", "web.fetch",
        "browser.navigate", "browser.screenshot", "browser.click", "browser.fill",
        "browser.extract", "browser.get_html", "browser.analyze_seo",
        "browser.scroll", "browser.list_elements", "browser.wait",
      "memory.recall", "memory.learn", "memory.guideline", "memory.list",
      "vision.analyze", "code.run", "http.request", "fs.edit", "deploy.static", "image.generate",
      "db.query", "db.execute", "browser.analyze_accessibility", "browser.lighthouse",
      "notify.webhook", "test.generate", "browser.set_viewport",
      "mobile.convert", "mobile.config", "mobile.icon", "mobile.build", "mobile.run",
      "git.branch", "git.checkout", "git.log", "git.merge", "git.stash",
      "docker.build", "docker.run", "docker.compose",
      "code.analyze", "security.scan", "docs.generate", "project.scaffold", "data.transform", "pkg.install",
      "math.solve", "math.calculate", "physics.solve", "chemistry.solve", "science.constant",
      "medical.symptoms", "medical.drug", "medical.anatomy", "medical.lab", "circuit.analyze", "magnetism.solve", "semiconductor.solve", "digital.logic", "finance.calculate", "economics.indicators", "stats.describe", "stats.hypothesis_test", "stats.regression", "stats.distribution", "mechanical.solve", "fluid.mechanics", "heat.transfer", "astronomy.solve", "crypto.hash", "crypto.encode", "crypto.cipher", "geo.distance", "geo.timezone", "text.analyze", "text.summarize", "sys.process", "sys.network", "sys.cron", "stock.indicators", "stock.options", "stock.data", "stock.predict", "stock.strategies", "stock.market",
      ]),
      reflectionInterval: 5,
      externalContext: [],
      onEvent: (env) => {
        events.push(env);
        // Capture assistant responses for cross-agent sharing
        if (env.type === "task.complete") {
          const summary = (env.payload as { summary?: string }).summary;
          if (summary) {
            swarm.sharedContext.set(agentTaskId, `[Agent ${agentNum} (${agentModel})]: ${summary}`);
          }
        }
      },
      requestApproval: async () => true,
      apiKey: agentKey,
    };

    const task: RunningTask = { id: agentTaskId, config, events, status: "running", abort: new AbortController() };
    tasks.set(agentTaskId, task);
    swarm.agentIds.push(agentTaskId);

    const loop = new AgentLoop(bus, router);
    loop.run(config).then((result) => {
      task.result = result;
      task.status = result.success ? "complete" : "failed";
      // Share the result with other agents
      swarm.sharedContext.set(agentTaskId, `[Agent ${agentNum} (${agentModel})]: ${result.summary}`);
    }).catch((e) => {
      task.status = "failed";
      task.result = { summary: String(e), costUsd: 0, iterations: 0, success: false };
    });

    console.log(`[swarm:${swarmId.slice(0, 8)}] agent ${agentNum} started: ${agentTaskId.slice(0, 8)} (model: ${agentModel})`);
  }

  // Step 3: Start supervisor agents (if enabled)
  if (body.supervisor_enabled && body.supervisor_count > 0) {
    const supModels = body.supervisor_models && body.supervisor_models.length >= body.supervisor_count
      ? body.supervisor_models.slice(0, body.supervisor_count)
      : Array.from({ length: body.supervisor_count }, () => models[0]!);
    swarm.supervisorModels = supModels;

    for (let s = 0; s < supModels.length; s++) {
      const supTaskId = randomUUID();
      const supModel = supModels[s]!;
      const supKey = getKeyForModel(supModel);
      const supNum = s + 1;
      const supEvents: AgentMessageEnvelope[] = [];

      const supSpec = `You are Supervisor Agent ${supNum}, overseeing ${subtasks.length} worker agents working on a shared project.

You are the QUALITY GATEKEEPER. Your job is to ensure the final product is the BEST POSSIBLE result â€” not just "done" but "excellent".

Your role:
1. RESEARCH: Use web.search to research best practices, competitor products, and state-of-the-art approaches relevant to the task. Share your findings with workers via directives.
2. MONITOR: Watch the worker agents' progress by reading files they create and reviewing their outputs.
3. DIRECTIVE: When you notice a worker going off-track, producing low-quality code, or missing requirements, write a directive message that will be sent to that worker.
4. QUALITY GATE: When workers complete their tasks, evaluate the quality:
   - Does it meet all requirements from the original task?
   - Is the code quality excellent (not just functional)?
   - Are there bugs, edge cases, or missing features?
   - Is it the best possible implementation?
   If quality is not excellent, write a directive telling the worker exactly what to fix.
5. COORDINATION: If two workers are conflicting (editing the same files), redirect one to a different approach.
6. PERSISTENCE: Do NOT accept "done" as good enough. Keep directing workers to improve until the result is truly excellent.

Worker agents and their subtasks:
${subtasks.map((st, i) => `  Agent ${i + 1} (${models[i]}): ${st}`).join("\n")}

Original task: ${body.spec}

You have filesystem tools AND web research tools. Use web.search to find best practices and share them with workers. Read the files workers are creating. When you want to send a directive to a worker, write it to a file called .supervisor_directive_agentN.txt (where N is the agent number). The system will pick it up and redirect that worker.

You are the last line of defense for quality. Be demanding. Be thorough. Be proactive. The user wants the BEST possible result, not just an adequate one.

USER COMMUNICATION:
The user can send you messages in real-time via the web UI, Telegram, or voice. These messages will appear as [USER MESSAGE] in your context. When you receive a user message:
1. Acknowledge it and adjust your supervision plan accordingly
2. Redirect workers if the user's feedback requires a change in approach
3. If the user asks for something specific, make sure workers implement it
4. If the user is unhappy with progress, be more proactive in directing workers
The user is your boss. Their feedback overrides any default assumptions you have.`;

      const supConfig: AgentLoopConfig = {
        orgId: body.org_id ?? "00000000-0000-0000-0000-000000000000",
        runId: randomUUID(),
        taskId: supTaskId,
        spec: supSpec,
        cwd: body.cwd,
        budgetUsd: budgetPerAgent * 0.5, // supervisors get half budget
        maxIterations: Math.max(3, maxIterPerAgent / 2),
        model: supModel,
        toolAllowList: body.tool_allowlist,
        permissions: new Set([
          "fs.read", "fs.write", "fs.list",
          "shell.exec", "git.read", "git.write",
          "search.grep", "search.files",
          "web.search", "web.fetch",
          "browser.navigate", "browser.screenshot", "browser.click", "browser.fill",
          "browser.extract", "browser.get_html", "browser.analyze_seo",
          "browser.scroll", "browser.list_elements", "browser.wait",
      "memory.recall", "memory.learn", "memory.guideline", "memory.list",
      "vision.analyze", "code.run", "http.request", "fs.edit", "deploy.static", "image.generate",
      "db.query", "db.execute", "browser.analyze_accessibility", "browser.lighthouse",
      "notify.webhook", "test.generate", "browser.set_viewport",
      "mobile.convert", "mobile.config", "mobile.icon", "mobile.build", "mobile.run",
      "git.branch", "git.checkout", "git.log", "git.merge", "git.stash",
      "docker.build", "docker.run", "docker.compose",
      "code.analyze", "security.scan", "docs.generate", "project.scaffold", "data.transform", "pkg.install",
      "math.solve", "math.calculate", "physics.solve", "chemistry.solve", "science.constant",
      "medical.symptoms", "medical.drug", "medical.anatomy", "medical.lab", "circuit.analyze", "magnetism.solve", "semiconductor.solve", "digital.logic", "finance.calculate", "economics.indicators", "stats.describe", "stats.hypothesis_test", "stats.regression", "stats.distribution", "mechanical.solve", "fluid.mechanics", "heat.transfer", "astronomy.solve", "crypto.hash", "crypto.encode", "crypto.cipher", "geo.distance", "geo.timezone", "text.analyze", "text.summarize", "sys.process", "sys.network", "sys.cron", "stock.indicators", "stock.options", "stock.data", "stock.predict", "stock.strategies", "stock.market",
        ]),
        reflectionInterval: 3,
        onEvent: (env) => supEvents.push(env),
        requestApproval: async () => true,
        apiKey: supKey,
      };

      const supTask: RunningTask = { id: supTaskId, config: supConfig, events: supEvents, status: "running", abort: new AbortController() };
      tasks.set(supTaskId, supTask);
      swarm.supervisorIds.push(supTaskId);

      const supLoop = new AgentLoop(bus, router);
      supLoop.run(supConfig).then((result) => {
        supTask.result = result;
        supTask.status = result.success ? "complete" : "failed";
      }).catch((e) => {
        supTask.status = "failed";
        supTask.result = { summary: String(e), costUsd: 0, iterations: 0, success: false };
      });

      console.log(`[swarm:${swarmId.slice(0, 8)}] supervisor ${supNum} started: ${supTaskId.slice(0, 8)} (model: ${supModel})`);
    }

    // Start the supervisor orchestration loop â€” polls worker progress and applies directives
    runSupervisorLoop(swarm, body.cwd, body.persistence_mode);
  }

  return c.json({
    swarm_id: swarmId,
    agent_ids: swarm.agentIds,
    agent_models: models,
    supervisor_ids: swarm.supervisorIds,
    supervisor_models: swarm.supervisorModels,
    subtasks,
    status: "running",
  }, 201);
});

/** Supervisor orchestration loop â€” monitors workers and applies directives. */
async function runSupervisorLoop(swarm: SwarmTask, cwd: string, persistenceMode: string = "standard") {
  const { readFileSync, unlinkSync, existsSync } = await import("node:fs");
  const { join } = await import("node:path");
  const checkInterval = 5000;
  let checkCount = 0;
  const maxChecks = 120;
  let refinementRound = 0;
  // Persistence mode controls how many times supervisor can restart workers for quality
  const maxRefinementRounds = persistenceMode === "relentless" ? 10 : persistenceMode === "persistent" ? 5 : 3;

  while (checkCount < maxChecks) {
    await new Promise((r) => setTimeout(r, checkInterval));
    checkCount++;

    // Check if all workers are done
    const allWorkersDone = swarm.agentIds.every((aid) => {
      const t = tasks.get(aid);
      return t && (t.status === "complete" || t.status === "failed" || t.status === "killed");
    });

    // Check for directive files from supervisors
    for (let i = 0; i < swarm.agentIds.length; i++) {
      const agentNum = i + 1;
      const directiveFile = join(cwd, `.supervisor_directive_agent${agentNum}.txt`);
      if (existsSync(directiveFile)) {
        try {
          const directive = readFileSync(directiveFile, "utf8").trim();
          if (directive) {
            console.log(`[swarm:${swarm.id.slice(0, 8)}] supervisor directive for agent ${agentNum}: ${directive.slice(0, 100)}...`);
            if (!swarm.supervisorDirectives.has(swarm.agentIds[i]!)) {
              swarm.supervisorDirectives.set(swarm.agentIds[i]!, []);
            }
            swarm.supervisorDirectives.get(swarm.agentIds[i]!)!.push(directive);

            const workerTask = tasks.get(swarm.agentIds[i]!);
            if (workerTask && workerTask.status === "running") {
              // Worker is still running â€” inject directive into its context
              workerTask.events.push({
                version: "1.0",
                org_id: workerTask.config.orgId,
                run_id: workerTask.config.runId,
                task_id: workerTask.config.taskId,
                seq: workerTask.events.length,
                ts: new Date().toISOString(),
                type: "supervisor.directive",
                payload: { directive, from: "supervisor" },
              } as unknown as AgentMessageEnvelope);
              // Also inject into the agent's external context for self-reflection
              if (workerTask.config.externalContext) {
                workerTask.config.externalContext.push(`[SUPERVISOR DIRECTIVE]\n${directive}`);
              }
            } else if (workerTask && (workerTask.status === "complete" || workerTask.status === "failed") && refinementRound < maxRefinementRounds) {
              // Worker is done but supervisor has a directive â€” restart for refinement
              console.log(`[swarm:${swarm.id.slice(0, 8)}] restarting agent ${agentNum} for refinement round ${refinementRound + 1}`);
              refinementRound++;
              workerTask.status = "running";
              workerTask.result = undefined;
              // Inject directive as a new message
              workerTask.config = {
                ...workerTask.config,
                spec: `${workerTask.config.spec}\n\n[SUPERVISOR REFINEMENT DIRECTIVE]\n${directive}\n\nImprove your work based on this feedback. The supervisor is not satisfied with the current quality.`,
                messages: undefined, // fresh start with updated spec
                externalContext: [directive],
              };
              const loop = new AgentLoop(bus, router);
              loop.run(workerTask.config).then((result) => {
                workerTask.result = result;
                workerTask.status = result.success ? "complete" : "failed";
                swarm.sharedContext.set(workerTask.id, `[Refined] ${result.summary}`);
              }).catch((e) => {
                workerTask.status = "failed";
                workerTask.result = { summary: String(e), costUsd: 0, iterations: 0, success: false };
              });
            }
          }
          unlinkSync(directiveFile);
        } catch { /* ignore file errors */ }
      }
    }

    if (allWorkersDone && refinementRound >= maxRefinementRounds) {
      console.log(`[swarm:${swarm.id.slice(0, 8)}] all workers done, max refinement reached, supervisor loop ending`);
      break;
    }
  }
}

/** POST /v1/agent/swarm/:id/message â€” inject a user message into the running swarm (sent to supervisor). */
app.post("/v1/agent/swarm/:id/message", async (c) => {
  const swarm = swarms.get(c.req.param("id"));
  if (!swarm) return c.json({ error: "not_found" }, 404);
  const body = await c.req.json().catch(() => ({}));
  const text = body.text as string | undefined;
  const source = (body.source as string) ?? "web";
  if (!text || text.trim().length === 0) return c.json({ error: "empty_message" }, 400);

  const msgId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const msg = { id: msgId, text: text.trim(), ts: new Date().toISOString(), source: source as "web" | "telegram" | "voice" };
  swarm.userMessages.push(msg);

  // Inject into all supervisor agents' external context so they see it
  for (const supId of swarm.supervisorIds) {
    const supTask = tasks.get(supId);
    if (supTask && supTask.status === "running") {
      if (supTask.config.externalContext) {
        supTask.config.externalContext.push(`[USER MESSAGE via ${source.toUpperCase()}]\n${text.trim()}\n\nIncorporate this user feedback into your supervision. Adjust worker directives accordingly.`);
      }
      // Emit event for UI
      supTask.events.push({
        version: "1.0",
        org_id: supTask.config.orgId,
        run_id: supTask.config.runId,
        task_id: supTask.config.taskId,
        seq: supTask.events.length,
        ts: new Date().toISOString(),
        type: "user.message",
        payload: { text: text.trim(), source, message_id: msgId },
      } as unknown as AgentMessageEnvelope);
    }
  }

  console.log(`[swarm:${swarm.id.slice(0, 8)}] user message via ${source}: ${text.trim().slice(0, 100)}`);
  return c.json({ ok: true, message_id: msgId, delivered_to: swarm.supervisorIds.length });
});

/** GET /v1/agent/swarm/:id/messages â€” get all user messages for a swarm. */
app.get("/v1/agent/swarm/:id/messages", (c) => {
  const swarm = swarms.get(c.req.param("id"));
  if (!swarm) return c.json({ error: "not_found" }, 404);
  return c.json({ messages: swarm.userMessages });
});

/** GET /v1/agent/swarm/:id â€” get swarm status (all agents). */
app.get("/v1/agent/swarm/:id", (c) => {
  const swarm = swarms.get(c.req.param("id"));
  if (!swarm) return c.json({ error: "not_found" }, 404);
  const agents = swarm.agentIds.map((aid, i) => {
    const t = tasks.get(aid);
    return {
      id: aid,
      role: "worker" as const,
      status: t?.status ?? "unknown",
      model: swarm.agentModels[i] ?? "unknown",
      events: t?.events.slice(-30) ?? [],
      result: t?.result,
      directives: swarm.supervisorDirectives.get(aid) ?? [],
    };
  });
  const supervisors = swarm.supervisorIds.map((sid, i) => {
    const t = tasks.get(sid);
    return {
      id: sid,
      role: "supervisor" as const,
      status: t?.status ?? "unknown",
      model: swarm.supervisorModels[i] ?? "unknown",
      events: t?.events.slice(-30) ?? [],
      result: t?.result,
    };
  });
  const allAgents = [...agents, ...supervisors];
  const allDone = allAgents.every((a) => a.status === "complete" || a.status === "failed" || a.status === "killed");
  const sharedContext = Object.fromEntries(swarm.sharedContext);
  return c.json({
    id: swarm.id,
    status: allDone ? "complete" : swarm.status,
    subtasks: swarm.subtasks,
    agent_models: swarm.agentModels,
    agents,
    supervisors,
    shared_context: sharedContext,
    user_messages: swarm.userMessages,
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
