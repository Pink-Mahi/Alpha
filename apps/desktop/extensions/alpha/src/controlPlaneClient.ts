/** Control plane client — typed REST calls to the ALPHA control plane. */
import * as vscode from "vscode";
import type { State } from "./state";

export interface MeResponse {
  principal: { kind: string; user_id: string; org_id: string; role: string };
}

export interface TaskResponse {
  task: {
    id: string;
    title: string;
    spec: string;
    status: string;
    budget_usd: string;
    runtime_pref: "local" | "cloud";
  };
}

export class ControlPlaneClient {
  constructor(private readonly state: State) {}

  private async request<T>(path: string, init: RequestInit = {}): Promise<T | null> {
    const url = `${this.state.serverUrl}${path}`;
    const token = this.state.token;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(init.headers as Record<string, string> | undefined),
    };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    try {
      const resp = await fetch(url, { ...init, headers });
      if (!resp.ok) {
        const body = await resp.text();
        vscode.window.showErrorMessage(`ALPHA: ${resp.status} ${body.slice(0, 200)}`);
        return null;
      }
      return (await resp.json()) as T;
    } catch (e) {
      vscode.window.showErrorMessage(`ALPHA: request failed — ${String(e).slice(0, 200)}`);
      return null;
    }
  }

  async getMe(): Promise<{ email: string; org_id: string } | null> {
    // The /v1/me endpoint returns a principal; we adapt it.
    const r = await this.request<MeResponse>("/v1/me");
    if (!r) return null;
    return { email: r.principal.user_id, org_id: r.principal.org_id };
  }

  async createTask(spec: string): Promise<TaskResponse | null> {
    const budget = vscode.workspace.getConfiguration("ALPHA").get<number>("budgetUSD") ?? 2.0;
    const runtime = vscode.workspace.getConfiguration("ALPHA").get<"local" | "cloud">("defaultRuntime") ?? "local";
    const r = await this.request<TaskResponse>("/v1/tasks", {
      method: "POST",
      body: JSON.stringify({ title: spec.slice(0, 80), spec, budget_usd: budget, runtime_pref: runtime }),
    });
    if (r) {
      await this.state.setCurrentTaskId(r.task.id);
      vscode.window.showInformationMessage(`ALPHA: task created (${r.task.id.slice(0, 8)})`);
    }
    return r;
  }

  async pauseCurrentTask(): Promise<void> {
    const id = this.state.currentTaskId;
    if (!id) return;
    await this.request(`/v1/tasks/${id}/pause`, { method: "POST" });
    await this.state.setCurrentTaskId(undefined);
  }

  async killCurrentTask(): Promise<void> {
    const id = this.state.currentTaskId;
    if (!id) return;
    await this.request(`/v1/tasks/${id}/kill`, { method: "POST" });
    await this.state.setCurrentTaskId(undefined);
  }
}
