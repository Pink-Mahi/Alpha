/**
 * Cloud agent runtime — HTTP server for cloud-based autonomous engineering.
 *
 * Receives tasks from the control plane, creates sandboxes, runs agent
 * swarms, and creates PRs. This is the "cloud" counterpart to the local
 * agent runtime.
 *
 * Port 8088.
 */
import { Hono } from "hono";
import { logger } from "hono/logger";
import { z } from "zod";
import { randomUUID } from "node:crypto";

import { DockerSandboxRuntime } from "./sandbox.js";
import { SwarmOrchestrator, type SubTask } from "./swarm.js";
import { GitHubClient } from "./github.js";

const app = new Hono();
app.use("*", logger());

const sandboxRuntime = new DockerSandboxRuntime();

// Stub task decomposer: in production, this calls the model router to break
// the task into subtasks. For M3 skeleton, it creates a single subtask.
async function decomposeTask(spec: string): Promise<SubTask[]> {
  // TODO: call model router to decompose complex tasks
  // For now, single subtask = single agent
  return [
    {
      id: randomUUID(),
      parentId: "",
      title: spec.slice(0, 80),
      spec,
      status: "pending",
    },
  ];
}

// Stub agent runner: in production, this starts the agent loop inside the
// sandbox (via sandbox.exec). For M3 skeleton, it returns a stub result.
async function runAgentInSandbox(
  sandbox: import("./sandbox.js").Sandbox,
  spec: string,
): Promise<{ summary: string }> {
  // TODO: copy agent code into sandbox, run `bun run agent.ts --spec="..."`
  // For now, simulate
  await sandboxRuntime.exec(sandbox, `echo "Running agent for: ${spec.slice(0, 50)}"`);
  return { summary: `Agent completed task: ${spec.slice(0, 80)}` };
}

const orchestrator = new SwarmOrchestrator(sandboxRuntime, decomposeTask, runAgentInSandbox);

// --- Routes -----------------------------------------------------------------

app.get("/healthz", (c) =>
  c.json({
    ok: true,
    sandboxes: sandboxRuntime.list().length,
    tasks: orchestrator.listTasks().length,
  }),
);

const startSchema = z.object({
  org_id: z.string().uuid(),
  repo_url: z.string().url(),
  repo_ref: z.string().default("main"),
  title: z.string().min(1),
  spec: z.string().min(1),
  github_token: z.string().optional(),
  github_owner: z.string().optional(),
  github_repo: z.string().optional(),
});

app.post("/v1/cloud-task/start", async (c) => {
  const parsed = startSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
  const body = parsed.data;

  const task = await orchestrator.startTask({
    orgId: body.org_id,
    repoUrl: body.repo_url,
    repoRef: body.repo_ref,
    title: body.title,
    spec: body.spec,
  });

  // If GitHub creds provided, we'll create a PR when the task completes.
  // (The orchestrator handles this via the snapshot/merge step.)
  if (body.github_token && body.github_owner && body.github_repo) {
    const gh = new GitHubClient({
      token: body.github_token,
      owner: body.github_owner,
      repo: body.github_repo,
    });
    // Store for later use — in production, the orchestrator would use this
    // to create the PR after merging branches.
    (task as unknown as { _github: GitHubClient })._github = gh;
  }

  return c.json({ task_id: task.id, status: task.status }, 201);
});

app.get("/v1/cloud-task/:id", (c) => {
  const task = orchestrator.getTask(c.req.param("id"));
  if (!task) return c.json({ error: "not_found" }, 404);
  return c.json({
    id: task.id,
    status: task.status,
    title: task.title,
    subtasks: task.subtasks.map((st) => ({
      id: st.id,
      title: st.title,
      status: st.status,
      result: st.result,
    })),
    pr_url: task.prUrl,
    created_at: task.createdAt.toISOString(),
  });
});

app.get("/v1/cloud-tasks", (c) => {
  const tasks = orchestrator.listTasks().map((t) => ({
    id: t.id,
    status: t.status,
    title: t.title,
    subtask_count: t.subtasks.length,
    pr_url: t.prUrl,
  }));
  return c.json({ tasks });
});

app.get("/v1/sandboxes", (c) => {
  const sandboxes = sandboxRuntime.list().map((s) => ({
    id: s.id,
    status: s.status,
    repo: s.config.repoUrl,
    created_at: s.createdAt.toISOString(),
  }));
  return c.json({ sandboxes });
});

const port = Number(process.env.PORT ?? 8088);

if (import.meta.main) {
  const server = Bun.serve({ port, fetch: app.fetch });
  console.log(`[cloud-agent] listening on http://localhost:${server.port}`);
  console.log(`[cloud-agent] sandbox runtime: Docker (dev mode)`);
  console.log(`[cloud-agent] swarm orchestrator: ready`);
}

export { app };
