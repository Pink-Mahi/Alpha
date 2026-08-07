/**
 * Cascade Agent — VS Code extension entrypoint.
 *
 * Registers the Cascade activity bar view container with a webview-based
 * Command Center, plus commands for new task / pause / kill / sign in.
 *
 * M1 scope: UI shell + control plane client + task creation. Agent execution
 * loop (plan → edit → verify) lands next.
 */
import * as vscode from "vscode";

import { CommandCenterProvider } from "./commandCenter";
import { ControlPlaneClient } from "./controlPlaneClient";
import { LocalAgentClient } from "./localAgentClient";
import { State } from "./state";

export async function activate(ctx: vscode.ExtensionContext): Promise<void> {
  const state = new State(ctx);
  await state.loadToken();
  const client = new ControlPlaneClient(state);
  const agentClient = new LocalAgentClient();

  // Register the webview provider for the Command Center panel.
  const provider = new CommandCenterProvider(ctx.extensionUri, state, client, agentClient);
  ctx.subscriptions.push(
    vscode.window.registerWebviewViewProvider("cascade.commandCenter", provider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
  );

  // Commands
  ctx.subscriptions.push(
    vscode.commands.registerCommand("cascade.openCommandCenter", () => {
      vscode.commands.executeCommand("cascade.commandCenter.focus");
    }),
    vscode.commands.registerCommand("cascade.newTask", async () => {
      if (!state.signedIn) {
        const action = await vscode.window.showInformationMessage(
          "Sign in to Cascade to create a task.",
          "Sign In",
        );
        if (action === "Sign In") {
          await vscode.commands.executeCommand("cascade.signIn");
        }
        return;
      }
      const spec = await vscode.window.showInputBox({
        prompt: "Describe the coding task for the agent",
        placeHolder: "e.g. Refactor auth.ts to use passkeys",
      });
      if (!spec) return;
      // Start the task on the local agent runtime.
      const workspaceFolders = vscode.workspace.workspaceFolders;
      const cwd = workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();
      const model = vscode.workspace.getConfiguration("cascade").get<string>("defaultModel") ?? "anthropic:claude-3-5-sonnet-latest";
      const budget = vscode.workspace.getConfiguration("cascade").get<number>("budgetUSD") ?? 2.0;
      const result = await agentClient.startTask({ spec, cwd, model, budget_usd: budget });
      if (result) {
        await state.setCurrentTaskId(result.task_id);
        provider.refresh();
        // Start polling for events.
        provider.startPolling(result.task_id);
      }
    }),
    vscode.commands.registerCommand("cascade.pauseAgent", () => {
      provider.stopPolling();
      return client.pauseCurrentTask();
    }),
    vscode.commands.registerCommand("cascade.killAgent", async () => {
      const id = state.currentTaskId;
      if (id) await agentClient.killTask(id);
      provider.stopPolling();
      await state.setCurrentTaskId(undefined);
      provider.refresh();
    }),
    vscode.commands.registerCommand("cascade.signIn", async () => {
      const token = await vscode.window.showInputBox({
        prompt: "Paste your Cascade API token",
        password: true,
        placeHolder: "Bearer token (from cascade.dev or /v1/auth/login)",
      });
      if (!token) return;
      state.setToken(token);
      const me = await client.getMe();
      if (me) {
        state.setSignedIn(true);
        vscode.window.showInformationMessage(`Cascade: signed in as ${me.email}`);
        provider.refresh();
      } else {
        state.setToken("");
        vscode.window.showErrorMessage("Cascade: sign-in failed (invalid token?)");
      }
    }),
  );

  // Restore sign-in state on activation.
  if (state.token) {
    const me = await client.getMe();
    state.setSignedIn(!!me);
    if (me) provider.refresh();
  }
}

export function deactivate(): void {
  // Nothing to clean up yet.
}
