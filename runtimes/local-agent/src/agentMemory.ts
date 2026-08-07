/**
 * Agent Memory System — persistent self-learning across tasks.
 *
 * The agent stores what it learns from each task in a JSON file on disk.
 * These learnings are injected into the system prompt for future tasks,
 * so the agent continuously improves its approach, avoids past mistakes,
 * and builds on successful patterns.
 *
 * Memory types:
 * - "lesson": A specific insight learned from a task (e.g. "Always check
 *   for CORS headers when building APIs")
 * - "pattern": A successful approach that worked well (e.g. "For snake
 *   games, using requestAnimationFrame is better than setInterval")
 * - "mistake": Something that went wrong and should be avoided
 * - "preference": User-specific preferences discovered during work
 * - "guideline": A self-authored improvement to the agent's own behavior
 *
 * The memory file is stored at ~/.alpha/agent_memory.json by default.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";

export interface MemoryEntry {
  id: string;
  type: "lesson" | "pattern" | "mistake" | "preference" | "guideline";
  content: string;
  task_spec: string; // The task that generated this memory
  created_at: string;
  times_used: number; // How many times this memory was injected into a task
  confidence: number; // 0-1, increases as the memory is validated
  tags: string[]; // Keywords for retrieval matching
}

export interface MemoryStore {
  memories: MemoryEntry[];
  version: number;
  total_tasks_completed: number;
}

const DEFAULT_MEMORY_PATH = join(homedir(), ".alpha", "agent_memory.json");

/** Load the memory store from disk. Creates it if it doesn't exist. */
export function loadMemoryStore(path?: string): MemoryStore {
  const memPath = path ?? DEFAULT_MEMORY_PATH;
  try {
    if (existsSync(memPath)) {
      const data = readFileSync(memPath, "utf8");
      return JSON.parse(data) as MemoryStore;
    }
  } catch {
    /* corrupted file, start fresh */
  }
  return { memories: [], version: 1, total_tasks_completed: 0 };
}

/** Save the memory store to disk. */
export function saveMemoryStore(store: MemoryStore, path?: string): void {
  const memPath = path ?? DEFAULT_MEMORY_PATH;
  try {
    mkdirSync(dirname(memPath), { recursive: true });
    writeFileSync(memPath, JSON.stringify(store, null, 2), "utf8");
  } catch (e) {
    console.error(`[memory] failed to save: ${e}`);
  }
}

/** Add a new memory entry. */
export function addMemory(
  store: MemoryStore,
  type: MemoryEntry["type"],
  content: string,
  taskSpec: string,
  tags: string[] = [],
): MemoryEntry {
  const entry: MemoryEntry = {
    id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type,
    content,
    task_spec: taskSpec.slice(0, 500),
    created_at: new Date().toISOString(),
    times_used: 0,
    confidence: 0.5,
    tags,
  };
  store.memories.push(entry);
  // Keep memory bounded — max 500 entries, drop oldest low-confidence ones
  if (store.memories.length > 500) {
    store.memories.sort((a, b) => b.confidence - a.confidence);
    store.memories = store.memories.slice(0, 500);
  }
  return entry;
}

/** Retrieve relevant memories for a given task spec.
 * Uses simple keyword matching against tags and content. */
export function retrieveRelevantMemories(
  store: MemoryStore,
  taskSpec: string,
  limit: number = 10,
): MemoryEntry[] {
  const taskWords = taskSpec
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .map((w) => w.replace(/[^a-z0-9]/g, ""));

  const scored = store.memories.map((mem) => {
    let score = 0;
    const memLower = mem.content.toLowerCase();
    const tagLower = mem.tags.map((t) => t.toLowerCase());

    // Score by tag matches
    for (const word of taskWords) {
      if (tagLower.some((t) => t.includes(word))) score += 3;
      if (memLower.includes(word)) score += 1;
    }

    // Boost by confidence and usage
    score += mem.confidence * 2;
    score += Math.min(mem.times_used * 0.1, 2);

    // Guidelines are always relevant
    if (mem.type === "guideline") score += 1;

    return { mem, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const relevant = scored.filter((s) => s.score > 0).slice(0, limit).map((s) => s.mem);

  // Always include top guidelines even if no keyword match
  const guidelines = store.memories.filter((m) => m.type === "guideline").sort((a, b) => b.confidence - a.confidence).slice(0, 3);
  for (const g of guidelines) {
    if (!relevant.find((r) => r.id === g.id)) relevant.push(g);
  }

  return relevant.slice(0, limit + 3);
}

/** Mark memories as used (called when they're injected into a task). */
export function markMemoriesUsed(store: MemoryStore, memoryIds: string[]): void {
  for (const id of memoryIds) {
    const mem = store.memories.find((m) => m.id === id);
    if (mem) {
      mem.times_used++;
      // Confidence increases slightly each time a memory is used (validated by reuse)
      mem.confidence = Math.min(1, mem.confidence + 0.05);
    }
  }
}

/** Build the memory context string to inject into the system prompt. */
export function buildMemoryContext(memories: MemoryEntry[]): string {
  if (memories.length === 0) return "";

  const sections: string[] = [];

  const guidelines = memories.filter((m) => m.type === "guideline");
  const lessons = memories.filter((m) => m.type === "lesson");
  const patterns = memories.filter((m) => m.type === "pattern");
  const mistakes = memories.filter((m) => m.type === "mistake");
  const preferences = memories.filter((m) => m.type === "preference");

  if (guidelines.length > 0) {
    sections.push(`SELF-IMPROVED GUIDELINES (these are rules you wrote for yourself based on past experience):\n${guidelines.map((g) => `- ${g.content}`).join("\n")}`);
  }
  if (lessons.length > 0) {
    sections.push(`LESSONS LEARNED (insights from previous tasks):\n${lessons.map((l) => `- ${l.content}`).join("\n")}`);
  }
  if (patterns.length > 0) {
    sections.push(`SUCCESSFUL PATTERNS (approaches that worked well before):\n${patterns.map((p) => `- ${p.content}`).join("\n")}`);
  }
  if (mistakes.length > 0) {
    sections.push(`MISTAKES TO AVOID (things that went wrong in the past):\n${mistakes.map((m) => `- ${m.content}`).join("\n")}`);
  }
  if (preferences.length > 0) {
    sections.push(`USER PREFERENCES (what the user prefers):\n${preferences.map((p) => `- ${p.content}`).join("\n")}`);
  }

  return sections.join("\n\n");
}

/** Extract tags from a task spec and memory content for better retrieval. */
export function extractTags(text: string): string[] {
  const words = text.toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3);
  // Deduplicate and return top 10
  return [...new Set(words)].slice(0, 10);
}
