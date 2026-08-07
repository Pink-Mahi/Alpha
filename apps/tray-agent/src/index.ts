/**
 * Tray agent — the persistent personal agent runtime.
 *
 * Runs as a background process (will be wrapped in a Tauri tray app for
 * production). Hosts:
 * - The heartbeat scheduler (proactive actions)
 * - The skills registry (installed skills + their heartbeats)
 * - An HTTP API for the IDE and other clients to interact with the personal agent
 * - Messaging integration hooks (Slack/SMS/Email — M2)
 *
 * Port 8085.
 */
import { Hono } from "hono";
import { logger } from "hono/logger";
import { z } from "zod";
import { randomUUID } from "node:crypto";

import { HeartbeatScheduler } from "./heartbeat.js";
import { SkillRegistry, type SkillManifest } from "./skills.js";
import { BUILTIN_SKILLS } from "./builtinSkills.js";
import { MessagingService } from "./messaging.js";

const app = new Hono();
app.use("*", logger());

const scheduler = new HeartbeatScheduler();
const skills = new SkillRegistry();
const messaging = MessagingService.fromEnv();

// Register built-in skills as available + auto-install them.
for (const manifest of BUILTIN_SKILLS) {
  skills.registerAvailable(manifest);
  // Auto-install with all requested permissions (built-in trust).
  skills.install(manifest, manifest.permissions, manifest.defaultConfig);
}

// Register heartbeats from installed skills.
for (const { skillId, heartbeat } of skills.getHeartbeats()) {
  scheduler.register({
    id: `${skillId}:${heartbeat.id}`,
    name: heartbeat.name,
    schedule: heartbeat.schedule,
    scheduleType: heartbeat.scheduleType,
    enabled: true,
    execute: async () => {
      // M2: skill action execution is a stub. The actual action functions
      // will be loaded from the skill module (dynamic import) once the
      // skill package format is finalized. For now, log the heartbeat.
      console.log(`[skill:${skillId}] heartbeat ${heartbeat.action}() would run here`);
    },
  });
}

// --- Routes -----------------------------------------------------------------

app.get("/healthz", (c) =>
  c.json({
    ok: true,
    skills: skills.listInstalled().map((s) => s.id),
    heartbeats: scheduler.list().map((h) => ({ id: h.id, name: h.name, enabled: h.enabled, runCount: h.runCount })),
    messaging: messaging.list().map((ch) => ch.name),
  }),
);

app.get("/v1/skills", (c) => {
  const installed = skills.listInstalled().map((s) => ({
    id: s.id,
    name: s.manifest.name,
    version: s.manifest.version,
    description: s.manifest.description,
    enabled: s.enabled,
    permissions: s.grantedPermissions,
  }));
  const available = skills.listAvailable().map((s) => ({
    name: s.name,
    version: s.version,
    description: s.description,
    permissions: s.permissions,
  }));
  return c.json({ installed, available });
});

const installSchema = z.object({
  name: z.string(),
  version: z.string(),
  permissions: z.array(z.string()),
  config: z.record(z.unknown()).optional(),
});

app.post("/v1/skills/install", async (c) => {
  const parsed = installSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
  const { name, version, permissions, config } = parsed.data;

  const manifest = skills.listAvailable().find((s) => s.name === name && s.version === version);
  if (!manifest) return c.json({ error: "skill_not_found" }, 404);

  const skill = skills.install(manifest, permissions, config);
  // Register heartbeats from the newly installed skill.
  for (const hb of manifest.heartbeats ?? []) {
    scheduler.register({
      id: `${skill.id}:${hb.id}`,
      name: hb.name,
      schedule: hb.schedule,
      scheduleType: hb.scheduleType,
      enabled: true,
      execute: async () => {
        console.log(`[skill:${skill.id}] heartbeat ${hb.action}() would run here`);
      },
    });
  }
  return c.json({ skill: { id: skill.id, enabled: skill.enabled } }, 201);
});

app.post("/v1/skills/:id/:action", (c) => {
  const id = c.req.param("id");
  const action = c.req.param("action") as "enable" | "disable" | "uninstall";
  if (action === "enable") skills.enable(id);
  else if (action === "disable") skills.disable(id);
  else if (action === "uninstall") {
    skills.uninstall(id);
    // Also unregister heartbeats for this skill.
    for (const hb of scheduler.list().filter((h) => h.id.startsWith(`${id}:`))) {
      scheduler.unregister(hb.id);
    }
  } else {
    return c.json({ error: "invalid_action" }, 400);
  }
  return c.json({ ok: true, id, action });
});

app.get("/v1/heartbeats", (c) => {
  const heartbeats = scheduler.list().map((h) => ({
    id: h.id,
    name: h.name,
    schedule: h.schedule,
    scheduleType: h.scheduleType,
    enabled: h.enabled,
    runCount: h.runCount,
    lastRun: h.lastRun?.toISOString() ?? null,
    lastResult: h.lastResult ?? null,
  }));
  return c.json({ heartbeats });
});

app.post("/v1/heartbeats/:id/:action", (c) => {
  const id = c.req.param("id");
  const action = c.req.param("action") as "enable" | "disable";
  if (action === "enable") scheduler.enable(id);
  else if (action === "disable") scheduler.disable(id);
  else return c.json({ error: "invalid_action" }, 400);
  return c.json({ ok: true, id, action });
});

// --- Messaging routes -------------------------------------------------------

app.get("/v1/messaging/channels", (c) => {
  return c.json({ channels: messaging.list() });
});

const sendSchema = z.object({
  channel: z.string(),
  to: z.string(),
  subject: z.string().optional(),
  body: z.string().min(1),
});

app.post("/v1/messaging/send", async (c) => {
  const parsed = sendSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
  const result = await messaging.send(parsed.data.channel, {
    to: parsed.data.to,
    subject: parsed.data.subject,
    body: parsed.data.body,
  });
  if (!result.ok) return c.json({ error: "send_failed", detail: result.error }, 502);
  return c.json({ ok: true, id: result.id });
});

const port = Number(process.env.PORT ?? 8085);

if (import.meta.main) {
  const server = Bun.serve({ port, fetch: app.fetch });
  console.log(`[tray-agent] listening on http://localhost:${server.port}`);
  console.log(`[tray-agent] skills: ${skills.listInstalled().map((s) => s.id).join(", ")}`);
  console.log(`[tray-agent] heartbeats: ${scheduler.list().filter((h) => h.enabled).length} active`);
  console.log(`[tray-agent] messaging: ${messaging.list().map((c) => c.name).join(", ")}`);
}

// Clean shutdown.
process.on("SIGINT", () => {
  scheduler.stopAll();
  process.exit(0);
});

export { app };
