/** Auth + org routes: signup, login, org creation, seats. */
import { Hono } from "hono";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";

import { org, seat, user } from "../db/schema.ts";
import { getDb } from "../db/client.ts";
import { hashPassword, issueJwt, verifyPassword, type AuthPrincipal } from "../auth/index.ts";
import { authMiddleware } from "../auth/middleware.ts";

export const authRoutes = new Hono<{ Variables: { principal: AuthPrincipal } }>();

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  org_name: z.string().min(1).max(80),
  name: z.string().max(120).optional(),
});

authRoutes.post("/v1/auth/signup", async (c) => {
  const parsed = signupSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
  const { email, password, org_name, name } = parsed.data;

  const db = getDb();
  // M0: no unique email enforcement across orgs yet (email is per-org). Add a
  // lookup-by-email index when SSO lands in M1.
  const newOrg = await db.insert(org).values({ name: org_name, plan: "free" }).returning();
  const u = await db
    .insert(user)
    .values({
      org_id: newOrg[0]!.id,
      email,
      password_hash: await hashPassword(password),
      name,
      role: "owner",
    })
    .returning();
  await db.insert(seat).values({ org_id: newOrg[0]!.id, user_id: u[0]!.id, status: "active" });

  const principal: AuthPrincipal = { kind: "user", user_id: u[0]!.id, org_id: newOrg[0]!.id, role: "owner" };
  const token = await issueJwt(principal);
  return c.json({ token, user: { id: u[0]!.id, email, role: "owner" }, org: { id: newOrg[0]!.id, name: org_name } }, 201);
});

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

authRoutes.post("/v1/auth/login", async (c) => {
  const parsed = loginSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "invalid_body" }, 400);
  const { email, password } = parsed.data;

  const db = getDb();
  const rows = await db.select().from(user).where(eq(user.email, email)).limit(2);
  if (rows.length === 0) return c.json({ error: "invalid_credentials" }, 401);
  // If multiple orgs share an email (post-SSO), require an org_id param. M0: take first.
  const u = rows[0]!;
  if (!u.password_hash || !(await verifyPassword(password, u.password_hash))) {
    return c.json({ error: "invalid_credentials" }, 401);
  }
  const token = await issueJwt({ kind: "user", user_id: u.id, org_id: u.org_id, role: u.role });
  return c.json({ token, user: { id: u.id, email: u.email, role: u.role }, org_id: u.org_id });
});

authRoutes.get("/v1/me", authMiddleware(), (c) => {
  const p = c.get("principal")!;
  return c.json({ principal: p });
});

authRoutes.post("/v1/seats", authMiddleware(), async (c) => {
  const p = c.get("principal")!;
  if (p.role !== "owner" && p.role !== "admin") return c.json({ error: "forbidden" }, 403);
  const body = (await c.req.json().catch(() => ({}))) as { email?: string };
  if (!body.email) return c.json({ error: "email_required" }, 400);
  const db = getDb();
  const s = await db
    .insert(seat)
    .values({ org_id: p.org_id, status: "invited" })
    .returning();
  return c.json({ seat: s[0], invite_token: nanoid(24) }, 201);
});
