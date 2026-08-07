/**
 * Messaging integrations — Slack, SMS (Twilio), Email (SMTP/Resend).
 *
 * Each integration is a channel adapter with a unified send() interface.
 * The tray agent uses these to deliver notifications from skills/heartbeats
 * and to receive inbound messages (which can trigger agent tasks).
 *
 * M2: outbound only. Inbound webhooks land in M3.
 */

export interface MessageChannel {
  type: "slack" | "sms" | "email" | "console";
  send(opts: SendMessageOpts): Promise<{ ok: boolean; id?: string; error?: string }>;
}

export interface SendMessageOpts {
  to: string;
  subject?: string;
  body: string;
  /** Optional metadata for tracking. */
  metadata?: Record<string, unknown>;
}

// --- Console (always available, for dev/testing) ---------------------------

export const consoleChannel: MessageChannel = {
  type: "console",
  async send(opts) {
    console.log(`[message:${opts.subject ?? "(no subject)"}] → ${opts.to}\n${opts.body}`);
    return { ok: true, id: `console-${Date.now()}` };
  },
};

// --- Slack ------------------------------------------------------------------

export class SlackChannel implements MessageChannel {
  type = "slack" as const;
  private token: string;
  private defaultChannel: string;

  constructor(token: string, defaultChannel: string) {
    this.token = token;
    this.defaultChannel = defaultChannel;
  }

  async send(opts: SendMessageOpts) {
    if (!this.token || this.token.includes("placeholder")) {
      return { ok: false, error: "Slack token not configured" };
    }
    try {
      const channel = opts.to.startsWith("#") ? opts.to : this.defaultChannel;
      const resp = await fetch("https://slack.com/api/chat.postMessage", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          channel,
          text: opts.subject ? `*${opts.subject}*\n${opts.body}` : opts.body,
        }),
      });
      const data = await resp.json() as { ok: boolean; error?: string; ts?: string };
      if (!data.ok) return { ok: false, error: data.error ?? "slack error" };
      return { ok: true, id: data.ts };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }
}

// --- SMS (Twilio) -----------------------------------------------------------

export class SmsChannel implements MessageChannel {
  type = "sms" as const;
  private accountSid: string;
  private authToken: string;
  private fromNumber: string;

  constructor(accountSid: string, authToken: string, fromNumber: string) {
    this.accountSid = accountSid;
    this.authToken = authToken;
    this.fromNumber = fromNumber;
  }

  async send(opts: SendMessageOpts) {
    if (this.accountSid.includes("placeholder") || !this.authToken) {
      return { ok: false, error: "Twilio not configured" };
    }
    try {
      const url = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`;
      const auth = btoa(`${this.accountSid}:${this.authToken}`);
      const body = new URLSearchParams({
        To: opts.to,
        From: this.fromNumber,
        Body: opts.subject ? `${opts.subject}: ${opts.body}` : opts.body,
      });
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
      });
      if (!resp.ok) {
        const err = await resp.text();
        return { ok: false, error: `twilio ${resp.status}: ${err.slice(0, 200)}` };
      }
      const data = await resp.json() as { sid: string };
      return { ok: true, id: data.sid };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }
}

// --- Email (Resend) ---------------------------------------------------------

export class EmailChannel implements MessageChannel {
  type = "email" as const;
  private apiKey: string;
  private fromEmail: string;

  constructor(apiKey: string, fromEmail: string) {
    this.apiKey = apiKey;
    this.fromEmail = fromEmail;
  }

  async send(opts: SendMessageOpts) {
    if (this.apiKey.includes("placeholder") || !this.apiKey) {
      return { ok: false, error: "Resend not configured" };
    }
    try {
      const resp = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: this.fromEmail,
          to: opts.to,
          subject: opts.subject ?? "Cascade notification",
          text: opts.body,
        }),
      });
      if (!resp.ok) {
        const err = await resp.text();
        return { ok: false, error: `resend ${resp.status}: ${err.slice(0, 200)}` };
      }
      const data = await resp.json() as { id: string };
      return { ok: true, id: data.id };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }
}

// --- Channel registry -------------------------------------------------------

export class MessagingService {
  private channels = new Map<string, MessageChannel>();

  constructor() {
    // Console is always available.
    this.register("console", consoleChannel);
  }

  register(name: string, channel: MessageChannel): void {
    this.channels.set(name, channel);
  }

  get(name: string): MessageChannel | undefined {
    return this.channels.get(name);
  }

  list(): Array<{ name: string; type: string }> {
    return [...this.channels.entries()].map(([name, ch]) => ({ name, type: ch.type }));
  }

  async send(channelName: string, opts: SendMessageOpts): Promise<{ ok: boolean; id?: string; error?: string }> {
    const ch = this.channels.get(channelName);
    if (!ch) return { ok: false, error: `unknown channel: ${channelName}` };
    return ch.send(opts);
  }

  /** Initialize channels from env vars. Gracefully skips unconfigured ones. */
  static fromEnv(): MessagingService {
    const svc = new MessagingService();

    const slackToken = process.env.SLACK_BOT_TOKEN;
    const slackChannel = process.env.SLACK_DEFAULT_CHANNEL ?? "#general";
    if (slackToken && !slackToken.includes("placeholder")) {
      svc.register("slack", new SlackChannel(slackToken, slackChannel));
    }

    const twilioSid = process.env.TWILIO_ACCOUNT_SID;
    const twilioAuth = process.env.TWILIO_AUTH_TOKEN;
    const twilioFrom = process.env.TWILIO_FROM_NUMBER;
    if (twilioSid && twilioAuth && twilioFrom && !twilioSid.includes("placeholder")) {
      svc.register("sms", new SmsChannel(twilioSid, twilioAuth, twilioFrom));
    }

    const resendKey = process.env.RESEND_API_KEY;
    const resendFrom = process.env.RESEND_FROM_EMAIL ?? "agent@cascade.dev";
    if (resendKey && !resendKey.includes("placeholder")) {
      svc.register("email", new EmailChannel(resendKey, resendFrom));
    }

    return svc;
  }
}
