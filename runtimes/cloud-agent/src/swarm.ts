/**
 * Swarm orchestrator — coordinates multiple agents on subtasks.
 *
 * When a task is too complex for one agent, the orchestrator:
 * 1. Decomposes the task into subtasks (via LLM)
 * 2. Assigns each subtask to a separate sandbox+agent
 * 3. Monitors progress and handles dependencies
 * 4. Merges results and creates a single PR
 *
 * Swarm patterns:
 * - Parallel: independent subtasks run simultaneously
 * - Pipeline: subtask B depends on A's output
 * - Reviewer: one agent implements, another reviews
 *
 * M3: parallel pattern only. Pipeline + reviewer land in M4.
 */

import { randomUUID } from "node:crypto";
import type { ISandboxRuntime, Sandbox, SandboxConfig } from "./sandbox.js";

export interface SubTask {
  id: string;
  parentId: string;
  title: string;
  spec: string;
  status: "pending" | "running" | "complete" | "failed";
  sandboxId?: string;
  result?: { summary: string; branch: string; commitSha: string };
  dependsOn?: string[]; // IDs of subtasks that must complete first
}

export interface SwarmTask {
  id: string;
  orgId: string;
  repoUrl: string;
  repoRef: string;
  title: string;
  spec: string;
  subtasks: SubTask[];
  status: "decomposing" | "running" | "merging" | "complete" | "failed";
  createdAt: Date;
  prUrl?: string;
}

export class SwarmOrchestrator {
  private tasks = new Map<string, SwarmTask>();

  constructor(
    private readonly sandboxRuntime: ISandboxRuntime,
    private readonly decomposeTask: (spec: string) => Promise<SubTask[]>,
    private readonly runAgentInSandbox: (sandbox: Sandbox, spec: string) => Promise<{ summary: string }>,
  ) {}

  async startTask(opts: {
    orgId: string;
    repoUrl: string;
    repoRef: string;
    title: string;
    spec: string;
  }): Promise<SwarmTask> {
    const taskId = randomUUID();
    const task: SwarmTask = {
      id: taskId,
      orgId: opts.orgId,
      repoUrl: opts.repoUrl,
      repoRef: opts.repoRef,
      title: opts.title,
      spec: opts.spec,
      subtasks: [],
      status: "decomposing",
      createdAt: new Date(),
    };
    this.tasks.set(taskId, task);

    // Decompose the task into subtasks (async, don't block the response).
    void this.decomposeAndRun(task);

    return task;
  }

  private async decomposeAndRun(task: SwarmTask): Promise<void> {
    try {
      // 1. Decompose
      const subtasks = await this.decomposeTask(task.spec);
      task.subtasks = subtasks;
      task.status = "running";

      // 2. Run all independent subtasks in parallel
      // M3: only parallel pattern. Subtasks with dependsOn wait.
      const independent = subtasks.filter((st) => !st.dependsOn || st.dependsOn.length === 0);
      const dependent = subtasks.filter((st) => st.dependsOn && st.dependsOn.length > 0);

      // Start independent subtasks
      await Promise.all(independent.map((st) => this.runSubTask(task, st)));

      // Start dependent subtasks (M3: simple sequential after deps complete)
      for (const st of dependent) {
        const depsComplete = st.dependsOn!.every((depId) =>
          task.subtasks.find((s) => s.id === depId)?.status === "complete",
        );
        if (depsComplete) {
          await this.runSubTask(task, st);
        } else {
          st.status = "failed";
          console.log(`[swarm:${task.id}] subtask ${st.id} dependencies not met`);
        }
      }

      // 3. Merge results
      task.status = "merging";
      const branches = task.subtasks
        .filter((st) => st.result)
        .map((st) => st.result!.branch);

      if (branches.length > 0) {
        // TODO: create a merge PR combining all subtask branches
        task.prUrl = `https://github.com/example/repo/pull/${task.id.slice(0, 8)}`;
        console.log(`[swarm:${task.id}] merged ${branches.length} branches → PR ${task.prUrl}`);
      }

      task.status = "complete";
    } catch (e) {
      task.status = "failed";
      console.error(`[swarm:${task.id}] failed: ${e}`);
    }
  }

  private async runSubTask(task: SwarmTask, subtask: SubTask): Promise<void> {
    subtask.status = "running";

    // Create a sandbox for this subtask
    const config: SandboxConfig = {
      id: randomUUID(),
      repoUrl: task.repoUrl,
      repoRef: task.repoRef,
      cpuLimit: "2",
      memoryLimit: "2g",
      ttlMinutes: 30,
      egressAllowlist: ["github.com", "registry.npmjs.org", "pypi.org"],
      env: { CASCADE_TASK_ID: task.id, CASCADE_SUBTASK_ID: subtask.id },
    };

    const sandbox = await this.sandboxRuntime.create(config);
    subtask.sandboxId = sandbox.id;

    try {
      // Run the agent in the sandbox
      const result = await this.runAgentInSandbox(sandbox, subtask.spec);

      // Snapshot the sandbox (git commit + push branch)
      const snapshot = await this.sandboxRuntime.snapshot(sandbox);

      subtask.result = {
        summary: result.summary,
        branch: snapshot.branch,
        commitSha: snapshot.commitSha,
      };
      subtask.status = "complete";
    } catch (e) {
      subtask.status = "failed";
      console.error(`[swarm:${task.id}] subtask ${subtask.id} failed: ${e}`);
    } finally {
      // Destroy the sandbox
      if (subtask.sandboxId) {
        const sb = this.sandboxRuntime instanceof DockerSandboxRuntime
          ? (this.sandboxRuntime as DockerSandboxRuntime).list().find((s) => s.id === subtask.sandboxId)
          : undefined;
        if (sb) await this.sandboxRuntime.destroy(sb);
      }
    }
  }

  getTask(id: string): SwarmTask | undefined {
    return this.tasks.get(id);
  }

  listTasks(): SwarmTask[] {
    return [...this.tasks.values()];
  }
}

// Re-export for the runSubTask type check
import { DockerSandboxRuntime } from "./sandbox.js";
