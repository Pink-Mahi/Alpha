/** Billing routes — subscription management, checkout, webhook handler. */
import { Hono } from "hono";
import { z } from "zod";
import { eq } from "drizzle-orm";

import { org } from "../db/schema.ts";
import { getDb } from "../db/client.ts";
import { authMiddleware } from "../auth/middleware.ts";
import type { AuthPrincipal } from "../auth/index.ts";
import { PLANS, getPriceId, isStripeConfigured, stripe, verifyWebhook, type PlanId } from "../billing/index.ts";

export const billingRoutes = new Hono<{ Variables: { principal: AuthPrincipal } }>();

billingRoutes.use("*", authMiddleware());

/** List available plans. */
billingRoutes.get("/v1/billing/plans", (c) => {
  const plans = Object.entries(PLANS).map(([id, p]) => ({
    id,
    name: p.name,
    price: p.price,
    features: p.features,
    limits: p.limits,
  }));
  return c.json({ plans, stripe_configured: isStripeConfigured() });
});

/** Get the current org's billing status. */
billingRoutes.get("/v1/billing/status", async (c) => {
  const p = c.get("principal")!;
  const db = getDb();
  const rows = await db.select().from(org).where(eq(org.id, p.org_id)).limit(1);
  if (rows.length === 0) return c.json({ error: "org_not_found" }, 404);
  const o = rows[0]!;
  return c.json({
    plan: o.plan,
    billing_id: o.billing_id,
    spend_cap_usd: o.spend_cap_usd,
    stripe_configured: isStripeConfigured(),
  });
});

const checkoutSchema = z.object({
  plan: z.enum(["pro", "team"]),
});

/** Create a Stripe Checkout session for upgrading to a paid plan. */
billingRoutes.post("/v1/billing/checkout", async (c) => {
  const p = c.get("principal")!;
  if (p.role !== "owner" && p.role !== "billing") {
    return c.json({ error: "forbidden", reason: "only owner/billing can upgrade" }, 403);
  }
  if (!isStripeConfigured()) {
    return c.json({ error: "not_configured", reason: "Stripe keys not set. Set STRIPE_SECRET_KEY and price IDs." }, 503);
  }
  const parsed = checkoutSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);

  const planId = parsed.data.plan as PlanId;
  const priceId = getPriceId(planId);
  if (!priceId) {
    const envVar = planId === "free" ? null : PLANS[planId].priceIdEnv;
    return c.json({ error: "price_not_configured", reason: envVar ? `Set ${envVar} env var` : "free plan has no price" }, 503);
  }

  const db = getDb();
  const rows = await db.select().from(org).where(eq(org.id, p.org_id)).limit(1);
  const o = rows[0]!;
  let customerId = o.billing_id ?? undefined;

  // Create or reuse Stripe customer.
  if (!customerId) {
    const customer = await stripe.customers.create({
      metadata: { org_id: p.org_id },
    });
    customerId = customer.id;
    await db.update(org).set({ billing_id: customerId }).where(eq(org.id, p.org_id));
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${process.env.WEB_URL ?? "http://localhost:3000"}/billing?status=success`,
    cancel_url: `${process.env.WEB_URL ?? "http://localhost:3000"}/billing?status=cancelled`,
    metadata: { org_id: p.org_id, plan: planId },
  });

  return c.json({ url: session.url, session_id: session.id });
});

/** Stripe webhook — handles subscription events. Raw body required. */
billingRoutes.post("/v1/billing/webhook", async (c) => {
  if (!isStripeConfigured()) {
    return c.json({ error: "not_configured" }, 503);
  }
  const signature = c.req.header("stripe-signature");
  if (!signature) return c.json({ error: "missing_signature" }, 400);

  // Hono doesn't expose raw body easily; read it as text.
  const rawBody = await c.req.text();
  let event;
  try {
    event = await verifyWebhook(rawBody, signature);
  } catch (e) {
    return c.json({ error: "invalid_signature", detail: String(e) }, 400);
  }

  const db = getDb();
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as { metadata?: { org_id?: string; plan?: string } };
      const orgId = session.metadata?.org_id;
      const plan = session.metadata?.plan as PlanId | undefined;
      if (orgId && plan) {
        await db.update(org).set({ plan }).where(eq(org.id, orgId));
        console.log(`[billing] org ${orgId} upgraded to ${plan}`);
      }
      break;
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object as { customer: string };
      // Downgrade to free when subscription ends.
      const rows = await db.select().from(org).where(eq(org.billing_id, sub.customer)).limit(1);
      if (rows.length > 0) {
        await db.update(org).set({ plan: "free" }).where(eq(org.id, rows[0]!.id));
        console.log(`[billing] org ${rows[0]!.id} downgraded to free (subscription deleted)`);
      }
      break;
    }
    default:
      // Unhandled event type; acknowledge and log.
      console.log(`[billing] unhandled event: ${event.type}`);
  }

  return c.json({ received: true });
});
