#!/usr/bin/env bun
/**
 * dev-launcher.ts — starts all ALPHA services for local development.
 *
 * Starts (in order):
 *   1. Control plane (port 8080)
 *   2. Model router (port 8081, Python/uvicorn)
 *   3. Local agent runtime (port 8083)
 *   4. Memory service (port 8084)
 *
 * Prerequisites:
 *   - Docker: docker compose up -d  (Postgres + Redis)
 *   - bun install (root)
 *   - uv sync in services/model-router
 *   - DATABASE_URL set (see .env.example)
 *
 * Usage: bun scripts/dev-launcher.ts
 */
import { $, spawn } from "bun";

const services = [
  {
    name: "control-plane",
    port: 8080,
    cmd: ["bun", "services/control-plane/src/index.ts"],
    env: { PORT: "8080", JWT_SECRET: "dev-secret-change-me" },
  },
  {
    name: "model-router",
    port: 8081,
    cmd: ["uv", "run", "uvicorn", "alpha_model_router.app:app", "--port", "8081"],
    cwd: "services/model-router",
    env: {},
  },
  {
    name: "local-agent",
    port: 8083,
    cmd: ["bun", "runtimes/local-agent/src/index.ts"],
    env: { PORT: "8083", MODEL_ROUTER_URL: "http://localhost:8081" },
  },
  {
    name: "memory-service",
    port: 8084,
    cmd: ["bun", "services/memory-service/src/index.ts"],
    env: { PORT: "8084", CONTROL_PLANE_URL: "http://localhost:8080" },
  },
];

const procs: Array<{ name: string; proc: ReturnType<typeof spawn> }> = [];

console.log("=== ALPHA Dev Launcher ===\n");

for (const svc of services) {
  console.log(`Starting ${svc.name} on port ${svc.port}...`);
  const proc = spawn({
    cmd: svc.cmd,
    cwd: svc.cwd ?? ".",
    env: { ...process.env, ...svc.env },
    stdout: "pipe",
    stderr: "pipe",
  });
  procs.push({ name: svc.name, proc });

  // Stream output with prefix.
  (async () => {
    const reader = proc.stdout.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value);
      for (const line of text.split("\n")) {
        if (line.trim()) console.log(`[${svc.name}] ${line}`);
      }
    }
  })();
  (async () => {
    const reader = proc.stderr.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value);
      for (const line of text.split("\n")) {
        if (line.trim()) console.error(`[${svc.name}] ${line}`);
      }
    }
  })();

  await Bun.sleep(1000); // Stagger starts slightly.
}

console.log("\n=== All services starting. Press Ctrl+C to stop. ===\n");
console.log("Endpoints:");
console.log("  Control plane:  http://localhost:8080/healthz");
console.log("  Model router:   http://localhost:8081/healthz");
console.log("  Local agent:    http://localhost:8083/healthz");
console.log("  Memory service: http://localhost:8084/healthz");

// Wait for Ctrl+C.
process.on("SIGINT", () => {
  console.log("\n=== Shutting down ===");
  for (const { name, proc } of procs) {
    console.log(`Killing ${name}...`);
    proc.kill();
  }
  process.exit(0);
});

await new Promise(() => {}); // Run forever.
