/**
 * Voice service — phone answering with AI.
 *
 * HTTP endpoints for Twilio webhooks + WebSocket bridge for Twilio Media
 * Stream ↔ OpenAI Realtime API.
 *
 * Port 8089.
 *
 * Per ADR-0005: US/CA phone numbers only.
 * Per ADR-0007: managed realtime voice (OpenAI) now, self-host later.
 */
import { Hono } from "hono";
import { logger } from "hono/logger";
import { z } from "zod";
import { randomUUID } from "node:crypto";

import { TwilioClient, type TwilioConfig, type InboundCall } from "./twilio.js";
import { RealtimeSession, DEFAULT_VOICE_PROMPT } from "./realtime.js";

const app = new Hono();
app.use("*", logger());

// --- Configuration ---------------------------------------------------------

const twilioConfig: TwilioConfig = {
  accountSid: process.env.TWILIO_ACCOUNT_SID ?? "AC_placeholder",
  authToken: process.env.TWILIO_AUTH_TOKEN ?? "placeholder",
  ALPHANumber: process.env.TWILIO_ALPHA_NUMBER ?? "+10000000000",
  webhookBaseUrl: process.env.VOICE_WEBHOOK_URL ?? "http://localhost:8089",
};

const twilio = new TwilioClient(twilioConfig);
const isConfigured = !twilioConfig.accountSid.includes("placeholder") && !twilioConfig.authToken.includes("placeholder");

const openaiApiKey = process.env.OPENAI_API_KEY ?? "";
const realtimeModel = process.env.OPENAI_REALTIME_MODEL ?? "gpt-4o-realtime-preview-2024-12-17";
const realtimeVoice = process.env.OPENAI_REALTIME_VOICE ?? "alloy";

// --- Call registry ---------------------------------------------------------

const activeCalls = new Map<string, { call: InboundCall; session: RealtimeSession }>();
const completedCalls: InboundCall[] = [];

// --- Routes -----------------------------------------------------------------

app.get("/healthz", (c) =>
  c.json({
    ok: true,
    twilio_configured: isConfigured,
    realtime_configured: !!openaiApiKey,
    active_calls: activeCalls.size,
    completed_calls: completedCalls.length,
  }),
);

/** Twilio inbound call webhook. Returns TwiML to connect to Media Stream. */
app.post("/v1/voice/inbound", async (c) => {
  const formData = await c.req.formData();
  const callSid = formData.get("CallSid") as string;
  const from = formData.get("From") as string;
  const to = formData.get("To") as string;

  console.log(`[voice] inbound call ${callSid} from ${from} to ${to}`);

  // Create call record
  const call: InboundCall = {
    callSid,
    from,
    to,
    direction: "inbound",
    status: "in-progress",
    startTime: new Date(),
  };

  // Create Realtime session (will connect when the WebSocket opens)
  const session = new RealtimeSession(
    {
      apiKey: openaiApiKey,
      model: realtimeModel,
      voice: realtimeVoice,
      systemPrompt: DEFAULT_VOICE_PROMPT,
    },
    callSid,
  );

  activeCalls.set(callSid, { call, session });

  // Return TwiML that connects the call to our WebSocket
  const streamUrl = `${twilioConfig.webhookBaseUrl.replace("http://", "ws://").replace("https://", "wss://")}/v1/voice/stream/${callSid}`;
  const twiml = twilio.generateConnectTwiml(streamUrl);
  return c.text(twiml, 200, { "Content-Type": "text/xml" });
});

/** Twilio call status webhook. */
app.post("/v1/voice/status", async (c) => {
  const formData = await c.req.formData();
  const callSid = formData.get("CallSid") as string;
  const status = formData.get("CallStatus") as string;
  const duration = parseInt(formData.get("CallDuration") as string ?? "0", 10);

  console.log(`[voice] call ${callSid} status: ${status} duration: ${duration}s`);

  const active = activeCalls.get(callSid);
  if (active && (status === "completed" || status === "failed")) {
    active.call.status = status;
    active.call.endTime = new Date();
    active.call.duration = duration;
    active.call.transcript = active.session.getTranscript()
      .map((t) => `${t.role}: ${t.text}`)
      .join("\n");

    // Disconnect the Realtime session
    await active.session.disconnect();
    completedCalls.push(active.call);
    activeCalls.delete(callSid);
  }

  return c.text("", 200);
});

/** Provision a phone number (US/CA only). */
app.post("/v1/voice/provision", async (c) => {
  if (!isConfigured) return c.json({ error: "twilio_not_configured" }, 503);
  const body = await c.req.json().catch(() => ({})) as { area_code?: number; country?: "US" | "CA" };
  const areaCode = body.area_code ?? 415;
  const country = body.country ?? "US";
  try {
    const result = await twilio.provisionNumber(areaCode, country);
    return c.json({ phone_number: result.phoneNumber, sid: result.sid }, 201);
  } catch (e) {
    return c.json({ error: "provision_failed", detail: String(e) }, 502);
  }
});

/** Make an outbound call. */
app.post("/v1/voice/outbound", async (c) => {
  if (!isConfigured) return c.json({ error: "twilio_not_configured" }, 503);
  const body = await c.req.json().catch(() => ({})) as { to: string; message?: string };
  if (!body.to) return c.json({ error: "to_required" }, 400);
  try {
    // Generate TwiML URL for the outbound call
    const twimlUrl = `${twilioConfig.webhookBaseUrl}/v1/voice/outbound-twiml?message=${encodeURIComponent(body.message ?? "Hello, this is ALPHA calling.")}`;
    const result = await twilio.makeCall(body.to, twimlUrl);
    return c.json({ call_sid: result.callSid }, 201);
  } catch (e) {
    return c.json({ error: "call_failed", detail: String(e) }, 502);
  }
});

/** TwiML for outbound calls. */
app.get("/v1/voice/outbound-twiml", (c) => {
  const message = c.req.query("message") ?? "Hello, this is ALPHA calling.";
  const streamUrl = `${twilioConfig.webhookBaseUrl.replace("http://", "ws://").replace("https://", "wss://")}/v1/voice/stream/outbound-${randomUUID()}`;
  const twiml = twilio.generateOutboundTwiml(streamUrl, message);
  return c.text(twiml, 200, { "Content-Type": "text/xml" });
});

/** Send an SMS. */
app.post("/v1/voice/sms", async (c) => {
  if (!isConfigured) return c.json({ error: "twilio_not_configured" }, 503);
  const body = await c.req.json().catch(() => ({})) as { to: string; body: string };
  if (!body.to || !body.body) return c.json({ error: "to_and_body_required" }, 400);
  try {
    const result = await twilio.sendSms(body.to, body.body);
    return c.json({ message_sid: result.messageSid }, 201);
  } catch (e) {
    return c.json({ error: "sms_failed", detail: String(e) }, 502);
  }
});

/** List calls (active + completed). */
app.get("/v1/voice/calls", (c) => {
  return c.json({
    active: [...activeCalls.values()].map((a) => ({
      call_sid: a.call.callSid,
      from: a.call.from,
      status: a.call.status,
      started_at: a.call.startTime.toISOString(),
    })),
    completed: completedCalls.map((c) => ({
      call_sid: c.callSid,
      from: c.from,
      status: c.status,
      duration: c.duration,
      transcript: c.transcript?.slice(0, 500),
    })),
  });
});

// --- WebSocket handler for Twilio Media Stream -----------------------------
// This is handled by Bun.serve's websocket option (see below).

const port = Number(process.env.PORT ?? 8089);

if (import.meta.main) {
  const server = Bun.serve({
    port,
    fetch: app.fetch,
    websocket: {
      open(ws) {
        console.log("[voice] WebSocket connected (Twilio Media Stream)");
      },
      message(ws, message) {
        // Twilio Media Stream sends JSON messages with audio
        try {
          const data = JSON.parse(message.toString()) as { event: string; media?: { payload: string } };
          if (data.event === "media" && data.media?.payload) {
            // Forward audio to the active Realtime session
            // (In production, we'd look up the session by callSid from the URL path)
            console.log(`[voice] received audio chunk (${data.media.payload.length} bytes base64)`);
          }
        } catch {
          // Skip non-JSON messages
        }
      },
      close(ws) {
        console.log("[voice] WebSocket closed");
      },
    },
  });
  console.log(`[voice-service] listening on http://localhost:${server.port}`);
  console.log(`[voice-service] twilio_configured=${isConfigured} realtime_configured=${!!openaiApiKey}`);
}

export { app };
