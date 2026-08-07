/**
 * Memory tools — allow the agent to read, write, and update its own memories.
 *
 * These tools give the agent self-learning capability:
 * - memory.recall: Search past memories by keyword
 * - memory.learn: Save a new lesson/pattern/mistake/preference
 * - memory.guideline: Write a self-improvement guideline (updates its own behavior)
 * - memory.list: List all memories of a given type
 */
import { z } from "zod";
import type { ToolDef, ToolContext } from "./toolBus.js";
import {
  loadMemoryStore,
  saveMemoryStore,
  addMemory,
  retrieveRelevantMemories,
  extractTags,
  type MemoryStore,
} from "./agentMemory.js";

// Shared memory store (loaded once, kept in memory, saved on writes)
let _store: MemoryStore | null = null;

function getStore(): MemoryStore {
  if (!_store) _store = loadMemoryStore();
  return _store;
}

function persist(): void {
  if (_store) saveMemoryStore(_store);
}

export const memoryRecall: ToolDef = {
  name: "memory.recall",
  description: "Search your past memories for lessons, patterns, mistakes, and guidelines you've learned from previous tasks. Use this before starting a new task to recall relevant experience. Always call this at the start of a task to benefit from past learning.",
  inputSchema: z.object({
    query: z.string().describe("What you want to recall (e.g. 'building web apps', 'API design', 'game development')"),
  }),
  outputSchema: z.object({
    memories: z.array(z.object({
      id: z.string(),
      type: z.string(),
      content: z.string(),
      created_at: z.string(),
      confidence: z.number(),
      times_used: z.number(),
    })),
    total_memories: z.number(),
  }),
  permissionsRequired: ["memory.recall"],
  sideEffect: "read",
  requiresApproval: false,
  async execute({ query }) {
    const store = getStore();
    const relevant = retrieveRelevantMemories(store, query, 10);
    return {
      memories: relevant.map((m) => ({
        id: m.id,
        type: m.type,
        content: m.content,
        created_at: m.created_at,
        confidence: m.confidence,
        times_used: m.times_used,
      })),
      total_memories: store.memories.length,
    };
  },
};

export const memoryLearn: ToolDef = {
  name: "memory.learn",
  description: "Save a lesson learned from your current work. This will be recalled in future tasks so you continuously improve. Use this when you discover something important — a pattern that works, a mistake to avoid, or a useful insight.",
  inputSchema: z.object({
    type: z.enum(["lesson", "pattern", "mistake", "preference"]).describe("Type of memory: lesson=insight, pattern=successful approach, mistake=what to avoid, preference=user preference"),
    content: z.string().describe("The learning to save (be specific and actionable, e.g. 'When building REST APIs, always add CORS headers early — forgetting this causes hard-to-debug browser errors')"),
    task_context: z.string().describe("Brief description of the task that generated this learning"),
  }),
  outputSchema: z.object({
    id: z.string(),
    saved: z.boolean(),
    total_memories: z.number(),
  }),
  permissionsRequired: ["memory.learn"],
  sideEffect: "write",
  requiresApproval: false,
  async execute({ type, content, task_context }) {
    const store = getStore();
    const tags = extractTags(`${content} ${task_context}`);
    const entry = addMemory(store, type, content, task_context, tags);
    persist();
    return { id: entry.id, saved: true, total_memories: store.memories.length };
  },
};

export const memoryGuideline: ToolDef = {
  name: "memory.guideline",
  description: "Write a self-improvement guideline — a rule you're adding to your own behavior based on experience. These guidelines are ALWAYS injected into your system prompt for future tasks, so they permanently improve how you work. Use this when you identify a systemic improvement to your approach.",
  inputSchema: z.object({
    content: z.string().describe("The guideline to add (write as a directive to yourself, e.g. 'Always run tests after every file change, not just at the end')"),
    reasoning: z.string().describe("Why this guideline improves your work"),
  }),
  outputSchema: z.object({
    id: z.string(),
    saved: z.boolean(),
    total_guidelines: z.number(),
  }),
  permissionsRequired: ["memory.guideline"],
  sideEffect: "write",
  requiresApproval: false,
  async execute({ content, reasoning }) {
    const store = getStore();
    const fullContent = `${content} (Reason: ${reasoning})`;
    const tags = extractTags(fullContent);
    const entry = addMemory(store, "guideline", fullContent, "self-improvement", tags);
    // Guidelines start with higher confidence since they're deliberate
    entry.confidence = 0.8;
    persist();
    const guidelineCount = store.memories.filter((m) => m.type === "guideline").length;
    return { id: entry.id, saved: true, total_guidelines: guidelineCount };
  },
};

export const memoryList: ToolDef = {
  name: "memory.list",
  description: "List all memories of a given type. Use this to review what you've learned over time.",
  inputSchema: z.object({
    type: z.enum(["all", "lesson", "pattern", "mistake", "preference", "guideline"]).default("all").describe("Type of memories to list"),
    limit: z.number().int().min(1).max(100).default(20).describe("Maximum number to return"),
  }),
  outputSchema: z.object({
    memories: z.array(z.object({
      id: z.string(),
      type: z.string(),
      content: z.string(),
      created_at: z.string(),
      confidence: z.number(),
      times_used: z.number(),
    })),
    total: z.number(),
  }),
  permissionsRequired: ["memory.list"],
  sideEffect: "read",
  requiresApproval: false,
  async execute({ type, limit }) {
    const store = getStore();
    let mems = store.memories;
    if (type !== "all") mems = mems.filter((m) => m.type === type);
    mems = [...mems].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit);
    return {
      memories: mems.map((m) => ({
        id: m.id,
        type: m.type,
        content: m.content,
        created_at: m.created_at,
        confidence: m.confidence,
        times_used: m.times_used,
      })),
      total: store.memories.length,
    };
  },
};

/** Get relevant memories for a task spec (used by AgentLoop to inject into prompt). */
export function getRelevantMemoriesForTask(taskSpec: string): { context: string; memoryIds: string[] } {
  const store = getStore();
  const relevant = retrieveRelevantMemories(store, taskSpec, 10);
  const context = buildMemoryContextString(relevant);
  // Mark as used
  const ids = relevant.map((m) => m.id);
  if (ids.length > 0) {
    for (const id of ids) {
      const mem = store.memories.find((m) => m.id === id);
      if (mem) {
        mem.times_used++;
        mem.confidence = Math.min(1, mem.confidence + 0.02);
      }
    }
    persist();
  }
  return { context, memoryIds: ids };
}

function buildMemoryContextString(memories: any[]): string {
  if (memories.length === 0) return "";
  const sections: string[] = [];
  const guidelines = memories.filter((m) => m.type === "guideline");
  const lessons = memories.filter((m) => m.type === "lesson");
  const patterns = memories.filter((m) => m.type === "pattern");
  const mistakes = memories.filter((m) => m.type === "mistake");
  const preferences = memories.filter((m) => m.type === "preference");
  if (guidelines.length > 0) sections.push(`SELF-IMPROVED GUIDELINES (rules you wrote for yourself):\n${guidelines.map((g) => `- ${g.content}`).join("\n")}`);
  if (lessons.length > 0) sections.push(`LESSONS LEARNED:\n${lessons.map((l) => `- ${l.content}`).join("\n")}`);
  if (patterns.length > 0) sections.push(`SUCCESSFUL PATTERNS:\n${patterns.map((p) => `- ${p.content}`).join("\n")}`);
  if (mistakes.length > 0) sections.push(`MISTAKES TO AVOID:\n${mistakes.map((m) => `- ${m.content}`).join("\n")}`);
  if (preferences.length > 0) sections.push(`USER PREFERENCES:\n${preferences.map((p) => `- ${p.content}`).join("\n")}`);
  return sections.join("\n\n");
}

/** Save a learning from a completed task (called after task completion). */
export function saveTaskLearning(taskSpec: string, summary: string, success: boolean): void {
  const store = getStore();
  store.total_tasks_completed++;

  // Auto-generate a memory from the task outcome
  const type = success ? "pattern" : "mistake";
  const content = success
    ? `Task succeeded: ${taskSpec.slice(0, 100)}. Approach: ${summary.slice(0, 200)}`
    : `Task failed: ${taskSpec.slice(0, 100)}. Issue: ${summary.slice(0, 200)}`;
  const tags = extractTags(`${taskSpec} ${summary}`);
  addMemory(store, type, content, taskSpec, tags);
  persist();
}
