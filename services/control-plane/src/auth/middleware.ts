/**
 * Hono middleware: authenticate the request and attach `ctx.var.principal`.
 *
 * Tries JWT first, then API key (hashed secret). On failure, 401.
 * Optional auth: pass { optional: true } to allow anonymous.
 */
import type { Context, Next } from "hono";

import { bearer, principalFromApiKey, verifyJwt, type AuthPrincipal } from "./index.ts";

export interface AuthVars {
  principal: AuthPrincipal;
}

export function authMiddleware(opts: { optional?: boolean } = {}) {
  return async (c: Context, next: Next) => {
    const authz = c.req.header("authorization");
    const token = bearer(authz);
    let principal: AuthPrincipal | null = null;
    if (token) {
      // Heuristic: JWTs contain a dot; API keys are bare tokens. Try JWT first.
      if (token.split(".").length === 3) {
        principal = await verifyJwt(token);
      }
      if (!principal) {
        principal = await principalFromApiKey(token);
      }
    }
    if (!principal && !opts.optional) {
      return c.json({ error: "unauthorized" }, 401);
    }
    if (principal) c.set("principal", principal);
    await next();
  };
}

/** Require a specific scope on the principal (for API keys). */
export function requireScope(scope: string) {
  return async (c: Context, next: Next) => {
    const p = c.get("principal") as AuthPrincipal | undefined;
    if (!p) return c.json({ error: "unauthorized" }, 401);
    if (p.kind === "api_key" && !(p.scopes ?? []).includes(scope)) {
      return c.json({ error: "insufficient_scope", required: scope }, 403);
    }
    await next();
  };
}
