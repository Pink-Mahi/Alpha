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
import { getRelevantMemoriesForTask, saveTaskLearning } from "./memoryTools.js";

export interface AgentLoopConfig {
  orgId: string;
  runId: string;
  taskId: string;
  spec: string;
  cwd: string;
  budgetUsd: number;
  maxIterations: number;
  model: string;
  toolAllowList?: string[];
  permissions: Set<string>;
  onEvent: (env: AgentMessageEnvelope) => void;
  requestApproval: ToolContext["requestApproval"];
  apiKey?: string;
  messages?: Array<{ role: string; content: string }>;
  /** Enable self-reflection every N iterations (default: every 5). */
  reflectionInterval?: number;
  /** Extra context injected into reflections (e.g. supervisor directives, other agents' outputs). */
  externalContext?: string[];
}

export interface AgentLoopResult {
  summary: string;
  costUsd: number;
  iterations: number;
  success: boolean;
}

const SYSTEM_PROMPT = `You are ALPHA, an autonomous, self-aware AI agent. You work inside a developer's repository and complete tasks by:
1. RESEARCHING — Use web.search and web.fetch to research anything you don't know. Look up APIs, documentation, scientific papers, best practices, competitor products, etc.
2. BROWSING — Use browser.navigate, browser.screenshot, browser.click, browser.fill, browser.extract, browser.analyze_seo to visit and analyze competitor websites. You can create accounts, log in, and explore features like a real user.
3. READING — Read files to understand the codebase and context
4. PLANNING — Plan your approach before executing
5. EXECUTING — Edit files, run commands, write code
6. VERIFYING — Run tests, builds, linters. Check your work.
7. REFLECTING — Assess your progress. Are you on the right track? Is the quality good enough? What could be better?
8. ITERATING — If the result isn't excellent, keep improving it.

You have access to tools for filesystem operations, shell execution, git, search, web research, AND full browser automation.
Always read files before editing them. Run tests after making changes. Use web.search when you need information you don't have.

COMPETITOR ANALYSIS WORKFLOW:
When the user asks you to build something "better than [website]", follow this workflow:
1. Use browser.navigate to visit the competitor's website
2. Take a screenshot with browser.screenshot to capture the design
3. Use browser.list_elements to find interactive elements (buttons, links, forms)
4. If there's a signup/login, use browser.fill and browser.click to create an account and log in
5. Explore all features — click through navigation, try different pages, take screenshots
6. Use browser.analyze_seo to audit their SEO (meta tags, headings, structured data)
7. Use browser.extract to read their content and copy
8. Use browser.get_html to analyze their HTML structure and CSS approach
9. Document everything you find — features, design patterns, strengths, weaknesses
10. Then build a BETTER version with:
    - Better SEO (proper meta tags, structured data, semantic HTML, fast loading)
    - Better UX (clearer navigation, better visual hierarchy, responsive design)
    - Better features (improve on what they have, add what they're missing)
    - Better performance (optimized assets, minimal dependencies)
    - Better accessibility (ARIA labels, keyboard navigation, color contrast)

SELF-AWARENESS:
- You are aware of your own capabilities and limitations. If you don't know something, research it.
- You reflect on your progress after each major step. Ask yourself: "Is this the best approach? What am I missing?"
- You are persistent. You don't give up when something doesn't work — you try a different approach.
- You are resourceful. If a library isn't available, find an alternative. If an API doesn't work, find another way.
- You think about edge cases, error handling, and user experience.

QUALITY STANDARD:
- Your goal is not just "done" but "excellent". The best possible result.
- If you're building a product, think about what would make it the best in its category.
- If you're solving a problem, think about whether your solution is optimal or just adequate.
- Consider performance, security, usability, and maintainability.

IMPORTANT GUIDELINES:
- The user is on WINDOWS. Do not use Unix-only modules like tty, termios, or curses.
- For games or visual apps, prefer HTML/CSS/JavaScript (single .html file that runs in a browser) over Python terminal apps.
- If you must use Python, use tkinter or pygame for GUI apps (not terminal-based).
- Create self-contained files with no external dependencies when possible.
- For web apps, create a single index.html with inline CSS and JS so it can be opened directly in a browser.
- After creating files, mention the file path so the user can find and run them.
- When doing research, cite your sources (URLs) in your summary.
- When analyzing competitors, save screenshots so the user can see what you analyzed.

ADVANCED CAPABILITIES:
- VISION: Use vision.analyze to actually SEE images and screenshots. After taking a screenshot with browser.screenshot, analyze it with vision.analyze to understand the design, layout, colors, and visual hierarchy. You can also analyze your own created files to verify they look correct.
- CODE SANDBOX: Use code.run to test code snippets in JavaScript, TypeScript, Python, or bash before writing to files. Prototype ideas, validate logic, run calculations.
- HTTP CLIENT: Use http.request to call APIs, test your own endpoints, integrate with third-party services, or fetch data from web services.
- SURGICAL EDITING: Use fs.edit for targeted changes to files (find and replace) instead of rewriting entire files with fs.write. This is safer and faster.
- DEPLOYMENT: Use deploy.static to deploy your website to a live URL so the user can immediately access it. Always deploy after building a web app.
- IMAGE GENERATION: Use image.generate to create logos, icons, illustrations, favicons, and other visual assets. A great product needs great visuals — don't skip this.
- DATABASE: Use db.query to inspect data and schemas (read-only, safe). Use db.execute to create tables, insert data, and manage schema (requires approval). Use $DATABASE_URL to reference the env variable.
- ACCESSIBILITY: Use browser.analyze_accessibility after building web pages to audit WCAG compliance. Fix all critical issues (missing alt text, missing labels, empty buttons).
- PERFORMANCE: Use browser.lighthouse to audit page speed and Core Web Vitals. Optimize based on recommendations (reduce DOM size, bundle resources, compress assets).
- NOTIFICATIONS: Use notify.webhook to send completion notifications to Slack, Discord, or any webhook URL. Always notify when a long task completes.
- TEST GENERATION: Use test.generate after writing code to auto-create test suites. Tests cover functions, edge cases, and error handling.
- RESPONSIVE TESTING: Use browser.set_viewport to test your website at different screen sizes (iPhone, iPad, Android, desktop). Ensure it looks good on all devices.

SELF-LEARNING:
- You have a memory system. Use memory.recall at the start of every task to recall relevant lessons from past work.
- When you learn something valuable during a task, use memory.learn to save it for future tasks.
- When you identify a systemic improvement to your own behavior, use memory.guideline to write a self-improvement rule. These guidelines are permanently injected into your system prompt for all future tasks.
- After completing tasks, always save what you learned — both successes (patterns) and failures (mistakes).
- You are continuously improving. Every task makes you better. Every mistake teaches you something. Every success reinforces what works.
- Your goal is not just to complete the current task, but to become the best possible agent over time.`;

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

    // Retrieve relevant memories from past tasks and inject into system prompt
    const { context: memoryContext } = getRelevantMemoriesForTask(config.spec);
    const systemPrompt = memoryContext ? `${SYSTEM_PROMPT}\n\n=== PAST EXPERIENCE (from your memory system) ===\n${memoryContext}\n\n=== END PAST EXPERIENCE ===\n\nUse the above memories to guide your approach. Build on past successes, avoid past mistakes, and follow your self-improvement guidelines.` : SYSTEM_PROMPT;

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
    const reflectionInterval = config.reflectionInterval ?? 5;

    while (iterations < config.maxIterations) {
      iterations++;
      if (this.costUsd >= config.budgetUsd) {
        this.emit(config, "task.failed", {
          reason: `budget exceeded ($${this.costUsd.toFixed(4)} >= $${config.budgetUsd})`,
          cost_usd: this.costUsd,
        });
        return { summary: "budget exceeded", costUsd: this.costUsd, iterations, success: false };
      }

      // Self-reflection: every N iterations, assess progress and adjust approach
      if (iterations > 1 && iterations % reflectionInterval === 0) {
        const reflection = await this.reflect(config, iterations);
        if (reflection) {
          this.emit(config, "state.event", {
            kind: "self_reflection",
            summary: reflection.slice(0, 200),
          });
          // Inject reflection into conversation to guide next steps
          this.messages.push({
            role: "user",
            content: `[SELF-REFLECTION — Step ${iterations}]\n${reflection}\n\nContinue working on the task with these insights in mind.`,
          } as Record<string, unknown>);
        }
      }

      // Check for external context (supervisor directives, other agents' outputs)
      if (config.externalContext && config.externalContext.length > 0) {
        const newContext = config.externalContext.splice(0); // drain
        for (const ctx of newContext) {
          this.messages.push({
            role: "user",
            content: `[EXTERNAL CONTEXT]\n${ctx}`,
          } as Record<string, unknown>);
        }
      }

      let response;
      try {
        response = await this.router.complete({
          model: config.model,
          messages: this.messages,
          system: systemPrompt,
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
      saveTaskLearning(config.spec, "max iterations reached without completion", false);
      return { summary: "max iterations", costUsd: this.costUsd, iterations, success: false };
    }

    this.emit(config, "task.complete", {
      summary,
      artifacts: [],
      pr_url: null,
      cost_usd: this.costUsd,
      duration_ms: 0,
    });

    // Save learning from this task to memory for future self-improvement
    saveTaskLearning(config.spec, summary, true);

    return { summary, costUsd: this.costUsd, iterations, success };
  }

  /** Self-reflection: assess progress and decide if approach needs to change. */
  private async reflect(config: AgentLoopConfig, iteration: number): Promise<string | null> {
    const recentMessages = this.messages.slice(-6).map((m) => {
      const role = m.role as string;
      const content = typeof m.content === "string" ? m.content.slice(0, 200) : JSON.stringify(m.content).slice(0, 200);
      return `${role}: ${content}`;
    }).join("\n");

    const reflectionPrompt = `You are reflecting on your progress on this task (iteration ${iteration}).

Original task: ${config.spec}

Your recent actions:
${recentMessages}

Reflect on:
1. What have you accomplished so far?
2. Is your current approach working? Are you making real progress?
3. What's missing? What could be better?
4. Should you change your approach? Try a different strategy?
5. Have you researched enough? Do you need to use web.search for more information?
6. Are you aiming for excellence, not just "done"?

Be honest and specific. If you're stuck, say so and propose a new approach. If you're on track, confirm and identify what to focus on next.

Respond in 2-4 sentences. Be concise but specific.`;

    try {
      const response = await this.router.complete({
        model: config.model,
        messages: [{ role: "user", content: reflectionPrompt }],
        system: "You are a self-reflective AI agent. Be honest, specific, and actionable in your reflection.",
        max_tokens: 512,
        api_key: config.apiKey,
      });
      this.costUsd += response.cost_usd;
      return response.content;
    } catch {
      return null;
    }
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
