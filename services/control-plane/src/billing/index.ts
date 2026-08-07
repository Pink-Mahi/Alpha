/**
 * Billing — Stripe integration for subscription tiers + usage add-ons.
 *
 * BYO-key-first pricing (ADR-0004): lower list prices, managed keys as upsell.
 * Tiers: Free ($0), Pro ($19/mo), Team ($29/seat/mo).
 *
 * M1: uses Stripe test mode with placeholder keys. Swap STRIPE_SECRET_KEY
 * and STRIPE_WEBHOOK_SECRET to real test keys for end-to-end testing.
 * Production keys come at paid GA.
 *
 * Stripe price IDs are configured via env. If not set, billing routes return
 * a "not_configured" error (so the rest of the app works without Stripe).
 */
import Stripe from "stripe";

const secretKey = process.env.STRIPE_SECRET_KEY ?? "sk_test_placeholder_replace_me";
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? "whsec_placeholder_replace_me";

export const stripe = new Stripe(secretKey, {
  apiVersion: "2024-12-18.acacia" as Stripe.LatestApiVersion,
  typescript: true,
});

export const isStripeConfigured = (): boolean =>
  !secretKey.includes("placeholder") && !webhookSecret.includes("placeholder");

/** Plan definitions. Price IDs are set in Stripe dashboard and configured via env. */
export const PLANS = {
  free: {
    name: "Free",
    price: 0,
    features: ["local IDE agent", "BYO-key only", "1 local agent", "community skills"],
    limits: { cloudAgents: 0, phoneNumbers: 0, managedCredits: 0 },
  },
  pro: {
    name: "Pro",
    price: 19,
    priceIdEnv: "STRIPE_PRO_PRICE_ID",
    features: ["everything in Free", "1 cloud agent", "managed credits ($15 equivalent)", "messaging integrations", "1 phone number + 100 min/mo", "priority queues"],
    limits: { cloudAgents: 1, phoneNumbers: 1, managedCredits: 1500, phoneMinutes: 100 },
  },
  team: {
    name: "Team",
    price: 29,
    priceIdEnv: "STRIPE_TEAM_PRICE_ID",
    features: ["everything in Pro", "shared org memory", "roles & admin", "3 cloud agents/seat", "1 phone number/org + 250 min/seat", "spend caps", "audit logs"],
    limits: { cloudAgentsPerSeat: 3, phoneNumbersPerOrg: 1, phoneMinutesPerSeat: 250 },
  },
} as const;

export type PlanId = keyof typeof PLANS;

export function getPriceId(plan: PlanId): string | null {
  if (plan === "free") return null;
  const envVar = PLANS[plan].priceIdEnv;
  return process.env[envVar] ?? null;
}

/** Verify a Stripe webhook signature and return the event. */
export async function verifyWebhook(payload: string, signature: string): Promise<Stripe.Event> {
  return stripe.webhooks.constructEventAsync(payload, signature, webhookSecret);
}

export { webhookSecret };
