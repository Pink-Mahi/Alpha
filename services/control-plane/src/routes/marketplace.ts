/** Marketplace routes — browse, install, submit, and review skills. */
import { Hono } from "hono";
import { z } from "zod";

import { authMiddleware } from "../auth/middleware.ts";
import type { AuthPrincipal } from "../auth/index.ts";
import { CURATED_LISTINGS, type ReviewStatus } from "../marketplace/catalog.ts";
import { SubmissionManager } from "../marketplace/submission.ts";

export const marketplaceRoutes = new Hono<{ Variables: { principal: AuthPrincipal } }>();

marketplaceRoutes.use("*", authMiddleware());

const submissionManager = new SubmissionManager();

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

// --- Open submission (M3) ---------------------------------------------------

const submitSchema = z.object({
  manifest: z.object({
    name: z.string().min(1),
    version: z.string().min(1),
    description: z.string().min(1),
    author: z.string().min(1),
    permissions: z.array(z.string()),
    tools: z.array(z.string()).optional(),
    heartbeats: z.array(z.object({
      id: z.string(), name: z.string(), schedule: z.string(),
      scheduleType: z.enum(["cron", "interval"]), action: z.string(),
    })).optional(),
    configSchema: z.record(z.unknown()).optional(),
    defaultConfig: z.record(z.unknown()).optional(),
  }),
  category: z.string().min(1),
  tags: z.array(z.string()),
  readme: z.string().min(1),
  price_monthly: z.number().min(0).default(0),
});

/** Submit a skill to the marketplace. */
marketplaceRoutes.post("/v1/marketplace/submit", async (c) => {
  const p = c.get("principal")!;
  const parsed = submitSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
  const data = parsed.data;
  const sub = submissionManager.submit({
    orgId: p.org_id,
    submitterId: p.user_id,
    manifest: data.manifest,
    category: data.category,
    tags: data.tags,
    readme: data.readme,
    priceMonthly: data.price_monthly,
  });
  return c.json({ submission_id: sub.id, status: sub.status }, 201);
});

/** List submissions (own org's submissions, or all if admin). */
marketplaceRoutes.get("/v1/marketplace/submissions", (c) => {
  const p = c.get("principal")!;
  const status = c.req.query("status") as import("../marketplace/submission.ts").SubmissionStatus | undefined;
  // Org members see their own submissions; admins see all.
  const subs = p.role === "owner" || p.role === "admin"
    ? submissionManager.list(status)
    : submissionManager.list(status).filter((s) => s.orgId === p.org_id);
  return c.json({ submissions: subs });
});

/** Get a specific submission. */
marketplaceRoutes.get("/v1/marketplace/submissions/:id", (c) => {
  const p = c.get("principal")!;
  const sub = submissionManager.get(c.req.param("id"));
  if (!sub) return c.json({ error: "not_found" }, 404);
  if (sub.orgId !== p.org_id && p.role !== "owner" && p.role !== "admin") {
    return c.json({ error: "forbidden" }, 403);
  }
  return c.json({ submission: sub });
});

/** Start reviewing a submission (admin only). */
marketplaceRoutes.post("/v1/marketplace/submissions/:id/review", async (c) => {
  const p = c.get("principal")!;
  if (p.role !== "owner" && p.role !== "admin") {
    return c.json({ error: "forbidden", reason: "admin only" }, 403);
  }
  const sub = submissionManager.startReview(c.req.param("id"), p.user_id);
  if (!sub) return c.json({ error: "not_found_or_wrong_status" }, 404);
  return c.json({ submission_id: sub.id, status: sub.status });
});

const reviewSchema = z.object({ notes: z.string().default("") });

/** Approve and publish a submission (admin only). */
marketplaceRoutes.post("/v1/marketplace/submissions/:id/approve", async (c) => {
  const p = c.get("principal")!;
  if (p.role !== "owner" && p.role !== "admin") {
    return c.json({ error: "forbidden", reason: "admin only" }, 403);
  }
  const parsed = reviewSchema.safeParse(await c.req.json().catch(() => ({})));
  const sub = submissionManager.approve(c.req.param("id"), p.user_id, parsed.success ? parsed.data.notes : "");
  if (!sub) return c.json({ error: "not_found_or_wrong_status" }, 404);
  return c.json({ submission_id: sub.id, status: sub.status, published_at: sub.publishedAt?.toISOString() });
});

/** Reject a submission (admin only). */
marketplaceRoutes.post("/v1/marketplace/submissions/:id/reject", async (c) => {
  const p = c.get("principal")!;
  if (p.role !== "owner" && p.role !== "admin") {
    return c.json({ error: "forbidden", reason: "admin only" }, 403);
  }
  const parsed = reviewSchema.safeParse(await c.req.json().catch(() => ({})));
  const sub = submissionManager.reject(c.req.param("id"), p.user_id, parsed.success ? parsed.data.notes : "");
  if (!sub) return c.json({ error: "not_found_or_wrong_status" }, 404);
  return c.json({ submission_id: sub.id, status: sub.status, review_notes: sub.reviewNotes });
});

/** List published community skills (open marketplace). */
marketplaceRoutes.get("/v1/marketplace/community", (c) => {
  const published = submissionManager.listPublished().map((s) => ({
    id: s.id,
    name: s.manifest.name,
    version: s.manifest.version,
    description: s.manifest.description,
    author: s.manifest.author,
    category: s.category,
    tags: s.tags,
    price_monthly: s.priceMonthly,
    install_count: s.installCount,
    rating: 0, // TODO: ratings in M4
    permissions: s.manifest.permissions,
  }));
  return c.json({ listings: published, total: published.length });
});

/** Get author revenue stats. */
marketplaceRoutes.get("/v1/marketplace/revenue", (c) => {
  const p = c.get("principal")!;
  const stats = submissionManager.getAuthorStats(p.user_id);
  return c.json({
    ...stats,
    revenue_share_author: 0.7,
    revenue_share_cascade: 0.3,
    note: "Revenue share is 70% author, 30% Cascade. Payouts via Stripe Connect (M4).",
  });
});
