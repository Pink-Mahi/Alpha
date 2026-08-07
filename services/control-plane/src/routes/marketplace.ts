/** Marketplace routes — browse and install curated skills. */
import { Hono } from "hono";
import { z } from "zod";

import { authMiddleware } from "../auth/middleware.ts";
import type { AuthPrincipal } from "../auth/index.ts";
import { CURATED_LISTINGS, type ReviewStatus } from "../marketplace/catalog.ts";

export const marketplaceRoutes = new Hono<{ Variables: { principal: AuthPrincipal } }>();

marketplaceRoutes.use("*", authMiddleware());

/** Browse the marketplace catalog with optional category/review filters. */
marketplaceRoutes.get("/v1/marketplace", (c) => {
  const category = c.req.query("category");
  const review = c.req.query("review") as ReviewStatus | undefined;
  const q = c.req.query("q");

  let listings = CURATED_LISTINGS;
  if (category) listings = listings.filter((l) => l.category === category);
  if (review) listings = listings.filter((l) => l.review === review);
  if (q) {
    const lower = q.toLowerCase();
    listings = listings.filter(
      (l) =>
        l.manifest.name.includes(lower) ||
        l.manifest.description.toLowerCase().includes(lower) ||
        l.tags.some((t) => t.includes(lower)),
    );
  }

  return c.json({
    listings: listings.map((l) => ({
      id: l.id,
      name: l.manifest.name,
      version: l.manifest.version,
      description: l.manifest.description,
      author: l.manifest.author,
      review: l.review,
      category: l.category,
      tags: l.tags,
      installCount: l.installCount,
      rating: l.rating,
      permissions: l.manifest.permissions,
    })),
    total: listings.length,
  });
});

/** Get full details for a specific listing. */
marketplaceRoutes.get("/v1/marketplace/:id", (c) => {
  const listing = CURATED_LISTINGS.find((l) => l.id === c.req.param("id"));
  if (!listing) return c.json({ error: "not_found" }, 404);
  return c.json({ listing });
});

/** Get categories with counts. */
marketplaceRoutes.get("/v1/marketplace/categories", (c) => {
  const categories = new Map<string, number>();
  for (const l of CURATED_LISTINGS) {
    categories.set(l.category, (categories.get(l.category) ?? 0) + 1);
  }
  return c.json({
    categories: [...categories.entries()].map(([name, count]) => ({ name, count })),
  });
});

const installSchema = z.object({
  listing_id: z.string(),
  /** Permissions the user is granting (must be a superset of the skill's requirements). */
  granted_permissions: z.array(z.string()),
  config: z.record(z.unknown()).optional(),
});

/**
 * "Install" a marketplace skill. M2: this records the install intent and
 * returns the skill manifest so the tray agent can register it. The actual
 * registration happens when the tray agent calls POST /v1/skills/install.
 */
marketplaceRoutes.post("/v1/marketplace/install", async (c) => {
  const parsed = installSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);

  const listing = CURATED_LISTINGS.find((l) => l.id === parsed.data!.listing_id);
  if (!listing) return c.json({ error: "listing_not_found" }, 404);

  // Verify all required permissions are granted.
  const required = listing.manifest.permissions;
  const granted = parsed.data!.granted_permissions;
  const ungranted = required.filter((p) => !granted.includes(p));
  if (ungranted.length > 0) {
    return c.json({
      error: "permissions_required",
      required,
      ungranted,
      message: `This skill requires: ${required.join(", ")}. Please grant all required permissions.`,
    }, 403);
  }

  // M2: return the manifest for the tray agent to install.
  // M3: persist the install record + handle revenue share.
  return c.json({
    ok: true,
    listing_id: listing.id,
    manifest: listing.manifest,
    config: parsed.data!.config ?? listing.manifest.defaultConfig ?? {},
    install_instructions: "POST this manifest to the tray agent's /v1/skills/install endpoint",
  });
});
