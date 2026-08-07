/**
 * Auth — JWT issuance + verification, API key auth, Hono middleware.
 *
 * M0: email/password + API keys. SSO (Google/GitHub) lands in M1.
 * Passwords hashed with bcryptjs. JWTs signed with JWT_SECRET.
 */
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { eq, and } from "drizzle-orm";
import { createHash } from "node:crypto";

import { apiKey, user } from "../db/schema.ts";
import { getDb } from "../db/client.ts";

const SECRET = new TextEncoder().encode(process.env.JWT_SECRET ?? "dev-secret-change-me");
const TTL = Number(process.env.JWT_TTL_SECONDS ?? 60 * 60 * 24 * 30);

export interface AuthPrincipal {
  kind: "user" | "api_key";
  user_id: string;
  org_id: string;
  role: string;
  scopes?: string[];
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export async function issueJwt(principal: AuthPrincipal): Promise<string> {
  return new SignJWT({
    kind: principal.kind,
    user_id: principal.user_id,
    org_id: principal.org_id,
    role: principal.role,
    scopes: principal.scopes ?? [],
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${TTL}s`)
    .sign(SECRET);
}

export async function verifyJwt(token: string): Promise<AuthPrincipal | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET, { algorithms: ["HS256"] });
    if (typeof payload.user_id !== "string" || typeof payload.org_id !== "string") return null;
    return {
      kind: (payload.kind as "user" | "api_key") ?? "user",
      user_id: payload.user_id,
      org_id: payload.org_id,
      role: (payload.role as string) ?? "member",
      scopes: (payload.scopes as string[]) ?? [],
    };
  } catch {
    return null;
  }
}

/** Hash an API key secret for storage (SHA-256; secrets are random 32-byte nanoids). */
export function hashApiKeySecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

/** Look up an API key by its hashed secret and return a principal. */
export async function principalFromApiKey(rawSecret: string): Promise<AuthPrincipal | null> {
  const hashed = hashApiKeySecret(rawSecret);
  const db = getDb();
  const rows = await db
    .select({
      id: apiKey.id,
      user_id: apiKey.user_id,
      org_id: apiKey.org_id,
      scopes: apiKey.scopes,
      role: user.role,
    })
    .from(apiKey)
    .innerJoin(user, eq(user.id, apiKey.user_id))
    .where(and(eq(apiKey.hashed_secret, hashed)));
  if (rows.length === 0) return null;
  const r = rows[0]!;
  // Fire-and-forget last_used update.
  void db.update(apiKey).set({ last_used_at: new Date() }).where(eq(apiKey.id, r.id));
  return { kind: "api_key", user_id: r.user_id, org_id: r.org_id, role: r.role, scopes: r.scopes };
}

/** Extract a bearer token from an Authorization header. */
export function bearer(authz: string | undefined): string | null {
  if (!authz) return null;
  const m = /^Bearer\s+(.+)$/i.exec(authz);
  return m ? m[1]! : null;
}
