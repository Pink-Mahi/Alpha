/**
 * Model router client — HTTP client for the Python model-router service.
 *
 * Wraps POST /v1/complete and POST /v1/stream with typed responses.
 * Includes retry logic with exponential backoff for transient failures.
 */
export interface RouterCompleteRequest {
  model: string;
  messages: Array<Record<string, unknown>>;
  system?: string;
  tools?: Array<Record<string, unknown>>;
  tool_choice?: string;
  max_tokens?: number;
  temperature?: number;
  api_key?: string;
}

export interface RouterCompleteResponse {
  model: string;
  content: string;
  tool_calls: Array<{
    id?: string;
    name: string;
    args: Record<string, unknown>;
  }>;
  usage: { tokens_in: number; tokens_out: number };
  cost_usd: number;
}

const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 500;
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

export class ModelRouterClient {
  constructor(private readonly baseUrl: string = "http://localhost:8081") {}

  async complete(req: RouterCompleteRequest): Promise<RouterCompleteResponse> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const resp = await fetch(`${this.baseUrl}/v1/complete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(req),
        });

        if (resp.ok) {
          return (await resp.json()) as RouterCompleteResponse;
        }

        // Non-retryable error (4xx except 429)
        if (!RETRYABLE_STATUS.has(resp.status)) {
          const text = await resp.text();
          throw new Error(`model router error ${resp.status}: ${text.slice(0, 500)}`);
        }

        // Retryable error — check for Retry-After header
        const retryAfter = resp.headers.get("retry-after");
        const waitMs = retryAfter
          ? parseInt(retryAfter, 10) * 1000
          : INITIAL_BACKOFF_MS * Math.pow(2, attempt);

        lastError = new Error(`model router ${resp.status} (attempt ${attempt + 1})`);
        console.warn(`[model-router-client] ${resp.status}, retrying in ${waitMs}ms (attempt ${attempt + 1}/${MAX_RETRIES + 1})`);

        if (attempt < MAX_RETRIES) {
          await Bun.sleep(waitMs);
        }
      } catch (e) {
        // Network error — retryable
        lastError = e as Error;
        const waitMs = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
        console.warn(`[model-router-client] network error: ${lastError.message}, retrying in ${waitMs}ms (attempt ${attempt + 1}/${MAX_RETRIES + 1})`);

        if (attempt < MAX_RETRIES) {
          await Bun.sleep(waitMs);
        }
      }
    }

    throw lastError ?? new Error("model router: max retries exceeded");
  }

  async *stream(req: RouterCompleteRequest): AsyncGenerator<{ type: string; text?: string; cost_usd?: number }> {
    const resp = await fetch(`${this.baseUrl}/v1/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
    if (!resp.ok || !resp.body) {
      throw new Error(`model router stream error ${resp.status}`);
    }
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (line.startsWith("data: ")) {
          try {
            yield JSON.parse(line.slice(6));
          } catch {
            // Skip malformed lines.
          }
        }
      }
    }
  }
}
