/**
 * Sandbox manager — abstracts isolated execution environments.
 *
 * Production: gVisor microVMs (runsc) on GKE. Each agent task gets its own
 * sandbox with:
 * - A cloned copy of the repo
 * - Network restrictions (egress allowlist)
 * - CPU/memory limits
 * - Time-to-live (auto-destroy after N minutes)
 *
 * Local dev: Docker containers (fallback). Same interface, less isolation.
 *
 * The sandbox lifecycle:
 *   create → setup (clone repo, install deps) → run (agent executes) →
 *   snapshot (save changes) → destroy
 */

export interface SandboxConfig {
  id: string;
  repoUrl: string;
  repoRef: string; // branch/commit
  cpuLimit: string; // e.g. "2"
  memoryLimit: string; // e.g. "2g"
  ttlMinutes: number;
  /** Allowed egress domains (for package registries, git, etc.) */
  egressAllowlist: string[];
  /** Environment variables to set inside the sandbox */
  env: Record<string, string>;
}

export interface Sandbox {
  id: string;
  status: "creating" | "ready" | "running" | "snapshotting" | "destroyed" | "failed";
  config: SandboxConfig;
  /** Working directory inside the sandbox */
  workdir: string;
  createdAt: Date;
  /** Destroy timer */
  ttlTimer?: ReturnType<typeof setTimeout>;
}

export interface SandboxExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface ISandboxRuntime {
  create(config: SandboxConfig): Promise<Sandbox>;
  exec(sandbox: Sandbox, command: string): Promise<SandboxExecResult>;
  writeFile(sandbox: Sandbox, path: string, content: string): Promise<void>;
  readFile(sandbox: Sandbox, path: string): Promise<string>;
  snapshot(sandbox: Sandbox): Promise<{ branch: string; commitSha: string }>;
  destroy(sandbox: Sandbox): Promise<void>;
}

/**
 * Docker-based sandbox runtime (local dev fallback).
 * Production uses gVisor via Kubernetes API.
 */
export class DockerSandboxRuntime implements ISandboxRuntime {
  private sandboxes = new Map<string, Sandbox>();

  async create(config: SandboxConfig): Promise<Sandbox> {
    const sandbox: Sandbox = {
      id: config.id,
      status: "creating",
      config,
      workdir: "/workspace",
      createdAt: new Date(),
    };
    this.sandboxes.set(config.id, sandbox);

    // In production: call Kubernetes API to create a pod with runsc.
    // In local dev: create a Docker container.
    // M3 skeleton: log the intent, mark as ready.
    console.log(`[sandbox:${config.id}] creating Docker container for ${config.repoUrl}@${config.repoRef}`);
    console.log(`[sandbox:${config.id}] CPU=${config.cpuLimit} MEM=${config.memoryLimit} TTL=${config.ttlMinutes}min`);

    // TODO: actual Docker/K8s integration
    // For now, simulate setup:
    // 1. docker run -d --name ALPHA-{id} -m {memory} --cpus {cpu} ubuntu:22.04 sleep infinity
    // 2. docker exec ALPHA-{id} git clone {repoUrl} /workspace
    // 3. docker exec ALPHA-{id} cd /workspace && git checkout {ref}

    sandbox.status = "ready";

    // Set TTL timer
    sandbox.ttlTimer = setTimeout(() => {
      console.log(`[sandbox:${config.id}] TTL expired, destroying`);
      void this.destroy(sandbox);
    }, config.ttlMinutes * 60 * 1000);

    return sandbox;
  }

  async exec(sandbox: Sandbox, command: string): Promise<SandboxExecResult> {
    console.log(`[sandbox:${sandbox.id}] exec: ${command.slice(0, 100)}`);
    // TODO: docker exec ALPHA-{id} sh -c "{command}"
    return { stdout: "[sandbox stub: command executed]", stderr: "", exitCode: 0 };
  }

  async writeFile(sandbox: Sandbox, path: string, content: string): Promise<void> {
    console.log(`[sandbox:${sandbox.id}] write ${path} (${content.length} bytes)`);
    // TODO: docker cp or docker exec sh -c 'cat > {path}'
  }

  async readFile(sandbox: Sandbox, path: string): Promise<string> {
    console.log(`[sandbox:${sandbox.id}] read ${path}`);
    // TODO: docker exec cat {path}
    return "[sandbox stub: file contents]";
  }

  async snapshot(sandbox: Sandbox): Promise<{ branch: string; commitSha: string }> {
    sandbox.status = "snapshotting";
    console.log(`[sandbox:${sandbox.id}] snapshotting (git commit + push branch)`);
    // TODO:
    // 1. docker exec git add -A
    // 2. docker exec git commit -m "ALPHA: {task title}"
    // 3. docker exec git push origin ALPHA/{taskId}
    // 4. Return branch name + commit SHA
    const branch = `ALPHA/${sandbox.id}`;
    const commitSha = "stub-commit-sha";
    sandbox.status = "ready";
    return { branch, commitSha };
  }

  async destroy(sandbox: Sandbox): Promise<void> {
    if (sandbox.ttlTimer) clearTimeout(sandbox.ttlTimer);
    sandbox.status = "destroyed";
    console.log(`[sandbox:${sandbox.id}] destroyed`);
    // TODO: docker rm -f ALPHA-{id}
    this.sandboxes.delete(sandbox.id);
  }

  list(): Sandbox[] {
    return [...this.sandboxes.values()];
  }
}
