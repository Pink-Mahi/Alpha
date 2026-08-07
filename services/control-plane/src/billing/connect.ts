/**
 * Stripe Connect integration — marketplace payouts to skill authors.
 *
 * Flow:
 * 1. Skill author creates a Connect account (POST /v1/marketplace/connect/onboard)
 * 2. Stripe returns an account link for onboarding (KYC, bank details)
 * 3. Author completes onboarding on Stripe
 * 4. When a paid skill is installed, we create a transfer to the author's
 *    Connect account (70% of the price)
 * 5. ALPHA keeps 30% as platform fee
 *
 * Per ADR-0009: 70% author / 30% ALPHA revenue share.
 */

export interface ConnectConfig {
  secretKey: string;
  clientId: string;
  /** URL to redirect to after onboarding completes. */
  returnUrl: string;
}

export interface ConnectAccount {
  stripeAccountId: string;
  status: "pending" | "active" | "restricted";
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
}

export class ConnectClient {
  private config: ConnectConfig;
  private baseUrl = "https://api.stripe.com";

  constructor(config: ConnectConfig) {
    this.config = config;
  }

  private get authHeader(): string {
    return `Bearer ${this.config.secretKey}`;
  }

  /** Create a Connect Express account for a skill author. */
  async createExpressAccount(email: string): Promise<{ accountId: string }> {
    const params = new URLSearchParams({
      type: "express",
      email,
      "capabilities[transfers][requested]": "true",
      "capabilities[card_payments][requested]": "true",
    });
    const resp = await fetch(`${this.baseUrl}/v1/accounts`, {
      method: "POST",
      headers: { Authorization: this.authHeader },
      body: params,
    });
    if (!resp.ok) throw new Error(`Stripe account creation failed: ${resp.status}`);
    const data = await resp.json() as { id: string };
    return { accountId: data.id };
  }

  /** Create an account link for onboarding (KYC + bank details). */
  async createAccountLink(accountId: string): Promise<{ url: string; expiresAt: Date }> {
    const params = new URLSearchParams({
      account: accountId,
      refresh_url: `${this.config.returnUrl}?status=refresh`,
      return_url: `${this.config.returnUrl}?status=success`,
      type: "account_onboarding",
    });
    const resp = await fetch(`${this.baseUrl}/v1/account_links`, {
      method: "POST",
      headers: { Authorization: this.authHeader },
      body: params,
    });
    if (!resp.ok) throw new Error(`Stripe account link failed: ${resp.status}`);
    const data = await resp.json() as { url: string; expires_at: number };
    return { url: data.url, expiresAt: new Date(data.expires_at * 1000) };
  }

  /** Retrieve account status (payouts enabled, KYC submitted). */
  async getAccountStatus(accountId: string): Promise<ConnectAccount> {
    const resp = await fetch(`${this.baseUrl}/v1/accounts/${accountId}`, {
      headers: { Authorization: this.authHeader },
    });
    if (!resp.ok) throw new Error(`Stripe account lookup failed: ${resp.status}`);
    const data = await resp.json() as {
      id: string;
      payouts_enabled: boolean;
      details_submitted: boolean;
      charges_enabled: boolean;
    };
    return {
      stripeAccountId: data.id,
      status: data.payouts_enabled ? "active" : data.details_submitted ? "pending" : "restricted",
      payoutsEnabled: data.payouts_enabled,
      detailsSubmitted: data.details_submitted,
    };
  }

  /** Transfer funds to a connected account (the 70% author share). */
  async transferToAuthor(
    accountId: string,
    amountUsd: number,
    description: string,
  ): Promise<{ transferId: string; amount: number }> {
    const amountCents = Math.round(amountUsd * 100);
    const params = new URLSearchParams({
      amount: amountCents.toString(),
      currency: "usd",
      destination: accountId,
      description,
    });
    const resp = await fetch(`${this.baseUrl}/v1/transfers`, {
      method: "POST",
      headers: { Authorization: this.authHeader },
      body: params,
    });
    if (!resp.ok) throw new Error(`Stripe transfer failed: ${resp.status}`);
    const data = await resp.json() as { id: string; amount: number };
    return { transferId: data.id, amount: data.amount / 100 };
  }

  /** Calculate the author share (70%) and platform fee (30%). */
  static splitRevenue(totalUsd: number): { authorShare: number; platformFee: number } {
    return {
      authorShare: totalUsd * 0.7,
      platformFee: totalUsd * 0.3,
    };
  }
}
