import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { rm, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

import { ToolBus, type ToolContext } from "./toolBus.js";
import { fsRead, fsWrite, fsList, searchGrep, searchFiles, registerBuiltinTools } from "./tools.js";

let testDir: string;

async function setupTestDir(): Promise<string> {
  const dir = join(tmpdir(), `ALPHA-test-${randomUUID()}`);
  await mkdir(dir, { recursive: true });
  await mkdir(join(dir, "subdir"), { recursive: true });
  await writeFile(join(dir, "hello.txt"), "Hello, World!");
  await writeFile(join(dir, "subdir", "nested.ts"), "export const x = 42;\n");
  await writeFile(join(dir, "data.json"), '{"key": "value"}\n');
  return dir;
}

async function cleanupTestDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}

function makeCtx(cwd: string, overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    cwd,
    permissions: new Set(["fs.read", "fs.write", "fs.list", "shell.exec", "git.read", "git.write", "search.grep", "search.files"]),
    requestApproval: async () => true,
    log: () => {},
    ...overrides,
  };
}

describe("Built-in tools", () => {
  beforeEach(async () => {
    testDir = await setupTestDir();
  });

  afterEach(async () => {
    await cleanupTestDir(testDir);
  });

  describe("fs.read", () => {
    it("reads a file", async () => {
      const ctx = makeCtx(testDir);
      const result = await fsRead.execute({ path: "hello.txt" }, ctx);
      expect(result.content).toBe("Hello, World!");
      expect(result.size).toBe(13);
    });

    it("throws for paths outside working directory", async () => {
      const ctx = makeCtx(testDir);
      await expect(fsRead.execute({ path: "../../etc/passwd" }, ctx)).rejects.toThrow("outside working directory");
    });
  });

  describe("fs.write", () => {
    it("writes a file", async () => {
      const ctx = makeCtx(testDir);
      const result = await fsWrite.execute({ path: "new.txt", content: "new content" }, ctx);
      expect(result.bytes).toBe(11);
      const readResult = await fsRead.execute({ path: "new.txt" }, ctx);
      expect(readResult.content).toBe("new content");
    });

    it("creates parent directories", async () => {
      const ctx = makeCtx(testDir);
      await fsWrite.execute({ path: "deep/nested/dir/file.txt", content: "deep" }, ctx);
      const readResult = await fsRead.execute({ path: "deep/nested/dir/file.txt" }, ctx);
      expect(readResult.content).toBe("deep");
    });
  });

  describe("fs.list", () => {
    it("lists directory entries", async () => {
      const ctx = makeCtx(testDir);
      const result = await fsList.execute({ path: "." }, ctx);
      const names = result.entries.map((e: { name: string; isDirectory: boolean; size: number }) => e.name);
      expect(names).toContain("hello.txt");
      expect(names).toContain("data.json");
      expect(names).toContain("subdir");
      const subdir = result.entries.find((e: { name: string; isDirectory: boolean }) => e.name === "subdir");
      expect(subdir?.isDirectory).toBe(true);
    });
  });

  describe("search.grep", () => {
    it("finds matching lines", async () => {
      const ctx = makeCtx(testDir);
      const result = await searchGrep.execute({ pattern: "Hello" }, ctx);
      expect(result.matches.length).toBeGreaterThan(0);
      const match = result.matches.find((m: { file: string; line: number; text: string }) => m.file === "hello.txt");
      expect(match).toBeDefined();
      expect(match!.text).toContain("Hello");
    });

    it("finds with regex patterns", async () => {
      const ctx = makeCtx(testDir);
      const result = await searchGrep.execute({ pattern: "export const" }, ctx);
      const match = result.matches.find((m: { file: string; line: number; text: string }) => m.file.includes("nested.ts"));
      expect(match).toBeDefined();
      expect(match!.line).toBe(1);
    });
  });

  describe("search.files", () => {
    it("finds files by glob pattern", async () => {
      const ctx = makeCtx(testDir);
      const result = await searchFiles.execute({ pattern: "**/*.ts" }, ctx);
      // Path separators differ by platform (Windows uses \, Unix uses /)
      expect(result.files.some((f: string) => f.replace(/\\/g, "/").includes("subdir/nested.ts"))).toBe(true);
      expect(result.files.some((f: string) => f.replace(/\\/g, "/").includes("hello.txt"))).toBe(false);
    });
  });

  describe("registerBuiltinTools", () => {
    it("registers all 9 tools", () => {
      const bus = new ToolBus();
      registerBuiltinTools(bus);
      expect(bus.list()).toHaveLength(9);
      const names = bus.list().map((t) => t.name);
      expect(names).toContain("fs.read");
      expect(names).toContain("shell.exec");
      expect(names).toContain("git.commit");
    });
  });
});
