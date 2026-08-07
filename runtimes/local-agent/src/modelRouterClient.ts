/**
 * Model router client — HTTP client for the Python model-router service.
 *
 * Wraps POST /v1/complete and POST /v1/stream with typed responses.
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

export class ModelRouterClient {
  constructor(private readonly baseUrl: string = "http://localhost:8081") {}

  async complete(req: RouterCompleteRequest): Promise<RouterCompleteResponse> {
    const resp = await fetch(`${this.baseUrl}/v1/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`model router error ${resp.status}: ${text.slice(0, 500)}`);
    }
    return (await resp.json()) as RouterCompleteResponse;
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
