/** BYO-key routes: register/rotate/delete user-supplied LLM provider keys. */
import { Hono } from "hono";
import { z } from "zod";
import { eq, and } from "drizzle-orm";

import { byoKey } from "../db/schema.ts";
import { getDb } from "../db/client.ts";
import { authMiddleware } from "../auth/middleware.ts";
import type { AuthPrincipal } from "../auth/index.ts";

export const byoKeyRoutes = new Hono<{ Variables: { principal: AuthPrincipal } }>();

const providers = ["anthropic", "openai", "xai", "google", "openrouter"] as const;

const createSchema = z.object({
  provider: z.enum(providers),
  key: z.string().min(10),
  label: z.string().max(80).optional(),
});

byoKeyRoutes.use("*", authMiddleware());

byoKeyRoutes.get("/v1/byo-keys", async (c) => {
  const p = c.get("principal")!;
  const db = getDb();
  const rows = await db
    .select({ id: byoKey.id, provider: byoKey.provider, label: byoKey.label, created_at: byoKey.created_at })
    .from(byoKey)
    .where(eq(byoKey.org_id, p.org_id));
  return c.json({ keys: rows });
});

byoKeyRoutes.post("/v1/byo-keys", async (c) => {
  const p = c.get("principal")!;
  const parsed = createSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
  const { provider, key, label } = parsed.data;

  // M0 placeholder cipher: base64. Real KMS envelope encryption lands before any
  // real key is stored. DO NOT use in production.
  const encrypted = Buffer.from(key, "utf8").toString("base64");
  const db = getDb();
  const row = await db
    .insert(byoKey)
    .values({ org_id: p.org_id, provider, encrypted_key: encrypted, label: label ?? `${provider} key` })
    .returning({ id: byoKey.id, provider: byoKey.provider, label: byoKey.label });
  return c.json({ key: row[0] }, 201);
});

byoKeyRoutes.delete("/v1/byo-keys/:id", async (c) => {
  const p = c.get("principal")!;
  const id = c.req.param("id");
  const db = getDb();
  await db.delete(byoKey).where(and(eq(byoKey.id, id), eq(byoKey.org_id, p.org_id)));
  return c.json({ ok: true });
});
