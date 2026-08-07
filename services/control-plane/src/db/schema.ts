/**
 * Drizzle schema — core entities for the control plane.
 *
 * Multi-tenant: every row carries org_id (enforced at ORM + DB RLS layers).
 * Sensitive fields encrypted at the application layer with per-tenant keys
 * (KMS integration lands post-M0; M0 uses a placeholder cipher).
 */
import { pgTable, uuid, text, timestamp, integer, boolean, jsonb, numeric, pgEnum } from "drizzle-orm/pg-core";

// --- Enums -----------------------------------------------------------------

export const planEnum = pgEnum("plan", ["free", "pro", "team", "business", "enterprise"]);
export const roleEnum = pgEnum("role", ["owner", "admin", "member", "billing"]);
export const seatStatusEnum = pgEnum("seat_status", ["active", "invited", "revoked"]);
export const usageTypeEnum = pgEnum("usage_type", ["tokens", "vm_hour", "phone_min", "number_day", "credits"]);
export const runtimeEnum = pgEnum("runtime", ["local", "cloud"]);
export const taskStatusEnum = pgEnum("task_status", ["pending", "planning", "running", "paused", "complete", "failed", "killed"]);
export const memoryScopeEnum = pgEnum("memory_scope", ["session", "project", "user", "org"]);
export const numberStatusEnum = pgEnum("number_status", ["active", "released", "porting"]);
export const callStatusEnum = pgEnum("call_status", ["ringing", "in_progress", "ended", "voicemail", "failed"]);
export const callDirectionEnum = pgEnum("call_direction", ["inbound", "outbound"]);
export const skillVisibilityEnum = pgEnum("skill_visibility", ["public", "org", "private"]);
export const skillStatusEnum = pgEnum("skill_status", ["draft", "in_review", "published", "suspended", "removed"]);

// --- Tables ----------------------------------------------------------------

export const org = pgTable("org", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  plan: planEnum("plan").notNull().default("free"),
  billing_id: text("billing_id"), // Stripe customer id
  spend_cap_usd: numeric("spend_cap_usd", { precision: 12, scale: 4 }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const user = pgTable("user", {
  id: uuid("id").primaryKey().defaultRandom(),
  org_id: uuid("org_id").notNull().references(() => org.id, { onDelete: "cascade" }),
  role: roleEnum("role").notNull().default("member"),
  email: text("email").notNull(),
  password_hash: text("password_hash"), // null for SSO-only users
  sso_subject: text("sso_subject"), // google sub / github node id
  name: text("name"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const seat = pgTable("seat", {
  id: uuid("id").primaryKey().defaultRandom(),
  org_id: uuid("org_id").notNull().references(() => org.id, { onDelete: "cascade" }),
  user_id: uuid("user_id").references(() => user.id, { onDelete: "set null" }),
  status: seatStatusEnum("status").notNull().default("invited"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const apiKey = pgTable("api_key", {
  id: uuid("id").primaryKey().defaultRandom(),
  org_id: uuid("org_id").notNull().references(() => org.id, { onDelete: "cascade" }),
  user_id: uuid("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  hashed_secret: text("hashed_secret").notNull(),
  scopes: text("scopes").array().notNull().default([]),
  last_used_at: timestamp("last_used_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** User-supplied LLM provider keys (BYO-key). Encrypted with tenant key. */
export const byoKey = pgTable("byo_key", {
  id: uuid("id").primaryKey().defaultRandom(),
  org_id: uuid("org_id").notNull().references(() => org.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(), // anthropic | openai | xai | google
  encrypted_key: text("encrypted_key").notNull(),
  label: text("label").notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const task = pgTable("task", {
  id: uuid("id").primaryKey().defaultRandom(),
  org_id: uuid("org_id").notNull().references(() => org.id, { onDelete: "cascade" }),
  user_id: uuid("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  spec: text("spec").notNull(),
  status: taskStatusEnum("status").notNull().default("pending"),
  budget_usd: numeric("budget_usd", { precision: 12, scale: 4 }).notNull(),
  deadline: timestamp("deadline", { withTimezone: true }),
  runtime_pref: runtimeEnum("runtime_pref").default("local"),
  repo_ref: text("repo_ref"),
  model: text("model"), // e.g. "anthropic:claude-3-5-sonnet-latest" — null = auto-pick
  agent_count: integer("agent_count").notNull().default(1), // 1-5 agents for swarm mode
  agent_models: text("agent_models"), // JSON array of per-agent models for multi-provider swarms
  supervisor_enabled: boolean("supervisor_enabled").notNull().default(false), // enable supervisor agents
  supervisor_count: integer("supervisor_count").notNull().default(0), // 0-2 supervisor agents
  supervisor_models: text("supervisor_models"), // JSON array of supervisor models
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Conversation messages for multi-turn agent chat. */
export const taskMessage = pgTable("task_message", {
  id: uuid("id").primaryKey().defaultRandom(),
  task_id: uuid("task_id").notNull().references(() => task.id, { onDelete: "cascade" }),
  org_id: uuid("org_id").notNull().references(() => org.id, { onDelete: "cascade" }),
  role: text("role").notNull(), // "user" | "assistant"
  content: text("content").notNull(),
  model: text("model"), // which model generated this (null for user messages)
  cost_usd: numeric("cost_usd", { precision: 12, scale: 6 }).default("0"),
  tokens_in: integer("tokens_in").default(0),
  tokens_out: integer("tokens_out").default(0),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const agentRun = pgTable("agent_run", {
  id: uuid("id").primaryKey().defaultRandom(),
  org_id: uuid("org_id").notNull().references(() => org.id, { onDelete: "cascade" }),
  user_id: uuid("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  task_id: uuid("task_id").notNull().references(() => task.id, { onDelete: "cascade" }),
  runtime: runtimeEnum("runtime").notNull(),
  status: text("status").notNull().default("running"),
  cost_usd: numeric("cost_usd", { precision: 12, scale: 4 }).notNull().default("0"),
  checkpoint_id: uuid("checkpoint_id"),
  parent_run_id: uuid("parent_run_id"),
  started_at: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  ended_at: timestamp("ended_at", { withTimezone: true }),
});

export const checkpoint = pgTable("checkpoint", {
  id: uuid("id").primaryKey().defaultRandom(),
  agent_run_id: uuid("agent_run_id").notNull().references(() => agentRun.id, { onDelete: "cascade" }),
  seq: integer("seq").notNull(),
  state_blob_ref: text("state_blob_ref").notNull(),
  fs_snapshot_ref: text("fs_snapshot_ref"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const usageEvent = pgTable("usage_event", {
  id: uuid("id").primaryKey().defaultRandom(),
  org_id: uuid("org_id").notNull().references(() => org.id, { onDelete: "cascade" }),
  agent_run_id: uuid("agent_run_id"),
  type: usageTypeEnum("type").notNull(),
  units: numeric("units", { precision: 16, scale: 6 }).notNull(),
  cost_usd: numeric("cost_usd", { precision: 12, scale: 6 }).notNull(),
  ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
});

export const memoryItem = pgTable("memory_item", {
  id: uuid("id").primaryKey().defaultRandom(),
  org_id: uuid("org_id").notNull().references(() => org.id, { onDelete: "cascade" }),
  scope: memoryScopeEnum("scope").notNull(),
  ref_id: uuid("ref_id"), // session/project/user id depending on scope
  kind: text("kind").notNull(), // fact | doc | code | conversation
  content: text("content").notNull(), // encrypted for sensitive kinds (M0: plaintext)
  embedding: jsonb("embedding"), // pgvector column added via raw SQL migration
  perms: text("perms").array().notNull().default([]),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const project = pgTable("project", {
  id: uuid("id").primaryKey().defaultRandom(),
  org_id: uuid("org_id").notNull().references(() => org.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  repo_url: text("repo_url"),
  index_state: text("index_state").notNull().default("unindexed"),
  sync_enabled: boolean("sync_enabled").notNull().default(true),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const skill = pgTable("skill", {
  id: uuid("id").primaryKey().defaultRandom(),
  publisher_id: uuid("publisher_id"), // nullable for system skills
  name: text("name").notNull(),
  version: text("version").notNull(),
  manifest: jsonb("manifest").notNull(),
  permissions: text("permissions").array().notNull().default([]),
  signed_pkg_url: text("signed_pkg_url"),
  visibility: skillVisibilityEnum("visibility").notNull().default("private"),
  status: skillStatusEnum("status").notNull().default("draft"),
  installs: integer("installs").notNull().default(0),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const skillInstall = pgTable("skill_install", {
  id: uuid("id").primaryKey().defaultRandom(),
  org_id: uuid("org_id").notNull().references(() => org.id, { onDelete: "cascade" }),
  skill_id: uuid("skill_id").notNull().references(() => skill.id, { onDelete: "cascade" }),
  agent_scope: text("agent_scope").notNull(),
  granted_perms: text("granted_perms").array().notNull().default([]),
  installed_by: uuid("installed_by").notNull().references(() => user.id, { onDelete: "cascade" }),
  installed_at: timestamp("installed_at", { withTimezone: true }).notNull().defaultNow(),
});

export const phoneNumber = pgTable("phone_number", {
  id: uuid("id").primaryKey().defaultRandom(),
  org_id: uuid("org_id").notNull().references(() => org.id, { onDelete: "cascade" }),
  user_id: uuid("user_id").references(() => user.id, { onDelete: "set null" }),
  e164: text("e164").notNull(),
  region: text("region").notNull().default("US"),
  provider: text("provider").notNull().default("twilio"),
  status: numberStatusEnum("status").notNull().default("active"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const callSession = pgTable("call_session", {
  id: uuid("id").primaryKey().defaultRandom(),
  org_id: uuid("org_id").notNull().references(() => org.id, { onDelete: "cascade" }),
  phone_number_id: uuid("phone_number_id").notNull().references(() => phoneNumber.id, { onDelete: "cascade" }),
  direction: callDirectionEnum("direction").notNull(),
  status: callStatusEnum("status").notNull().default("ringing"),
  transcript_ref: text("transcript_ref"),
  recording_ref: text("recording_ref"),
  cost_usd: numeric("cost_usd", { precision: 12, scale: 6 }).notNull().default("0"),
  agent_run_id: uuid("agent_run_id"),
  started_at: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  ended_at: timestamp("ended_at", { withTimezone: true }),
});

export const webhook = pgTable("webhook", {
  id: uuid("id").primaryKey().defaultRandom(),
  org_id: uuid("org_id").notNull().references(() => org.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  events: text("events").array().notNull().default([]),
  secret: text("secret").notNull(),
  status: text("status").notNull().default("active"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  org_id: uuid("org_id").notNull().references(() => org.id, { onDelete: "cascade" }),
  actor: text("actor").notNull(), // user_id | agent_run_id | system
  action: text("action").notNull(),
  target: text("target"),
  detail: jsonb("detail"),
  ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
});
