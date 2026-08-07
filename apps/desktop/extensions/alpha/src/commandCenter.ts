/**
 * Command Center — the main ALPHA webview panel in the activity bar.
 *
 * Shows: sign-in state, current task status, agent log stream, and a prompt
 * input for new tasks. Communicates with the extension via message passing.
 */
import * as vscode from "vscode";

import type { ControlPlaneClient } from "./controlPlaneClient";
import type { LocalAgentClient, AgentEvent } from "./localAgentClient";
import type { State } from "./state";

export class CommandCenterProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private pollTimer?: ReturnType<typeof setInterval>;
  private lastEventSeq = -1;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly state: State,
    private readonly client: ControlPlaneClient,
    private readonly agentClient: LocalAgentClient,
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
          await vscode.commands.executeCommand("ALPHA.signIn");
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

  /** Start polling the local agent runtime for events. */
  startPolling(taskId: string): void {
    this.stopPolling();
    this.lastEventSeq = -1;
    this.pollTimer = setInterval(async () => {
      const status = await this.agentClient.getStatus(taskId);
      if (!status) return;

      // Send new events to the webview.
      const newEvents = status.events.filter((e) => e.seq > this.lastEventSeq);
      if (newEvents.length > 0) {
        this.lastEventSeq = newEvents[newEvents.length - 1]!.seq;
        this.view?.webview.postMessage({
          type: "events",
          events: newEvents.map(formatEvent),
        });
      }

      // Check if task is done.
      if (status.status !== "running") {
        this.stopPolling();
        this.view?.webview.postMessage({
          type: "taskDone",
          status: status.status,
          result: status.result,
        });
        await this.state.setCurrentTaskId(undefined);
        this.refresh();
      }
    }, 2000);
  }

  stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = undefined;
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
  <title>ALPHA Command Center</title>
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
    .eventLog { margin-top: 12px; max-height: 400px; overflow-y: auto; font-size: 12px; font-family: var(--vscode-editor-font-family); }
    .eventLog .event { padding: 4px 0; border-bottom: 1px solid var(--vscode-editorGroup-border); }
    .eventLog .event .seq { opacity: 0.4; margin-right: 6px; }
    .eventLog .event.tool { color: var(--vscode-textLink-foreground); }
    .eventLog .event.cost { color: var(--vscode-charts-yellow); }
    .eventLog .event.complete { color: var(--vscode-testing-iconPassed); }
    .eventLog .event.failed { color: var(--vscode-testing-iconFailed); }
  </style>
</head>
<body>
  <h2>ALPHA</h2>

  <div id="signedOut">
    <p class="muted">Sign in to start using ALPHA agents.</p>
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

    <div id="eventLog" class="eventLog"></div>
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

    const eventLog = document.getElementById('eventLog');
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
      } else if (msg.type === 'events') {
        for (const ev of msg.events) {
          const div = document.createElement('div');
          div.className = 'event ' + ev.type.split('.')[0];
          div.innerHTML = '<span class="seq">#' + ev.seq + '</span>' + ev.text;
          eventLog.appendChild(div);
        }
        eventLog.scrollTop = eventLog.scrollHeight;
      } else if (msg.type === 'taskDone') {
        if (msg.status === 'complete') {
          taskStatus.textContent = 'Task complete: ' + (msg.result?.summary?.slice(0, 60) ?? '');
          taskStatus.className = 'status running';
        } else {
          taskStatus.textContent = 'Task ' + msg.status;
          taskStatus.className = 'status idle';
        }
        agentControls.classList.add('hidden');
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

/** Format an agent event for display in the webview. */
function formatEvent(e: AgentEvent): { seq: number; type: string; text: string } {
  let text = "";
  switch (e.type) {
    case "task.start":
      text = `Task started: ${(e.payload as { spec?: string }).spec?.slice(0, 60) ?? ""}`;
      break;
    case "task.plan":
      text = `Plan: ${(e.payload as { steps?: Array<{ summary?: string }> }).steps?.length ?? 0} steps`;
      break;
    case "tool.call":
      text = `Calling: ${(e.payload as { tool?: string }).tool ?? ""}`;
      break;
    case "tool.result": {
      const err = (e.payload as { error?: string | null }).error;
      text = err ? `Tool error: ${err.slice(0, 80)}` : "Tool completed";
      break;
    }
    case "state.event":
      text = (e.payload as { summary?: string }).summary ?? e.type;
      break;
    case "cost.tick": {
      const cost = (e.payload as { cost_usd?: number }).cost_usd ?? 0;
      text = `Cost: $${cost.toFixed(4)}`;
      break;
    }
    case "human.checkpoint":
      text = `Approval needed: ${(e.payload as { reason?: string }).reason ?? ""}`;
      break;
    case "task.complete":
      text = `Done: ${(e.payload as { summary?: string }).summary?.slice(0, 80) ?? ""}`;
      break;
    case "task.failed":
      text = `Failed: ${(e.payload as { reason?: string }).reason ?? ""}`;
      break;
    default:
      text = e.type;
  }
  return { seq: e.seq, type: e.type, text };
}
