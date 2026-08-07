/**
 * Agent loop — the core execution engine for local coding tasks.
 *
 * Flow:
 * 1. Build a system prompt with tool descriptors + repo context.
 * 2. Call the model router with the task spec.
 * 3. If the model returns tool calls, execute them via the tool bus.
 * 4. Feed tool results back to the model.
 * 5. Repeat until the model returns a final answer (no tool calls).
 * 6. Emit agent protocol events for each step.
 *
 * M1: single-agent, no swarm, no checkpointing yet. Those land in M3.
 */
import type { AgentMessageEnvelope, Payload } from "@alpha/agent-protocol";

import type { ToolBus, ToolContext } from "./toolBus.js";
import type { ModelRouterClient } from "./modelRouterClient.js";

export interface AgentLoopConfig {
  orgId: string;
  runId: string;
  taskId: string;
  spec: string;
  cwd: string;
  budgetUsd: number;
  maxIterations: number;
  model: string; // e.g. "anthropic:claude-3-5-sonnet-latest"
  toolAllowList?: string[];
  permissions: Set<string>;
  /** Called for each agent protocol event emitted by the loop. */
  onEvent: (env: AgentMessageEnvelope) => void;
  /** Approval callback (passed to ToolContext). */
  requestApproval: ToolContext["requestApproval"];
  /** BYO-key for the model provider, if using managed routing. */
  apiKey?: string;
  /** Pre-loaded conversation history (for multi-turn chat). */
  messages?: Array<{ role: string; content: string }>;
}

export interface AgentLoopResult {
  summary: string;
  costUsd: number;
  iterations: number;
  success: boolean;
}

const SYSTEM_PROMPT = `You are ALPHA, an autonomous coding agent. You work inside a developer's repository and complete coding tasks by:
1. Reading files to understand the codebase
2. Planning your approach
3. Editing files and running commands
4. Verifying your changes (tests, builds, linters)
5. Summarizing what you did

You have access to tools for filesystem operations, shell execution, git, and search.
Always read files before editing them. Run tests after making changes.
When you're done, provide a clear summary of what you changed and why.
If a task is too complex or risky, say so rather than making destructive changes.

IMPORTANT GUIDELINES:
- The user is on WINDOWS. Do not use Unix-only modules like tty, termios, or curses.
- For games or visual apps, prefer HTML/CSS/JavaScript (single .html file that runs in a browser) over Python terminal apps. This lets the user play/interact immediately.
- If you must use Python, use tkinter or pygame for GUI apps (not terminal-based).
- Create self-contained files with no external dependencies when possible.
- For web apps, create a single index.html with inline CSS and JS so it can be opened directly in a browser.
- After creating files, mention the file path so the user can find and run them.`;

export class AgentLoop {
  private seq = 0;
  private costUsd = 0;
  private messages: Array<Record<string, unknown>> = [];

  constructor(
    private readonly bus: ToolBus,
    private readonly router: ModelRouterClient,
  ) {}

  async run(config: AgentLoopConfig): Promise<AgentLoopResult> {
    const ctx: ToolContext = {
      cwd: config.cwd,
      permissions: config.permissions,
      requestApproval: config.requestApproval,
      log: (level, msg) => console[level](`[agent:${config.runId.slice(0, 8)}] ${msg}`),
    };

    // Initialize conversation — use provided history or start fresh with the spec.
    if (config.messages && config.messages.length > 0) {
      this.messages = config.messages.map((m) => ({ role: m.role, content: m.content }) as Record<string, unknown>);
    } else {
      this.messages = [
        { role: "user", content: config.spec } as Record<string, unknown>,
      ];
    }

    const toolDescriptors = this.bus.descriptors(config.toolAllowList);

    this.emit(config, "task.start", {
      spec: config.spec,
      budget_usd: config.budgetUsd,
      deadline: new Date(Date.now() + 3600_000).toISOString(),
      runtime: "local",
      tool_allowlist: config.toolAllowList ?? [],
      model_policy: { preferred: [config.model] },
      memory_scope: ["project", "user"],
    });

    let iterations = 0;
    let success = false;
    let summary = "";

    while (iterations < config.maxIterations) {
      iterations++;
      if (this.costUsd >= config.budgetUsd) {
        this.emit(config, "task.failed", {
          reason: `budget exceeded ($${this.costUsd.toFixed(4)} >= $${config.budgetUsd})`,
          cost_usd: this.costUsd,
        });
        return { summary: "budget exceeded", costUsd: this.costUsd, iterations, success: false };
      }

      let response;
      try {
        response = await this.router.complete({
          model: config.model,
          messages: this.messages,
          system: SYSTEM_PROMPT,
          tools: toolDescriptors.map((t) => ({
            name: t.name,
            description: t.description,
            input_schema: t.input_schema,
          })),
          max_tokens: 4096,
          api_key: config.apiKey,
        });
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        this.emit(config, "task.failed", {
          reason: `model router error: ${errorMsg}`,
          cost_usd: this.costUsd,
        });
        return { summary: `model error: ${errorMsg}`, costUsd: this.costUsd, iterations, success: false };
      }

      this.costUsd += response.cost_usd;
      this.emit(config, "cost.tick", {
        model: config.model,
        tokens_in: response.usage?.tokens_in ?? 0,
        tokens_out: response.usage?.tokens_out ?? 0,
        cost_usd: response.cost_usd,
      });

      // Add assistant response to conversation.
      this.messages.push({ role: "assistant", content: response.content } as Record<string, unknown>);

      // If there are tool calls, execute them.
      if (response.tool_calls && response.tool_calls.length > 0) {
        const toolResults: Array<{ role: string; content: unknown }> = [];
        for (const tc of response.tool_calls) {
          this.emit(config, "tool.call", {
            request_id: tc.id ?? tc.name,
            tool: tc.name,
            args: tc.args,
          });

          const result = await this.bus.call(tc.name, tc.args, ctx);

          this.emit(config, "tool.result", {
            request_id: tc.id ?? tc.name,
            output: result.output,
            error: result.error ?? null,
          });

          this.emit(config, "state.event", {
            kind: "file_edit",
            summary: `${tc.name}: ${result.error ?? "ok"}`,
            diff_ref: null,
          });

          toolResults.push({
            role: "user",
            content: JSON.stringify({ tool: tc.name, result: result.output ?? result.error }),
          });
        }
        this.messages.push(...toolResults);
        continue;
      }

      // No tool calls → the model is done.
      summary = response.content;
      success = true;
      break;
    }

    if (!success) {
      this.emit(config, "task.failed", {
        reason: `max iterations reached (${config.maxIterations})`,
        cost_usd: this.costUsd,
      });
      return { summary: "max iterations", costUsd: this.costUsd, iterations, success: false };
    }

    this.emit(config, "task.complete", {
      summary,
      artifacts: [],
      pr_url: null,
      cost_usd: this.costUsd,
      duration_ms: 0,
    });

    return { summary, costUsd: this.costUsd, iterations, success };
  }

  private emit(
    config: AgentLoopConfig,
    type: AgentMessageEnvelope["type"],
    payload: Record<string, unknown>,
  ): void {
    const env = {
      version: "1.0" as const,
      org_id: config.orgId,
      run_id: config.runId,
      task_id: config.taskId,
      seq: this.seq++,
      ts: new Date().toISOString(),
      type,
      payload,
    } as unknown as AgentMessageEnvelope;
    config.onEvent(env);
  }
}
