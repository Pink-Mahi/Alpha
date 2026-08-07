/**
 * Built-in tools for the local agent runtime.
 *
 * M1 set: fs.read, fs.write, fs.list, shell.exec, git.status, git.diff,
 * git.commit, search.grep, search.files.
 *
 * All filesystem/shell tools are scoped to the agent's working directory.
 * Destructive tools (fs.write, shell.exec, git.commit) require approval.
 */
import { z } from "zod";
import { $, Glob } from "bun";
import { readFile, writeFile, readdir, stat, mkdir } from "node:fs/promises";
import { join, relative, isAbsolute } from "node:path";

import type { ToolDef, ToolContext } from "./toolBus.js";

/** Ensure a path is within the allowed working directory. */
function safePath(cwd: string, path: string): string {
  const resolved = isAbsolute(path) ? path : join(cwd, path);
  const rel = relative(cwd, resolved);
  if (rel.startsWith("..")) {
    throw new Error(`path outside working directory: ${path}`);
  }
  return resolved;
}

// --- Filesystem tools -------------------------------------------------------

export const fsRead: ToolDef = {
  name: "fs.read",
  description: "Read the contents of a file within the working directory.",
  inputSchema: z.object({
    path: z.string().describe("Relative or absolute path within the working directory."),
  }),
  outputSchema: z.object({
    content: z.string(),
    size: z.number(),
  }),
  permissionsRequired: ["fs.read"],
  sideEffect: "read",
  requiresApproval: false,
  async execute({ path }, ctx) {
    const full = safePath(ctx.cwd, path);
    const content = await readFile(full, "utf8");
    const s = await stat(full);
    return { content, size: s.size };
  },
};

export const fsWrite: ToolDef = {
  name: "fs.write",
  description: "Write content to a file within the working directory. Creates parent directories.",
  inputSchema: z.object({
    path: z.string(),
    content: z.string(),
  }),
  outputSchema: z.object({
    path: z.string(),
    bytes: z.number(),
  }),
  permissionsRequired: ["fs.write"],
  sideEffect: "write",
  requiresApproval: true,
  async execute({ path, content }, ctx) {
    const full = safePath(ctx.cwd, path);
    await mkdir(join(full, ".."), { recursive: true });
    await writeFile(full, content, "utf8");
    return { path, bytes: Buffer.byteLength(content) };
  },
};

export const fsList: ToolDef = {
  name: "fs.list",
  description: "List files in a directory within the working directory.",
  inputSchema: z.object({
    path: z.string().default("."),
  }),
  outputSchema: z.object({
    entries: z.array(z.object({ name: z.string(), isDirectory: z.boolean(), size: z.number() })),
  }),
  permissionsRequired: ["fs.read"],
  sideEffect: "read",
  requiresApproval: false,
  async execute({ path }, ctx) {
    const full = safePath(ctx.cwd, path);
    const entries = await readdir(full, { withFileTypes: true });
    const result = [];
    for (const e of entries) {
      try {
        const s = await stat(join(full, e.name));
        result.push({ name: e.name, isDirectory: e.isDirectory(), size: s.size });
      } catch {
        result.push({ name: e.name, isDirectory: e.isDirectory(), size: 0 });
      }
    }
    return { entries: result };
  },
};

// --- Shell tool -------------------------------------------------------------

export const shellExec: ToolDef = {
  name: "shell.exec",
  description:
    "Execute a shell command in the working directory. Returns stdout, stderr, and exit code. " +
    "Use for running tests, builds, linters, and other CLI tools.",
  inputSchema: z.object({
    command: z.string().describe("The shell command to execute."),
    timeout_ms: z.number().default(30000).describe("Timeout in milliseconds."),
  }),
  outputSchema: z.object({
    stdout: z.string(),
    stderr: z.string(),
    exitCode: z.number(),
  }),
  permissionsRequired: ["shell.exec"],
  sideEffect: "write",
  requiresApproval: true,
  async execute({ command, timeout_ms }, ctx) {
    // Bun's $ doesn't expose .signal() or .timeout() on ShellPromise in 1.3.14.
    // Use a simple Promise.race with a timeout for M1.
    const runPromise = $`sh -c ${command}`.cwd(ctx.cwd).nothrow();
    const timeoutPromise = new Promise<{ stdout: string; stderr: string; exitCode: number }>(
      (resolve) =>
        setTimeout(
          () => resolve({ stdout: "", stderr: "timeout", exitCode: -1 }),
          timeout_ms,
        ),
    );
    const result = await Promise.race([
      runPromise.then((r) => ({
        stdout: r.stdout.toString("utf8"),
        stderr: r.stderr.toString("utf8"),
        exitCode: r.exitCode ?? -1,
      })),
      timeoutPromise,
    ]);
    return result;
  },
};

// --- Git tools --------------------------------------------------------------

export const gitStatus: ToolDef = {
  name: "git.status",
  description: "Get the git status of the working directory.",
  inputSchema: z.object({}),
  outputSchema: z.object({
    stdout: z.string(),
  }),
  permissionsRequired: ["git.read"],
  sideEffect: "read",
  requiresApproval: false,
  async execute(_args, ctx) {
    const result = await $`git status --porcelain=v2`.cwd(ctx.cwd).quiet();
    return { stdout: result.stdout.toString("utf8") };
  },
};

export const gitDiff: ToolDef = {
  name: "git.diff",
  description: "Get the git diff of the working directory.",
  inputSchema: z.object({
    staged: z.boolean().default(false).describe("Show staged changes if true."),
  }),
  outputSchema: z.object({
    stdout: z.string(),
  }),
  permissionsRequired: ["git.read"],
  sideEffect: "read",
  requiresApproval: false,
  async execute({ staged }, ctx) {
    const result = staged
      ? await $`git diff --cached`.cwd(ctx.cwd).quiet()
      : await $`git diff`.cwd(ctx.cwd).quiet();
    return { stdout: result.stdout.toString("utf8") };
  },
};

export const gitCommit: ToolDef = {
  name: "git.commit",
  description: "Stage all changes and create a git commit.",
  inputSchema: z.object({
    message: z.string().describe("Commit message."),
  }),
  outputSchema: z.object({
    stdout: z.string(),
    commit: z.string(),
  }),
  permissionsRequired: ["git.write"],
  sideEffect: "write",
  requiresApproval: true,
  async execute({ message }, ctx) {
    await $`git add -A`.cwd(ctx.cwd).quiet();
    const result = await $`git commit -m ${message}`.cwd(ctx.cwd).nothrow();
    const hashResult = await $`git rev-parse HEAD`.cwd(ctx.cwd).quiet();
    return {
      stdout: result.stdout.toString("utf8"),
      commit: hashResult.stdout.toString("utf8").trim(),
    };
  },
};

// --- Search tools -----------------------------------------------------------

export const searchGrep: ToolDef = {
  name: "search.grep",
  description: "Search file contents using a regex pattern within the working directory.",
  inputSchema: z.object({
    pattern: z.string().describe("Regular expression pattern to search for."),
    glob: z.string().optional().describe("File glob to limit search, e.g. '*.ts'."),
  }),
  outputSchema: z.object({
    matches: z.array(
      z.object({ file: z.string(), line: z.number(), text: z.string() }),
    ),
  }),
  permissionsRequired: ["fs.read"],
  sideEffect: "read",
  requiresApproval: false,
  async execute({ pattern, glob: pattern_glob }, ctx) {
    const matches: Array<{ file: string; line: number; text: string }> = [];
    const regex = new RegExp(pattern);
    const g = new Glob(pattern_glob ?? "**/*");
    const allFiles = await Array.fromAsync(g.scan({ cwd: ctx.cwd }));
    const files = allFiles.filter(
      (f) => !f.includes("node_modules/") && !f.includes(".git/") && !f.includes("dist/"),
    );
    for (const file of files) {
      try {
        const content = await readFile(join(ctx.cwd, file), "utf8");
        const lines = content.split("\n");
        for (let i = 0; i < lines.length; i++) {
          if (regex.test(lines[i]!)) {
            matches.push({ file, line: i + 1, text: lines[i]!.trim() });
          }
        }
      } catch {
        // Skip binary/unreadable files.
      }
    }
    return { matches: matches.slice(0, 200) };
  },
};

export const searchFiles: ToolDef = {
  name: "search.files",
  description: "Find files by name pattern within the working directory.",
  inputSchema: z.object({
    pattern: z.string().describe("Glob pattern for file names, e.g. '**/*.ts'."),
  }),
  outputSchema: z.object({
    files: z.array(z.string()),
  }),
  permissionsRequired: ["fs.read"],
  sideEffect: "read",
  requiresApproval: false,
  async execute({ pattern }, ctx) {
    const g = new Glob(pattern);
    const allFiles = await Array.fromAsync(g.scan({ cwd: ctx.cwd }));
    const files = allFiles.filter(
      (f) => !f.includes("node_modules/") && !f.includes(".git/") && !f.includes("dist/"),
    );
    return { files: files.slice(0, 500) };
  },
};

/** Register all built-in tools on a ToolBus. */
export function registerBuiltinTools(bus: import("./toolBus.js").ToolBus): void {
  bus.register(fsRead);
  bus.register(fsWrite);
  bus.register(fsList);
  bus.register(shellExec);
  bus.register(gitStatus);
  bus.register(gitDiff);
  bus.register(gitCommit);
  bus.register(searchGrep);
  bus.register(searchFiles);
}
