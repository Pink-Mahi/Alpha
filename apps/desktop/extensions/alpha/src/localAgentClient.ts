/** Local agent runtime client — HTTP client for the local-agent service. */
import * as vscode from "vscode";

export interface AgentStartRequest {
  spec: string;
  cwd: string;
  model?: string;
  budget_usd?: number;
  max_iterations?: number;
  api_key?: string;
  tool_allowlist?: string[];
}

export interface AgentStartResponse {
  task_id: string;
  run_id: string;
  status: string;
}

export interface AgentEvent {
  version: string;
  org_id: string;
  run_id: string;
  task_id: string;
  seq: number;
  ts: string;
  type: string;
  payload: Record<string, unknown>;
}

export interface AgentStatus {
  id: string;
  status: "running" | "complete" | "failed" | "killed";
  events: AgentEvent[];
  result?: {
    summary: string;
    costUsd: number;
    iterations: number;
    success: boolean;
  };
}

export class LocalAgentClient {
  private baseUrl: string;

  constructor() {
    this.baseUrl = vscode.workspace.getConfiguration("ALPHA").get<string>("agentRuntimeUrl") ?? "http://localhost:8083";
  }

  async startTask(req: AgentStartRequest): Promise<AgentStartResponse | null> {
    try {
      const resp = await fetch(`${this.baseUrl}/v1/agent/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
      if (!resp.ok) {
        vscode.window.showErrorMessage(`ALPHA agent: ${resp.status} ${await resp.text()}`);
        return null;
      }
      return (await resp.json()) as AgentStartResponse;
    } catch (e) {
      vscode.window.showErrorMessage(`ALPHA agent: cannot connect to runtime — ${String(e).slice(0, 200)}`);
      return null;
    }
  }

  async getStatus(taskId: string): Promise<AgentStatus | null> {
    try {
      const resp = await fetch(`${this.baseUrl}/v1/agent/${taskId}`);
      if (!resp.ok) return null;
      return (await resp.json()) as AgentStatus;
    } catch {
      return null;
    }
  }

  async killTask(taskId: string): Promise<boolean> {
    try {
      const resp = await fetch(`${this.baseUrl}/v1/agent/${taskId}/kill`, { method: "POST" });
      return resp.ok;
    } catch {
      return false;
    }
  }
}
