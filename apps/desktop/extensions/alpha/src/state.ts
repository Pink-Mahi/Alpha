/** Persistent extension state (secrets + global state + context keys). */
import * as vscode from "vscode";

const TOKEN_KEY = "ALPHA.token";

export class State {
  constructor(private readonly ctx: vscode.ExtensionContext) {}

  get token(): string {
    // secrets.get is async (Thenable); we cache the token on first access.
    return this._cachedToken ?? "";
  }
  private _cachedToken: string | undefined;

  async setToken(token: string): Promise<void> {
    this._cachedToken = token;
    if (token) {
      await this.ctx.secrets.store(TOKEN_KEY, token);
    } else {
      await this.ctx.secrets.delete(TOKEN_KEY);
    }
  }

  /** Load the token from secret storage into the cache. Call on activate. */
  async loadToken(): Promise<void> {
    this._cachedToken = (await this.ctx.secrets.get(TOKEN_KEY)) ?? "";
  }

  get signedIn(): boolean {
    return this.ctx.globalState.get<boolean>("ALPHA.signedIn") ?? false;
  }

  async setSignedIn(v: boolean): Promise<void> {
    await this.ctx.globalState.update("ALPHA.signedIn", v);
    await vscode.commands.executeCommand("setContext", "ALPHA.signedIn", v);
  }

  get currentTaskId(): string | undefined {
    return this.ctx.workspaceState.get<string>("ALPHA.currentTaskId");
  }

  async setCurrentTaskId(id: string | undefined): Promise<void> {
    await this.ctx.workspaceState.update("ALPHA.currentTaskId", id);
    await vscode.commands.executeCommand("setContext", "ALPHA.agentRunning", !!id);
  }

  get serverUrl(): string {
    return vscode.workspace.getConfiguration("ALPHA").get<string>("serverUrl") ?? "http://localhost:8080";
  }
}
