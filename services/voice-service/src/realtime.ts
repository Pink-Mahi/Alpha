/**
 * OpenAI Realtime API integration — real-time voice conversation.
 *
 * Connects to OpenAI's Realtime API via WebSocket. Receives audio from
 * Twilio Media Stream (mulaw 8000Hz) and forwards to OpenAI. Receives
 * audio responses from OpenAI and forwards back to Twilio.
 *
 * The Realtime API handles:
 * - Speech-to-text (transcription)
 * - LLM reasoning (with the system prompt + context)
 * - Text-to-speech (audio response)
 *
 * We handle:
 * - Bridging Twilio Media Stream ↔ OpenAI Realtime API
 * - System prompt configuration (the agent's persona + knowledge)
 * - Conversation state (transcript accumulation)
 * - Call summary generation on completion
 */

export interface RealtimeConfig {
  apiKey: string;
  model: string; // e.g. "gpt-4o-realtime-preview-2024-12-17"
  voice: string; // e.g. "alloy", "echo", "fable", "onyx", "nova", "shimmer"
  /** System prompt for the voice agent. */
  systemPrompt: string;
  /** Tools the voice agent can call (e.g. look up info, schedule tasks). */
  tools?: Array<{
    type: "function";
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  }>;
}

export interface ConversationState {
  callSid: string;
  transcript: Array<{ role: "user" | "assistant"; text: string; timestamp: string }>;
  startedAt: Date;
  endedAt?: Date;
}

/**
 * Manages a single voice conversation session.
 * In production, each call gets its own RealtimeSession bridging Twilio ↔ OpenAI.
 */
export class RealtimeSession {
  private openaiWs?: WebSocket;
  private state: ConversationState;
  private config: RealtimeConfig;

  constructor(config: RealtimeConfig, callSid: string) {
    this.config = config;
    this.state = {
      callSid,
      transcript: [],
      startedAt: new Date(),
    };
  }

  /** Connect to OpenAI Realtime API. */
  async connect(): Promise<void> {
    const url = `wss://api.openai.com/v1/realtime?model=${this.config.model}`;
    // Bun's WebSocket supports headers via the second argument's headers property.
    this.openaiWs = new WebSocket(url, {
      protocol: "realtime",
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        "OpenAI-Beta": "realtime=v1",
      },
    } as unknown as string[]);

    await new Promise<void>((resolve, reject) => {
      this.openaiWs!.addEventListener("open", () => {
        // Send session configuration
        this.openaiWs!.send(JSON.stringify({
          type: "session.update",
          session: {
            voice: this.config.voice,
            instructions: this.config.systemPrompt,
            tools: this.config.tools ?? [],
            input_audio_format: "pcm16",
            output_audio_format: "pcm16",
            turn_detection: { type: "server_vad", threshold: 0.5, prefix_padding_ms: 300, silence_duration_ms: 200 },
          },
        }));
        resolve();
      });
      this.openaiWs!.addEventListener("error", (e) => reject(e));
    });
  }

  /** Send audio from Twilio to OpenAI. Audio is mulaw 8000Hz from Twilio,
   *  needs conversion to pcm16 24000Hz for OpenAI. */
  sendAudio(audioBase64: string): void {
    if (!this.openaiWs || this.openaiWs.readyState !== WebSocket.OPEN) return;
    // TODO: mulaw → pcm16 conversion. For M3 skeleton, forward as-is.
    this.openaiWs.send(JSON.stringify({
      type: "input_audio_buffer.append",
      audio: audioBase64,
    }));
  }

  /** Handle a message from OpenAI. Returns audio to send to Twilio + transcript updates. */
  onMessage(handler: (msg: RealtimeMessage) => void): void {
    if (!this.openaiWs) return;
    this.openaiWs.addEventListener("message", (event) => {
      try {
        const data = JSON.parse(event.data as string) as OpenAIRealtimeEvent;
        const msg = this.translateEvent(data);
        if (msg) handler(msg);
      } catch {
        // Skip malformed messages
      }
    });
  }

  private translateEvent(data: OpenAIRealtimeEvent): RealtimeMessage | null {
    switch (data.type) {
      case "conversation.item.created":
        if (data.item?.role && data.item?.content?.[0]?.text) {
          this.state.transcript.push({
            role: data.item.role as "user" | "assistant",
            text: data.item.content[0].text,
            timestamp: new Date().toISOString(),
          });
        }
        return { type: "transcript", text: data.item?.content?.[0]?.text ?? "" };
      case "response.audio.delta":
        return { type: "audio", audioBase64: data.delta ?? "" };
      case "response.audio.done":
        return { type: "audio_end" };
      case "response.done":
        return { type: "response_done" };
      case "input_audio_buffer.speech_started":
        return { type: "user_speech_started" };
      case "input_audio_buffer.speech_stopped":
        return { type: "user_speech_stopped" };
      case "error":
        return { type: "error", error: data.error?.message ?? "unknown" };
      default:
        return null;
    }
  }

  /** End the conversation and get the transcript. */
  async disconnect(): Promise<ConversationState> {
    this.state.endedAt = new Date();
    if (this.openaiWs) {
      this.openaiWs.close();
      this.openaiWs = undefined;
    }
    return this.state;
  }

  getTranscript(): ConversationState["transcript"] {
    return this.state.transcript;
  }
}

export interface RealtimeMessage {
  type: "audio" | "audio_end" | "transcript" | "response_done" | "user_speech_started" | "user_speech_stopped" | "error";
  audioBase64?: string;
  text?: string;
  error?: string;
}

interface OpenAIRealtimeEvent {
  type: string;
  delta?: string;
  item?: {
    role?: string;
    content?: Array<{ text?: string }>;
  };
  error?: { message: string };
}

/** Default system prompt for the ALPHA voice agent. */
export const DEFAULT_VOICE_PROMPT = `You are ALPHA, a personal AI assistant answering a phone call. You are helpful, concise, and professional. You can:
- Answer questions about the user's projects, tasks, and schedule
- Take messages and forward them via SMS or email
- Schedule reminders
- Start coding tasks on the user's behalf
- Look up information

Keep responses brief and conversational. If you're unsure about something, say so. If the caller needs something you can't do, offer to take a message.`;
