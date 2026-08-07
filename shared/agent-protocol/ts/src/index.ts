/**
 * @alpha/agent-protocol — canonical message types shared by all agent runtimes
 * (local, cloud, voice) and the orchestrator.
 *
 * Types are hand-authored to match ../schema/*.json for M0. A codegen step
 * (scripts/codegen.ts) will regenerate these from JSON Schema in CI once wired.
 * When editing, keep schema and types in sync; `bun run validate` checks both.
 */

export const PROTOCOL_VERSION = "1.0" as const;

export type Runtime = "local" | "cloud";
export type MemoryScope = "session" | "project" | "user" | "org";
export type SideEffect = "none" | "read" | "write" | "destructive";
export type StateEventKind =
  | "file_edit"
  | "shell"
  | "browser"
  | "git"
  | "message"
  | "call";
export type Risk = "none" | "low" | "medium" | "high" | "destructive";

export interface ModelPolicy {
  /** Provider/model ids in preference order, e.g. ["anthropic:claude-opus", "openai:gpt-4o"]. */
  preferred?: string[];
  max_cost_per_1k_usd?: number | null;
  max_latency_ms?: number | null;
  require_json?: boolean;
}

export interface ToolDescriptor {
  name: string;
  description?: string;
  input_schema: Record<string, unknown>;
  output_schema: Record<string, unknown>;
  permissions_required: string[];
  side_effect: SideEffect;
  cost_estimate_usd?: number | null;
  runtime: "local" | "cloud" | "either";
  voice_safe: boolean;
}

export namespace Payload {
  export interface TaskStart {
    spec: string;
    repo_ref?: string | null;
    budget_usd: number;
    deadline: string;
    runtime: Runtime;
    tool_allowlist: string[];
    model_policy: ModelPolicy;
    memory_scope: MemoryScope[];
  }

  export interface PlanStep {
    summary: string;
    risk: Risk;
    requires_approval?: boolean;
  }

  export interface TaskPlan {
    steps: PlanStep[];
  }

  export interface ToolCall {
    request_id: string;
    tool: string;
    args: Record<string, unknown>;
  }

  export interface ToolResult {
    request_id: string;
    output?: unknown;
    error?: string | null;
  }

  export interface StateEvent {
    kind: StateEventKind;
    summary: string;
    diff_ref?: string | null;
  }

  export interface Checkpoint {
    seq: number;
    state_ref: string;
    fs_ref?: string | null;
  }

  export interface CostTick {
    model: string;
    tokens_in?: number;
    tokens_out?: number;
    cost_usd: number;
  }

  export interface HumanCheckpoint {
    reason: string;
    proposed_action: string;
    diff_preview?: string | null;
    /** Rendered as a spoken yes/no prompt when origin is a voice agent. */
    voice_prompt?: string | null;
  }

  export interface TaskComplete {
    summary: string;
    artifacts?: string[];
    pr_url?: string | null;
    cost_usd: number;
    duration_ms: number;
  }

  export interface TaskFailed {
    reason: string;
    partial_state_ref?: string | null;
    cost_usd: number;
  }
}

export type MessageType =
  | "task.start"
  | "task.plan"
  | "tool.call"
  | "tool.result"
  | "state.event"
  | "checkpoint"
  | "cost.tick"
  | "human.checkpoint"
  | "task.complete"
  | "task.failed";

export type PayloadOf<T extends MessageType> =
  T extends "task.start" ? Payload.TaskStart
  : T extends "task.plan" ? Payload.TaskPlan
  : T extends "tool.call" ? Payload.ToolCall
  : T extends "tool.result" ? Payload.ToolResult
  : T extends "state.event" ? Payload.StateEvent
  : T extends "checkpoint" ? Payload.Checkpoint
  : T extends "cost.tick" ? Payload.CostTick
  : T extends "human.checkpoint" ? Payload.HumanCheckpoint
  : T extends "task.complete" ? Payload.TaskComplete
  : T extends "task.failed" ? Payload.TaskFailed
  : never;

export interface AgentMessageEnvelope<T extends MessageType = MessageType> {
  version: typeof PROTOCOL_VERSION;
  org_id: string;
  run_id: string;
  task_id: string;
  parent_run_id?: string | null;
  seq: number;
  ts: string;
  type: T;
  payload: PayloadOf<T>;
}

/** Narrowing helper for switch-style handling. */
export function isMessage<T extends MessageType>(
  env: AgentMessageEnvelope,
  type: T,
): env is AgentMessageEnvelope<T> {
  return env.type === type;
}

/** Construct an envelope with sensible defaults (seq/ts filled by caller). */
export function envelope<T extends MessageType>(
  base: { org_id: string; run_id: string; task_id: string; seq: number },
  type: T,
  payload: PayloadOf<T>,
): AgentMessageEnvelope<T> {
  return {
    version: PROTOCOL_VERSION,
    org_id: base.org_id,
    run_id: base.run_id,
    task_id: base.task_id,
    seq: base.seq,
    ts: new Date().toISOString(),
    type,
    payload,
  };
}
