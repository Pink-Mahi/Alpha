/**
 * Memory service — hierarchical memory with local cache + cloud sync.
 *
 * Scopes: session < project < user < org.
 * Kinds: fact, doc, code, conversation.
 *
 * M1: local SQLite cache + cloud sync to the control plane's memory_item table.
 * Embeddings via pgvector on the cloud side; local side does keyword search
 * until a local embedding model is wired (post-M1).
 *
 * The service exposes an HTTP API (port 8084) and a programmatic client.
 */
import { Hono } from "hono";
import { logger } from "hono/logger";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { Database } from "bun:sqlite";

const app = new Hono();
app.use("*", logger());

// --- Local SQLite cache -----------------------------------------------------

const db = new Database(":memory:", { create: true });
db.run(`
  CREATE TABLE IF NOT EXISTS memory_item (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL,
    scope TEXT NOT NULL,
    ref_id TEXT,
    kind TEXT NOT NULL,
    content TEXT NOT NULL,
    tags TEXT,
    created_at TEXT NOT NULL,
    synced INTEGER DEFAULT 0
  );
`);
db.run(`CREATE INDEX IF NOT EXISTS idx_memory_org_scope ON memory_item(org_id, scope);`);
db.run(`CREATE INDEX IF NOT EXISTS idx_memory_content ON memory_item(content);`);

// --- Cloud sync client ------------------------------------------------------

interface CloudMemoryClient {
  sync(items: MemoryItem[]): Promise<{ synced_ids: string[] }>;
  fetch(orgId: string, scope: string): Promise<MemoryItem[]>;
}

function createCloudClient(baseUrl: string, token: string): CloudMemoryClient {
  return {
    async sync(items) {
      try {
        const resp = await fetch(`${baseUrl}/v1/memory/sync`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ items }),
        });
        if (!resp.ok) return { synced_ids: [] };
        return (await resp.json()) as { synced_ids: string[] };
      } catch {
        return { synced_ids: [] };
      }
    },
    async fetch(orgId, scope) {
      try {
        const resp = await fetch(`${baseUrl}/v1/memory?org_id=${orgId}&scope=${scope}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!resp.ok) return [];
        const data = (await resp.json()) as { items: MemoryItem[] };
        return data.items ?? [];
      } catch {
        return [];
      }
    },
  };
}

interface MemoryItem {
  id: string;
  org_id: string;
  scope: "session" | "project" | "user" | "org";
  ref_id?: string | null;
  kind: "fact" | "doc" | "code" | "conversation";
  content: string;
  tags?: string[];
  created_at: string;
}

const cloudUrl = process.env.CONTROL_PLANE_URL ?? "http://localhost:8080";
const cloudToken = process.env.CLOUD_SYNC_TOKEN ?? "";
const cloud = createCloudClient(cloudUrl, cloudToken);
const syncEnabled = process.env.CLOUD_SYNC_DISABLED !== "1"; // ON by default

// --- Routes -----------------------------------------------------------------

const insertSchema = z.object({
  org_id: z.string().uuid(),
  scope: z.enum(["session", "project", "user", "org"]),
  ref_id: z.string().optional(),
  kind: z.enum(["fact", "doc", "code", "conversation"]),
  content: z.string().min(1),
  tags: z.array(z.string()).optional(),
});

app.get("/healthz", (c) =>
  c.json({ ok: true, cloud_sync: syncEnabled, cloud_url: cloudUrl }),
);

app.post("/v1/memory", async (c) => {
  const parsed = insertSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
  const body = parsed.data;

  const item: MemoryItem = {
    id: randomUUID(),
    org_id: body.org_id,
    scope: body.scope,
    ref_id: body.ref_id ?? null,
    kind: body.kind,
    content: body.content,
    tags: body.tags ?? [],
    created_at: new Date().toISOString(),
  };

  db.run(
    `INSERT INTO memory_item (id, org_id, scope, ref_id, kind, content, tags, created_at, synced)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    [item.id, item.org_id, item.scope, item.ref_id ?? null, item.kind, item.content,
     JSON.stringify(item.tags), item.created_at],
  );

  // Fire-and-forget cloud sync.
  if (syncEnabled && cloudToken) {
    void cloud.sync([item]).then((r) => {
      if (r.synced_ids.length > 0) {
        db.run(`UPDATE memory_item SET synced = 1 WHERE id = ?`, [item.id]);
      }
    });
  }

  return c.json({ item }, 201);
});

app.get("/v1/memory", async (c) => {
  const orgId = c.req.query("org_id");
  const scope = c.req.query("scope");
  if (!orgId) return c.json({ error: "org_id required" }, 400);

  let query = `SELECT * FROM memory_item WHERE org_id = ?`;
  const params: unknown[] = [orgId];
  if (scope) {
    query += ` AND scope = ?`;
    params.push(scope);
  }
  query += ` ORDER BY created_at DESC LIMIT 100`;

  const rows = db.query(query).all(...(params as never[])) as Array<Record<string, unknown>>;
  const items: MemoryItem[] = rows.map((r) => ({
    id: r.id as string,
    org_id: r.org_id as string,
    scope: r.scope as MemoryItem["scope"],
    ref_id: (r.ref_id as string) ?? null,
    kind: r.kind as MemoryItem["kind"],
    content: r.content as string,
    tags: r.tags ? JSON.parse(r.tags as string) : [],
    created_at: r.created_at as string,
  }));

  return c.json({ items });
});

/** Keyword search (M1). Semantic search via embeddings lands post-M1. */
app.get("/v1/memory/search", (c) => {
  const orgId = c.req.query("org_id");
  const q = c.req.query("q");
  if (!orgId || !q) return c.json({ error: "org_id and q required" }, 400);

  const rows = db
    .query(`SELECT * FROM memory_item WHERE org_id = ? AND content LIKE ? ORDER BY created_at DESC LIMIT 50`)
    .all(orgId, `%${q}%`) as Array<Record<string, unknown>>;

  const items: MemoryItem[] = rows.map((r) => ({
    id: r.id as string,
    org_id: r.org_id as string,
    scope: r.scope as MemoryItem["scope"],
    ref_id: (r.ref_id as string) ?? null,
    kind: r.kind as MemoryItem["kind"],
    content: r.content as string,
    tags: r.tags ? JSON.parse(r.tags as string) : [],
    created_at: r.created_at as string,
  }));

  return c.json({ items, query: q });
});

/** Sync all unsynced local items to the cloud. */
app.post("/v1/memory/sync", async (c) => {
  if (!syncEnabled || !cloudToken) return c.json({ ok: true, synced: 0, reason: "sync disabled" });
  const rows = db.query(`SELECT * FROM memory_item WHERE synced = 0`).all() as Array<Record<string, unknown>>;
  const items: MemoryItem[] = rows.map((r) => ({
    id: r.id as string,
    org_id: r.org_id as string,
    scope: r.scope as MemoryItem["scope"],
    ref_id: (r.ref_id as string) ?? null,
    kind: r.kind as MemoryItem["kind"],
    content: r.content as string,
    tags: r.tags ? JSON.parse(r.tags as string) : [],
    created_at: r.created_at as string,
  }));
  const result = await cloud.sync(items);
  for (const id of result.synced_ids) {
    db.run(`UPDATE memory_item SET synced = 1 WHERE id = ?`, [id]);
  }
  return c.json({ ok: true, synced: result.synced_ids.length, total: items.length });
});

const port = Number(process.env.PORT ?? 8084);

if (import.meta.main) {
  const server = Bun.serve({ port, fetch: app.fetch });
  console.log(`[memory-service] listening on http://localhost:${server.port}`);
  console.log(`[memory-service] cloud_sync=${syncEnabled} cloud_url=${cloudUrl}`);
}

export { app };
