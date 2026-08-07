/**
 * Twilio phone integration — inbound/outbound calls via Twilio.
 *
 * Flow:
 * 1. User gets a Cascade phone number (provisioned via Twilio)
 * 2. Caller dials the number → Twilio webhook → our /v1/voice/inbound
 * 3. We connect the call to OpenAI Realtime API via Twilio Media Streams (WSS)
 * 4. Realtime API handles conversation (speech-to-text → LLM → text-to-speech)
 * 5. Call ends → we store the transcript + summary in memory
 *
 * US/CA only (ADR-0005). Number provisioning via Twilio AvailablePhoneNumbers API.
 */

export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  /** The Twilio phone number purchased for Cascade (E.164 format). */
  cascadeNumber: string;
  /** The URL Twilio should hit for voice webhooks (our public URL). */
  webhookBaseUrl: string;
}

export interface InboundCall {
  callSid: string;
  from: string;
  to: string;
  direction: "inbound";
  status: "ringing" | "in-progress" | "completed" | "failed";
  startTime: Date;
  endTime?: Date;
  duration?: number;
  transcript?: string;
  summary?: string;
}

export class TwilioClient {
  private config: TwilioConfig;
  private baseUrl = "https://api.twilio.com";

  constructor(config: TwilioConfig) {
    this.config = config;
  }

  private get authHeader(): string {
    return `Basic ${btoa(`${this.config.accountSid}:${this.config.authToken}`)}`;
  }

  /** Generate TwiML to connect the inbound call to a Media Stream (WSS). */
  generateConnectTwiml(streamUrl: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna-Neural">Hi, this is Cascade. How can I help you?</Say>
  <Connect>
    <Stream url="${streamUrl}" />
  </Connect>
</Response>`;
  }

  /** Generate TwiML for an outbound call. */
  generateOutboundTwiml(streamUrl: string, message: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna-Neural">${escapeXml(message)}</Say>
  <Connect>
    <Stream url="${streamUrl}" />
  </Connect>
</Response>`;
  }

  /** Provision a phone number (US/CA only per ADR-0005). */
  async provisionNumber(areaCode: number, countryCode: "US" | "CA" = "US"): Promise<{ phoneNumber: string; sid: string }> {
    const params = new URLSearchParams({
      AreaCode: areaCode.toString(),
      VoiceUrl: `${this.config.webhookBaseUrl}/v1/voice/inbound`,
      VoiceMethod: "POST",
    });

    const resp = await fetch(
      `${this.baseUrl}/2010-04-01/Accounts/${this.config.accountSid}/AvailablePhoneNumbers/${countryCode}/Local.json`,
      {
        method: "POST",
        headers: { Authorization: this.authHeader },
        body: params,
      },
    );
    if (!resp.ok) throw new Error(`Twilio search failed: ${resp.status}`);
    const data = await resp.json() as { uri: string; available_phone_numbers: Array<{ phone_number: string }> };
    const number = data.available_phone_numbers[0];
    if (!number) throw new Error("No available numbers in that area code");

    // Purchase the number
    const purchaseParams = new URLSearchParams({
      PhoneNumber: number.phone_number,
      VoiceUrl: `${this.config.webhookBaseUrl}/v1/voice/inbound`,
      VoiceMethod: "POST",
    });
    const purchaseResp = await fetch(
      `${this.baseUrl}/2010-04-01/Accounts/${this.config.accountSid}/IncomingPhoneNumbers.json`,
      {
        method: "POST",
        headers: { Authorization: this.authHeader },
        body: purchaseParams,
      },
    );
    if (!purchaseResp.ok) throw new Error(`Twilio purchase failed: ${purchaseResp.status}`);
    const purchased = await purchaseResp.json() as { sid: string; phone_number: string };
    return { phoneNumber: purchased.phone_number, sid: purchased.sid };
  }

  /** Make an outbound call. */
  async makeCall(to: string, twimlUrl: string): Promise<{ callSid: string }> {
    const params = new URLSearchParams({
      To: to,
      From: this.config.cascadeNumber,
      Url: twimlUrl,
    });
    const resp = await fetch(
      `${this.baseUrl}/2010-04-01/Accounts/${this.config.accountSid}/Calls.json`,
      {
        method: "POST",
        headers: { Authorization: this.authHeader },
        body: params,
      },
    );
    if (!resp.ok) throw new Error(`Twilio call failed: ${resp.status}`);
    const data = await resp.json() as { sid: string };
    return { callSid: data.sid };
  }

  /** Send an SMS (for SMS-based interactions). */
  async sendSms(to: string, body: string): Promise<{ messageSid: string }> {
    const params = new URLSearchParams({
      To: to,
      From: this.config.cascadeNumber,
      Body: body,
    });
    const resp = await fetch(
      `${this.baseUrl}/2010-04-01/Accounts/${this.config.accountSid}/Messages.json`,
      {
        method: "POST",
        headers: { Authorization: this.authHeader },
        body: params,
      },
    );
    if (!resp.ok) throw new Error(`Twilio SMS failed: ${resp.status}`);
    const data = await resp.json() as { sid: string };
    return { messageSid: data.sid };
  }
}

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case "<": return "&lt;";
      case ">": return "&gt;";
      case "&": return "&amp;";
      case "'": return "&apos;";
      case '"': return "&quot;";
      default: return c;
    }
  });
}
