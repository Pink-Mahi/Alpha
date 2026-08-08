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
import { browserNavigate, browserScreenshot, browserClick, browserFill, browserExtract, browserGetHtml, browserAnalyzeSeo, browserScroll, browserListElements, browserWait } from "./browserTools.js";
import { memoryRecall, memoryLearn, memoryGuideline, memoryList } from "./memoryTools.js";
import { codeRun, httpRequest, fsEdit, deployStatic, createVisionTool, createImageGenTool } from "./advancedTools.js";
import { dbQuery, dbExecute, browserAnalyzeAccessibility, browserLighthouse, notifyWebhook, testGenerate, browserSetViewport } from "./tier2Tools.js";
import { mobileConvert, mobileConfig, mobileIcon, mobileBuild, mobileRun } from "./mobileTools.js";
import {
  gitBranch, gitCheckout, gitLog, gitMerge, gitStash,
  dockerBuild, dockerRun, dockerCompose,
  codeAnalyze, securityScan, docsGenerate, projectScaffold, dataTransform, pkgInstall,
} from "./tier3Tools.js";
import { mathSolve, mathCalculate, physicsSolve, chemistrySolve, scienceConstant } from "./scienceTools.js";
import { medicalSymptoms, medicalDrug, medicalAnatomy, medicalLab } from "./medicalTools.js";
import { circuitAnalyze, magnetismSolve, semiconductorSolve, digitalLogic } from "./electronicsTools.js";
import { financeCalculate, economicsIndicators } from "./financeTools.js";
import { statsDescribe, statsHypothesisTest, statsRegression, statsDistribution } from "./statisticsTools.js";
import { mechanicalSolve, fluidMechanics, heatTransfer } from "./mechanicalTools.js";
import { astronomySolve } from "./astronomyTools.js";
import { cryptoHash, cryptoEncode, cryptoCipher } from "./cryptoTools.js";
import { geoDistance, geoTimezone } from "./geoTools.js";
import { textAnalyze, textSummarize } from "./textTools.js";
import { sysProcess, sysNetwork, sysCron } from "./sysadminTools.js";
import { stockIndicators } from "./stockTools.js";
import type { ModelRouterClient } from "./modelRouterClient.js";

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

// --- Web tools (internet research capability) --------------------------------

export const webSearch: ToolDef = {
  name: "web.search",
  description: "Search the internet for information. Use this to research APIs, libraries, documentation, current events, scientific papers, or any topic relevant to your task. Returns search result titles, URLs, and snippets.",
  inputSchema: z.object({
    query: z.string().describe("The search query."),
    max_results: z.number().int().min(1).max(20).default(5).describe("Maximum number of results to return."),
  }),
  outputSchema: z.object({
    results: z.array(z.object({
      title: z.string(),
      url: z.string(),
      snippet: z.string(),
    })),
  }),
  permissionsRequired: ["web.search"],
  sideEffect: "read",
  requiresApproval: false,
  async execute({ query, max_results }) {
    // Use DuckDuckGo's HTML endpoint (no API key required)
    try {
      const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      const resp = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
        signal: AbortSignal.timeout(15000),
      });
      if (!resp.ok) {
        return { results: [] };
      }
      const html = await resp.text();
      // Parse results from DuckDuckGo HTML
      const results: Array<{ title: string; url: string; snippet: string }> = [];
      const linkRegex = /class="result__a"[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gs;
      const snippetRegex = /class="result__snippet"[^>]*>(.*?)<\/(?:a|span|div)>/gs;
      const links = [...html.matchAll(linkRegex)];
      const snippets = [...html.matchAll(snippetRegex)];
      for (let i = 0; i < Math.min(links.length, max_results); i++) {
        const linkMatch = links[i];
        if (!linkMatch) continue;
        const title = (linkMatch[2] ?? "").replace(/<[^>]*>/g, "").trim();
        const rawUrl = linkMatch[1] ?? "";
        const urlMatch = rawUrl.match(/uddg=([^&]+)/);
        const cleanUrl = urlMatch ? decodeURIComponent(urlMatch[1]!) : rawUrl;
        const snippetMatch = snippets[i];
        const snippet = snippetMatch ? (snippetMatch[1] ?? "").replace(/<[^>]*>/g, "").trim() : "";
        results.push({ title, url: cleanUrl, snippet });
      }
      return { results };
    } catch (e) {
      return { results: [] };
    }
  },
};

export const webFetch: ToolDef = {
  name: "web.fetch",
  description: "Fetch the content of a web page and return it as text. Use this to read documentation pages, API references, articles, or any web resource found via web.search.",
  inputSchema: z.object({
    url: z.string().describe("The URL to fetch."),
    max_chars: z.number().int().min(100).max(50000).default(10000).describe("Maximum characters to return."),
  }),
  outputSchema: z.object({
    content: z.string(),
    url: z.string(),
    status: z.number(),
  }),
  permissionsRequired: ["web.fetch"],
  sideEffect: "read",
  requiresApproval: false,
  async execute({ url, max_chars }) {
    try {
      const resp = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
        signal: AbortSignal.timeout(20000),
        redirect: "follow",
      });
      const text = await resp.text();
      // Strip HTML tags for a cleaner text output
      const stripped = text
        .replace(/<script[^>]*>.*?<\/script>/gs, "")
        .replace(/<style[^>]*>.*?<\/style>/gs, "")
        .replace(/<[^>]*>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, " ")
        .trim();
      return {
        content: stripped.slice(0, max_chars),
        url: resp.url,
        status: resp.status,
      };
    } catch (e) {
      return { content: `Error fetching URL: ${e}`, url, status: 0 };
    }
  },
};

/** Register all built-in tools on a ToolBus. */
export function registerBuiltinTools(bus: import("./toolBus.js").ToolBus, router?: ModelRouterClient, defaultModel?: string, apiKey?: string): void {
  bus.register(fsRead);
  bus.register(fsWrite);
  bus.register(fsList);
  bus.register(shellExec);
  bus.register(gitStatus);
  bus.register(gitDiff);
  bus.register(gitCommit);
  bus.register(searchGrep);
  bus.register(searchFiles);
  bus.register(webSearch);
  bus.register(webFetch);
  // Browser automation tools
  bus.register(browserNavigate);
  bus.register(browserScreenshot);
  bus.register(browserClick);
  bus.register(browserFill);
  bus.register(browserExtract);
  bus.register(browserGetHtml);
  bus.register(browserAnalyzeSeo);
  bus.register(browserScroll);
  bus.register(browserListElements);
  bus.register(browserWait);
  // Memory tools (self-learning)
  bus.register(memoryRecall);
  bus.register(memoryLearn);
  bus.register(memoryGuideline);
  bus.register(memoryList);
  // Advanced tools (Tier 1)
  bus.register(codeRun);
  bus.register(httpRequest);
  bus.register(fsEdit);
  bus.register(deployStatic);
  if (router) {
    bus.register(createVisionTool(router, defaultModel ?? "openai:gpt-4o", apiKey));
    bus.register(createImageGenTool(router, apiKey));
  }
  // Tier 2 tools
  bus.register(dbQuery);
  bus.register(dbExecute);
  bus.register(browserAnalyzeAccessibility);
  bus.register(browserLighthouse);
  bus.register(notifyWebhook);
  bus.register(testGenerate);
  bus.register(browserSetViewport);
  // Mobile app tools (website to native app conversion)
  bus.register(mobileConvert);
  bus.register(mobileConfig);
  bus.register(mobileIcon);
  bus.register(mobileBuild);
  bus.register(mobileRun);
  // Tier 3 tools — advanced git, Docker, code analysis, security, docs, scaffold, data
  bus.register(gitBranch);
  bus.register(gitCheckout);
  bus.register(gitLog);
  bus.register(gitMerge);
  bus.register(gitStash);
  bus.register(dockerBuild);
  bus.register(dockerRun);
  bus.register(dockerCompose);
  bus.register(codeAnalyze);
  bus.register(securityScan);
  bus.register(docsGenerate);
  bus.register(projectScaffold);
  bus.register(dataTransform);
  bus.register(pkgInstall);
  // Science tools — math, physics, chemistry
  bus.register(mathSolve);
  bus.register(mathCalculate);
  bus.register(physicsSolve);
  bus.register(chemistrySolve);
  bus.register(scienceConstant);
  // Medical tools
  bus.register(medicalSymptoms);
  bus.register(medicalDrug);
  bus.register(medicalAnatomy);
  bus.register(medicalLab);
  // Electronics & magnetism tools
  bus.register(circuitAnalyze);
  bus.register(magnetismSolve);
  bus.register(semiconductorSolve);
  bus.register(digitalLogic);
  // Finance & economics tools
  bus.register(financeCalculate);
  bus.register(economicsIndicators);
  // Statistics & data analysis tools
  bus.register(statsDescribe);
  bus.register(statsHypothesisTest);
  bus.register(statsRegression);
  bus.register(statsDistribution);
  // Mechanical engineering tools
  bus.register(mechanicalSolve);
  bus.register(fluidMechanics);
  bus.register(heatTransfer);
  // Astronomy tools
  bus.register(astronomySolve);
  // Cryptography tools
  bus.register(cryptoHash);
  bus.register(cryptoEncode);
  bus.register(cryptoCipher);
  // Geography tools
  bus.register(geoDistance);
  bus.register(geoTimezone);
  // Text & NLP tools
  bus.register(textAnalyze);
  bus.register(textSummarize);
  // System administration tools
  bus.register(sysProcess);
  bus.register(sysNetwork);
  bus.register(sysCron);
  // Stock trading tools
  bus.register(stockIndicators);
}
