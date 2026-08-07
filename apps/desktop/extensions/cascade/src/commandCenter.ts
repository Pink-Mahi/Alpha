/**
 * Command Center — the main Cascade webview panel in the activity bar.
 *
 * Shows: sign-in state, current task status, agent log stream, and a prompt
 * input for new tasks. Communicates with the extension via message passing.
 */
import * as vscode from "vscode";

import type { ControlPlaneClient } from "./controlPlaneClient";
import type { State } from "./state";

export class CommandCenterProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly state: State,
    private readonly client: ControlPlaneClient,
  ) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };
    view.webview.html = this.getHtml(view.webview);

    view.webview.onDidReceiveMessage(async (msg) => {
      switch (msg.type) {
        case "newTask": {
          if (typeof msg.spec === "string" && msg.spec.trim()) {
            await this.client.createTask(msg.spec.trim());
            this.refresh();
          }
          break;
        }
        case "pause": {
          await this.client.pauseCurrentTask();
          this.refresh();
          break;
        }
        case "kill": {
          await this.client.killCurrentTask();
          this.refresh();
          break;
        }
        case "signIn": {
          await vscode.commands.executeCommand("cascade.signIn");
          break;
        }
        case "refresh": {
          this.refresh();
          break;
        }
      }
    });
  }

  refresh(): void {
    if (this.view) {
      this.view.webview.postMessage({
        type: "state",
        signedIn: this.state.signedIn,
        currentTaskId: this.state.currentTaskId,
      });
    }
  }

  private getHtml(webview: vscode.Webview): string {
    const nonce = getNonce();
    const csp = [
      `default-src 'none'`,
      `script-src 'nonce-${nonce}'`,
      `style-src 'unsafe-inline'`,
      `font-src ${webview.cspSource}`,
    ].join("; ");

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Cascade Command Center</title>
  <style>
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 12px; margin: 0; }
    h2 { font-size: 13px; font-weight: 600; margin: 0 0 8px 0; text-transform: uppercase; opacity: 0.7; }
    .prompt { width: 100%; box-sizing: border-box; padding: 8px; border: 1px solid var(--vscode-input-border); background: var(--vscode-input-background); color: var(--vscode-input-foreground); font-family: inherit; font-size: 13px; resize: vertical; min-height: 60px; border-radius: 2px; }
    .prompt:focus { outline: 1px solid var(--vscode-focusBorder); }
    .btn { padding: 6px 12px; border: none; background: var(--vscode-button-background); color: var(--vscode-button-foreground); cursor: pointer; font-size: 13px; border-radius: 2px; }
    .btn:hover { background: var(--vscode-button-hoverBackground); }
    .btn.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
    .btn.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
    .row { display: flex; gap: 8px; margin-top: 8px; }
    .status { padding: 8px; border-radius: 2px; margin: 8px 0; font-size: 12px; }
    .status.idle { background: var(--vscode-editor-inactiveSelectionBackground); }
    .status.running { background: var(--vscode-inputValidation-infoBackground); }
    .hidden { display: none; }
    .muted { opacity: 0.6; font-size: 11px; }
  </style>
</head>
<body>
  <h2>Cascade</h2>

  <div id="signedOut">
    <p class="muted">Sign in to start using Cascade agents.</p>
    <button class="btn" id="signInBtn">Sign In</button>
  </div>

  <div id="signedIn" class="hidden">
    <textarea class="prompt" id="taskInput" placeholder="Describe a coding task for the agent..."></textarea>
    <div class="row">
      <button class="btn" id="submitBtn">Start Task</button>
    </div>

    <div id="taskStatus" class="status idle">No active task.</div>

    <div class="row hidden" id="agentControls">
      <button class="btn secondary" id="pauseBtn">Pause</button>
      <button class="btn secondary" id="killBtn">Kill</button>
    </div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const signedOut = document.getElementById('signedOut');
    const signedIn = document.getElementById('signedIn');
    const taskStatus = document.getElementById('taskStatus');
    const agentControls = document.getElementById('agentControls');

    document.getElementById('signInBtn').addEventListener('click', () => vscode.postMessage({ type: 'signIn' }));
    document.getElementById('submitBtn').addEventListener('click', () => {
      const spec = document.getElementById('taskInput').value;
      if (spec.trim()) vscode.postMessage({ type: 'newTask', spec });
    });
    document.getElementById('pauseBtn').addEventListener('click', () => vscode.postMessage({ type: 'pause' }));
    document.getElementById('killBtn').addEventListener('click', () => vscode.postMessage({ type: 'kill' }));

    window.addEventListener('message', (e) => {
      const msg = e.data;
      if (msg.type === 'state') {
        if (msg.signedIn) {
          signedOut.classList.add('hidden');
          signedIn.classList.remove('hidden');
        } else {
          signedOut.classList.remove('hidden');
          signedIn.classList.add('hidden');
        }
        if (msg.currentTaskId) {
          taskStatus.textContent = 'Task running: ' + msg.currentTaskId.slice(0, 8);
          taskStatus.className = 'status running';
          agentControls.classList.remove('hidden');
        } else {
          taskStatus.textContent = 'No active task.';
          taskStatus.className = 'status idle';
          agentControls.classList.add('hidden');
        }
      }
    });
  </script>
</body>
</html>`;
  }
}

function getNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 32; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}
