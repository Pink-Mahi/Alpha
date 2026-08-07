/** Models endpoint: returns available models based on the org's BYO keys. */
import { Hono } from "hono";
import { eq } from "drizzle-orm";

import { byoKey } from "../db/schema.ts";
import { getDb } from "../db/client.ts";
import { authMiddleware } from "../auth/middleware.ts";
import type { AuthPrincipal } from "../auth/index.ts";

export const modelRoutes = new Hono<{ Variables: { principal: AuthPrincipal } }>();

modelRoutes.use("*", authMiddleware());

/** Catalog of models per provider. Updated as new models are released. */
const MODEL_CATALOG: Record<string, Array<{
  id: string;
  name: string;
  model: string;
  context_window: number;
  pricing: { input_per_1m: number; output_per_1m: number };
  tags: string[];
}>> = {
  anthropic: [
    {
      id: "anthropic:claude-sonnet-4-5",
      name: "Claude Sonnet 4.5",
      model: "claude-sonnet-4-5-20250514",
      context_window: 200000,
      pricing: { input_per_1m: 3.0, output_per_1m: 15.0 },
      tags: ["recommended", "best-coding", "balanced"],
    },
    {
      id: "anthropic:claude-3-5-sonnet-latest",
      name: "Claude 3.5 Sonnet",
      model: "claude-3-5-sonnet-latest",
      context_window: 200000,
      pricing: { input_per_1m: 3.0, output_per_1m: 15.0 },
      tags: ["coding", "fast"],
    },
    {
      id: "anthropic:claude-3-5-haiku-latest",
      name: "Claude 3.5 Haiku",
      model: "claude-3-5-haiku-latest",
      context_window: 200000,
      pricing: { input_per_1m: 0.8, output_per_1m: 4.0 },
      tags: ["fast", "cheap", "lightweight"],
    },
    {
      id: "anthropic:claude-3-opus-latest",
      name: "Claude 3 Opus",
      model: "claude-3-opus-latest",
      context_window: 200000,
      pricing: { input_per_1m: 15.0, output_per_1m: 75.0 },
      tags: ["most-capable", "expensive"],
    },
  ],
  openai: [
    {
      id: "openai:gpt-4o",
      name: "GPT-4o",
      model: "gpt-4o",
      context_window: 128000,
      pricing: { input_per_1m: 2.5, output_per_1m: 10.0 },
      tags: ["recommended", "multimodal", "balanced"],
    },
    {
      id: "openai:gpt-4o-mini",
      name: "GPT-4o mini",
      model: "gpt-4o-mini",
      context_window: 128000,
      pricing: { input_per_1m: 0.15, output_per_1m: 0.6 },
      tags: ["fast", "cheap", "lightweight"],
    },
    {
      id: "openai:o1",
      name: "o1",
      model: "o1",
      context_window: 200000,
      pricing: { input_per_1m: 15.0, output_per_1m: 60.0 },
      tags: ["reasoning", "expensive"],
    },
    {
      id: "openai:o3-mini",
      name: "o3-mini",
      model: "o3-mini",
      context_window: 200000,
      pricing: { input_per_1m: 3.11, output_per_1m: 12.46 },
      tags: ["reasoning", "fast"],
    },
  ],
  xai: [
    {
      id: "xai:grok-3",
      name: "Grok 3",
      model: "grok-3",
      context_window: 131072,
      pricing: { input_per_1m: 5.0, output_per_1m: 15.0 },
      tags: ["balanced"],
    },
    {
      id: "xai:grok-3-mini",
      name: "Grok 3 Mini",
      model: "grok-3-mini",
      context_window: 131072,
      pricing: { input_per_1m: 0.3, output_per_1m: 0.5 },
      tags: ["fast", "cheap"],
    },
  ],
  google: [
    {
      id: "google:gemini-2.5-pro",
      name: "Gemini 2.5 Pro",
      model: "gemini-2.5-pro",
      context_window: 1000000,
      pricing: { input_per_1m: 1.25, output_per_1m: 10.0 },
      tags: ["long-context", "recommended"],
    },
    {
      id: "google:gemini-2.5-flash",
      name: "Gemini 2.5 Flash",
      model: "gemini-2.5-flash",
      context_window: 1000000,
      pricing: { input_per_1m: 0.075, output_per_1m: 0.3 },
      tags: ["fast", "cheap", "long-context"],
    },
  ],
};

/** GET /v1/models — returns available models grouped by provider,
 * filtered to only providers the org has BYO keys for. */
modelRoutes.get("/v1/models", async (c) => {
  const p = c.get("principal")!;
  const db = getDb();
  const keys = await db.select().from(byoKey).where(eq(byoKey.org_id, p.org_id));

  const providersWithKeys = new Set(keys.map((k) => k.provider));
  const providers: Array<{
    provider: string;
    has_key: boolean;
    models: typeof MODEL_CATALOG[string];
  }> = [];

  for (const [provider, models] of Object.entries(MODEL_CATALOG)) {
    providers.push({
      provider,
      has_key: providersWithKeys.has(provider),
      models,
    });
  }

  // Default model: first recommended model from a provider that has a key
  const defaultModel = providers
    .filter((p) => p.has_key)
    .flatMap((p) => p.models)
    .find((m) => m.tags.includes("recommended"));

  return c.json({
    providers,
    default_model: defaultModel?.id ?? null,
    has_any_key: providersWithKeys.size > 0,
  });
});
