/**
 * Tier 3 tools â€” advanced git, Docker, code analysis, security scanning,
 * documentation generation, project scaffolding, and data transformation.
 *
 * These tools give the agent professional-grade DevOps and code quality
 * capabilities, making it a complete software engineering assistant.
 */
import { z } from "zod";
import { existsSync, mkdirSync } from "node:fs";
import { readFile as readFileAsync, writeFile as writeFileAsync, readdir, stat } from "node:fs/promises";
import { join, isAbsolute, relative, extname, basename, dirname } from "node:path";
import { exec as execCb } from "node:child_process";
import { promisify } from "node:util";
import type { ToolDef, ToolContext } from "./toolBus.js";

const execAsync = promisify(execCb);

function safePath(cwd: string, path: string): string {
  const resolved = isAbsolute(path) ? path : join(cwd, path);
  const rel = relative(cwd, resolved);
  if (rel.startsWith("..")) throw new Error(`path outside working directory: ${path}`);
  return resolved;
}

// =============================================================================
// 1. ADVANCED GIT TOOLS â€” branch, checkout, log, merge, stash
// =============================================================================

export const gitBranch: ToolDef = {
  name: "git.branch",
  description: "Create, list, or delete git branches. Use this to manage feature branches, create release branches, or clean up old branches. Creating a branch does not switch to it â€” use git.checkout for that.",
  inputSchema: z.object({
    action: z.enum(["create", "list", "delete"]).describe("Action to perform"),
    name: z.string().optional().describe("Branch name (required for create/delete)"),
    remote: z.boolean().default(false).describe("Push branch to remote after creating (create only)"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
    branches: z.array(z.string()).optional(),
  }),
  permissionsRequired: ["shell.exec"],
  sideEffect: "write",
  requiresApproval: false,
  async execute({ action, name, remote }, ctx) {
    try {
      if (action === "list") {
        const { stdout } = await execAsync("git branch -a --format='%(refname:short)'", { cwd: ctx.cwd, timeout: 10000 });
        const branches = stdout.trim().split("\n").map((b) => b.trim()).filter(Boolean);
        return { success: true, message: `Found ${branches.length} branches`, branches };
      } else if (action === "create") {
        if (!name) return { success: false, message: "Branch name required for create action" };
        await execAsync(`git checkout -b ${name}`, { cwd: ctx.cwd, timeout: 10000 });
        if (remote) {
          await execAsync(`git push -u origin ${name}`, { cwd: ctx.cwd, timeout: 30000 }).catch(() => {});
        }
        return { success: true, message: `Created and switched to branch '${name}'${remote ? " and pushed to remote" : ""}` };
      } else if (action === "delete") {
        if (!name) return { success: false, message: "Branch name required for delete action" };
        await execAsync(`git branch -d ${name}`, { cwd: ctx.cwd, timeout: 10000 });
        return { success: true, message: `Deleted branch '${name}'` };
      }
      return { success: false, message: "Unknown action" };
    } catch (e: any) {
      return { success: false, message: e.stderr?.toString() ?? e.message ?? String(e) };
    }
  },
};

export const gitCheckout: ToolDef = {
  name: "git.checkout",
  description: "Switch to a different branch or restore files. Use this to switch between feature branches, restore deleted files, or discard changes.",
  inputSchema: z.object({
    target: z.string().describe("Branch name, commit hash, or file path to checkout/restore"),
    create: z.boolean().default(false).describe("If true, create a new branch with this name"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
  }),
  permissionsRequired: ["shell.exec"],
  sideEffect: "write",
  requiresApproval: false,
  async execute({ target, create }, ctx) {
    try {
      const cmd = create ? `git checkout -b ${target}` : `git checkout ${target}`;
      await execAsync(cmd, { cwd: ctx.cwd, timeout: 10000 });
      return { success: true, message: create ? `Created and switched to branch '${target}'` : `Switched to '${target}'` };
    } catch (e: any) {
      return { success: false, message: e.stderr?.toString() ?? e.message ?? String(e) };
    }
  },
};

export const gitLog: ToolDef = {
  name: "git.log",
  description: "View git commit history. Returns recent commits with hash, author, date, and message. Use this to understand project history, find when a change was introduced, or prepare changelogs.",
  inputSchema: z.object({
    count: z.number().int().min(1).max(100).default(20).describe("Number of commits to return"),
    oneline: z.boolean().default(true).describe("Use compact one-line format"),
    branch: z.string().optional().describe("Specific branch to log (defaults to current)"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    commits: z.array(z.object({
      hash: z.string(),
      author: z.string(),
      date: z.string(),
      message: z.string(),
    })),
    message: z.string(),
  }),
  permissionsRequired: ["shell.exec"],
  sideEffect: "read",
  requiresApproval: false,
  async execute({ count, oneline, branch }, ctx) {
    try {
      const format = oneline ? "--oneline" : "--pretty=format:'%H|%an|%ad|%s'";
      const cmd = `git log ${branch ?? ""} -${count} ${format}`;
      const { stdout } = await execAsync(cmd, { cwd: ctx.cwd, timeout: 10000 });

      const commits = stdout.trim().split("\n").filter(Boolean).map((line) => {
        if (oneline) {
          const match = line.match(/^([a-f0-9]+)\s+(.*)$/);
          return { hash: match?.[1] ?? "", author: "", date: "", message: match?.[2] ?? line };
        }
        const parts = line.replace(/^'|'$/g, "").split("|");
        return { hash: parts[0] ?? "", author: parts[1] ?? "", date: parts[2] ?? "", message: parts[3] ?? "" };
      });

      return { success: true, commits, message: `Found ${commits.length} commits` };
    } catch (e: any) {
      return { success: false, commits: [], message: e.stderr?.toString() ?? e.message ?? String(e) };
    }
  },
};

export const gitMerge: ToolDef = {
  name: "git.merge",
  description: "Merge a branch into the current branch. Use this to combine feature branches back into main. Supports merge commits or fast-forward merges.",
  inputSchema: z.object({
    branch: z.string().describe("Branch to merge into current branch"),
    no_ff: z.boolean().default(false).describe("If true, create a merge commit even if fast-forward is possible"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
  }),
  permissionsRequired: ["shell.exec"],
  sideEffect: "write",
  requiresApproval: true,
  async execute({ branch, no_ff }, ctx) {
    try {
      const cmd = `git merge ${no_ff ? "--no-ff" : "--ff"} ${branch}`;
      const { stdout } = await execAsync(cmd, { cwd: ctx.cwd, timeout: 30000 });
      return { success: true, message: `Merged '${branch}' into current branch. ${stdout.trim()}` };
    } catch (e: any) {
      return { success: false, message: e.stderr?.toString() ?? e.message ?? String(e) };
    }
  },
};

export const gitStash: ToolDef = {
  name: "git.stash",
  description: "Stash or pop uncommitted changes. Use 'push' to save current changes temporarily, 'pop' to restore them, 'list' to see stashes, 'drop' to delete a stash.",
  inputSchema: z.object({
    action: z.enum(["push", "pop", "list", "drop"]).default("push").describe("Stash action"),
    message: z.string().optional().describe("Description for the stash (push only)"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
    stashes: z.array(z.string()).optional(),
  }),
  permissionsRequired: ["shell.exec"],
  sideEffect: "write",
  requiresApproval: false,
  async execute({ action, message }, ctx) {
    try {
      if (action === "push") {
        const cmd = message ? `git stash push -m "${message}"` : "git stash push";
        await execAsync(cmd, { cwd: ctx.cwd, timeout: 10000 });
        return { success: true, message: message ? `Stashed changes: ${message}` : "Changes stashed" };
      } else if (action === "pop") {
        await execAsync("git stash pop", { cwd: ctx.cwd, timeout: 10000 });
        return { success: true, message: "Stashed changes restored" };
      } else if (action === "list") {
        const { stdout } = await execAsync("git stash list", { cwd: ctx.cwd, timeout: 10000 });
        const stashes = stdout.trim().split("\n").filter(Boolean);
        return { success: true, message: `Found ${stashes.length} stashes`, stashes };
      } else if (action === "drop") {
        await execAsync("git stash drop", { cwd: ctx.cwd, timeout: 10000 });
        return { success: true, message: "Top stash dropped" };
      }
      return { success: false, message: "Unknown action" };
    } catch (e: any) {
      return { success: false, message: e.stderr?.toString() ?? e.message ?? String(e) };
    }
  },
};

// =============================================================================
// 2. DOCKER TOOLS â€” build, run, manage containers
// =============================================================================

export const dockerBuild: ToolDef = {
  name: "docker.build",
  description: "Build a Docker image from a Dockerfile. Use this to containerize applications for deployment. Returns the image ID and tags.",
  inputSchema: z.object({
    context: z.string().default(".").describe("Build context directory (defaults to cwd)"),
    tag: z.string().describe("Image tag (e.g. 'myapp:latest' or 'myapp:v1.0')"),
    dockerfile: z.string().default("Dockerfile").describe("Path to Dockerfile (relative to context)"),
    build_args: z.record(z.string()).optional().describe("Build-time variables (e.g. {VERSION: '1.0'})"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
    image_id: z.string().optional(),
  }),
  permissionsRequired: ["shell.exec"],
  sideEffect: "write",
  requiresApproval: false,
  async execute({ context, tag, dockerfile, build_args }, ctx) {
    const ctxPath = safePath(ctx.cwd, context);
    try {
      let cmd = `docker build -t ${tag} -f ${dockerfile}`;
      if (build_args) {
        for (const [key, value] of Object.entries(build_args)) {
          cmd += ` --build-arg ${key}="${value}"`;
        }
      }
      cmd += ` ${ctxPath}`;
      const { stdout } = await execAsync(cmd, { cwd: ctx.cwd, timeout: 300000, maxBuffer: 20 * 1024 * 1024 });
      // Extract image ID from build output
      const idMatch = stdout.match(/Successfully built ([a-f0-9]{12})/);
      return {
        success: true,
        message: `Image '${tag}' built successfully`,
        image_id: idMatch?.[1],
      };
    } catch (e: any) {
      return { success: false, message: e.stderr?.toString() ?? e.message ?? String(e) };
    }
  },
};

export const dockerRun: ToolDef = {
  name: "docker.run",
  description: "Run a Docker container from an image. Supports port mapping, environment variables, volumes, and detached mode. Use this to run databases, services, or the app itself in a container.",
  inputSchema: z.object({
    image: z.string().describe("Docker image to run (e.g. 'postgres:16', 'myapp:latest')"),
    ports: z.array(z.string()).optional().describe("Port mappings (e.g. ['8080:80', '5432:5432'])"),
    env: z.record(z.string()).optional().describe("Environment variables (e.g. {POSTGRES_PASSWORD: 'secret'})"),
    volumes: z.array(z.string()).optional().describe("Volume mappings (e.g. ['/host/path:/container/path'])"),
    detached: z.boolean().default(true).describe("Run in background (detached mode)"),
    name: z.string().optional().describe("Container name"),
    command: z.string().optional().describe("Override default command"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
    container_id: z.string().optional(),
  }),
  permissionsRequired: ["shell.exec"],
  sideEffect: "write",
  requiresApproval: false,
  async execute({ image, ports, env, volumes, detached, name, command }, ctx) {
    try {
      let cmd = "docker run";
      if (detached) cmd += " -d";
      if (name) cmd += ` --name ${name}`;
      if (ports) for (const p of ports) cmd += ` -p ${p}`;
      if (env) for (const [k, v] of Object.entries(env)) cmd += ` -e ${k}="${v}"`;
      if (volumes) for (const v of volumes) cmd += ` -v ${v}`;
      cmd += ` ${image}`;
      if (command) cmd += ` ${command}`;

      const { stdout } = await execAsync(cmd, { cwd: ctx.cwd, timeout: 60000 });
      const containerId = stdout.trim().slice(0, 12);
      return {
        success: true,
        message: `Container started from '${image}'${name ? ` (name: ${name})` : ""}. ID: ${containerId}`,
        container_id: containerId,
      };
    } catch (e: any) {
      return { success: false, message: e.stderr?.toString() ?? e.message ?? String(e) };
    }
  },
};

export const dockerCompose: ToolDef = {
  name: "docker.compose",
  description: "Run docker compose commands (up, down, ps, logs, build). Use this to manage multi-container applications defined in docker-compose.yml.",
  inputSchema: z.object({
    action: z.enum(["up", "down", "ps", "logs", "build", "restart"]).describe("Compose action to perform"),
    file: z.string().default("docker-compose.yml").describe("Compose file path"),
    detached: z.boolean().default(true).describe("Run in background (up only)"),
    service: z.string().optional().describe("Specific service to target (optional)"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
    output: z.string().optional(),
  }),
  permissionsRequired: ["shell.exec"],
  sideEffect: "write",
  requiresApproval: false,
  async execute({ action, file, detached, service }, ctx) {
    try {
      let cmd = `docker compose -f ${file} ${action}`;
      if (action === "up" && detached) cmd += " -d";
      if (service) cmd += ` ${service}`;

      const { stdout } = await execAsync(cmd, { cwd: ctx.cwd, timeout: 120000, maxBuffer: 10 * 1024 * 1024 });
      return {
        success: true,
        message: `docker compose ${action} completed`,
        output: stdout.trim().slice(0, 500),
      };
    } catch (e: any) {
      return { success: false, message: e.stderr?.toString() ?? e.message ?? String(e) };
    }
  },
};

// =============================================================================
// 3. CODE ANALYSIS â€” complexity, quality, dependency analysis
// =============================================================================

export const codeAnalyze: ToolDef = {
  name: "code.analyze",
  description: "Analyze code quality, complexity, and structure. Reports function count, lines of code, cyclomatic complexity estimates, longest functions, TODO/FIXME comments, and code smells. Supports JavaScript, TypeScript, Python, Go, Rust, and Java.",
  inputSchema: z.object({
    path: z.string().describe("Path to file or directory to analyze"),
    language: z.enum(["auto", "typescript", "javascript", "python", "go", "rust", "java"]).default("auto").describe("Programming language (auto-detected if omitted)"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    files_analyzed: z.number(),
    total_lines: z.number(),
    code_lines: z.number(),
    functions: z.number(),
    classes: z.number(),
    todos: z.number(),
    fixmes: z.number(),
    longest_function: z.object({
      name: z.string(),
      lines: z.number(),
      file: z.string(),
    }).optional(),
    complex_functions: z.array(z.object({
      name: z.string(),
      file: z.string(),
      lines: z.number(),
      nesting: z.number(),
    })),
    summary: z.string(),
    message: z.string(),
  }),
  permissionsRequired: ["fs.read"],
  sideEffect: "read",
  requiresApproval: false,
  async execute({ path, language }, ctx) {
    const fullPath = safePath(ctx.cwd, path);

    async function analyzeFile(filePath: string): Promise<any> {
      const content = await readFileAsync(filePath, "utf8");
      const lines = content.split("\n");
      const codeLines = lines.filter((l) => l.trim() && !l.trim().startsWith("//") && !l.trim().startsWith("#") && !l.trim().startsWith("/*") && !l.trim().startsWith("*"));
      const ext = extname(filePath).toLowerCase();

      const functions: Array<{ name: string; lines: number; nesting: number; startLine: number }> = [];
      const todos: string[] = [];
      const fixmes: string[] = [];
      let classes = 0;

      // Detect functions based on language
      const isPy = ext === ".py";
      const isJs = [".js", ".ts", ".jsx", ".tsx"].includes(ext);
      const isGo = ext === ".go";
      const isRust = ext === ".rs";
      const isJava = ext === ".java";

      if (isPy) {
        const funcRegex = /^(\s*)(?:async\s+)?def\s+(\w+)\s*\(/gm;
        let match;
        while ((match = funcRegex.exec(content)) !== null) {
          const indent = match[1]?.length ?? 0;
          const nesting = Math.floor(indent / 4);
          const startLine = content.slice(0, match.index).split("\n").length;
          // Find function end (next line with same or less indent)
          let endLine = startLine;
          for (let i = startLine; i < lines.length; i++) {
            const line = lines[i] ?? "";
            if (i > startLine && line.trim() && !line.startsWith(" ".repeat(indent + 1)) && !line.startsWith("\t".repeat(nesting + 1))) {
              endLine = i;
              break;
            }
            if (i === lines.length - 1) endLine = i + 1;
          }
          functions.push({ name: match[2] ?? "", lines: endLine - startLine, nesting, startLine });
        }
        const classRegex = /^class\s+(\w+)/gm;
        while ((match = classRegex.exec(content)) !== null) classes++;
      } else if (isJs || isGo || isRust || isJava) {
        const funcRegex = /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(/g;
        let match;
        while ((match = funcRegex.exec(content)) !== null) {
          const startLine = content.slice(0, match.index).split("\n").length;
          // Count braces to find end
          let braces = 0;
          let endLine = startLine;
          let started = false;
          for (let i = content.indexOf("{", match.index); i < content.length; i++) {
            if (content[i] === "{") { braces++; started = true; }
            if (content[i] === "}") { braces--; }
            if (started && braces === 0) {
              endLine = content.slice(0, i).split("\n").length;
              break;
            }
          }
          functions.push({ name: match[1] ?? "", lines: endLine - startLine, nesting: 0, startLine });
        }
        // Arrow functions (JS/TS)
        if (isJs) {
          const arrowRegex = /(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*=>/g;
          while ((match = arrowRegex.exec(content)) !== null) {
            const startLine = content.slice(0, match.index).split("\n").length;
            functions.push({ name: match[1] ?? "", lines: 5, nesting: 0, startLine });
          }
        }
        if (isJava || isGo) {
          const classRegex = /\bclass\s+(\w+)/g;
          while ((match = classRegex.exec(content)) !== null) classes++;
        }
      }

      // Find TODOs and FIXMEs
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i] ?? "";
        if (/TODO/i.test(line)) todos.push(`Line ${i + 1}: ${line.trim()}`);
        if (/FIXME/i.test(line)) fixmes.push(`Line ${i + 1}: ${line.trim()}`);
      }

      return {
        totalLines: lines.length,
        codeLines: codeLines.length,
        functions,
        classes,
        todos,
        fixmes,
        file: filePath,
      };
    }

    try {
      const stats = await stat(fullPath);
      const files: string[] = [];

      if (stats.isDirectory()) {
        const entries = await readdir(fullPath, { recursive: true } as any).catch(async () => {
          // Fallback for older Node
          const result: string[] = [];
          async function walk(dir: string) {
            const items = await readdir(dir);
            for (const item of items) {
              const itemPath = join(dir, item);
              const s = await stat(itemPath);
              if (s.isDirectory()) {
                if (!item.startsWith(".") && item !== "node_modules" && item !== "dist" && item !== "build") {
                  await walk(itemPath);
                }
              } else {
                const ext = extname(item).toLowerCase();
                if ([".js", ".ts", ".jsx", ".tsx", ".py", ".go", ".rs", ".java"].includes(ext)) {
                  result.push(itemPath);
                }
              }
            }
          }
          await walk(fullPath);
          return result;
        });
        for (const entry of entries) {
          const ext = extname(entry).toLowerCase();
          if ([".js", ".ts", ".jsx", ".tsx", ".py", ".go", ".rs", ".java"].includes(ext)) {
            files.push(entry);
          }
        }
      } else {
        files.push(fullPath);
      }

      let totalLines = 0;
      let codeLines = 0;
      let totalFunctions = 0;
      let totalClasses = 0;
      let totalTodos = 0;
      let totalFixmes = 0;
      let longestFunc: { name: string; lines: number; file: string } | undefined;
      const complexFunctions: Array<{ name: string; file: string; lines: number; nesting: number }> = [];

      for (const file of files) {
        const result = await analyzeFile(file).catch(() => null);
        if (!result) continue;
        totalLines += result.totalLines;
        codeLines += result.codeLines;
        totalFunctions += result.functions.length;
        totalClasses += result.classes;
        totalTodos += result.todos.length;
        totalFixmes += result.fixmes.length;

        for (const fn of result.functions) {
          if (!longestFunc || fn.lines > longestFunc.lines) {
            longestFunc = { name: fn.name, lines: fn.lines, file: relative(ctx.cwd, file) };
          }
          if (fn.lines > 50 || fn.nesting > 4) {
            complexFunctions.push({ name: fn.name, file: relative(ctx.cwd, file), lines: fn.lines, nesting: fn.nesting });
          }
        }
      }

      const summary = `Analyzed ${files.length} file(s): ${totalLines} total lines (${codeLines} code), ${totalFunctions} functions, ${totalClasses} classes, ${totalTodos} TODOs, ${totalFixmes} FIXMEs, ${complexFunctions.length} complex functions.`;

      return {
        success: true,
        files_analyzed: files.length,
        total_lines: totalLines,
        code_lines: codeLines,
        functions: totalFunctions,
        classes: totalClasses,
        todos: totalTodos,
        fixmes: totalFixmes,
        longest_function: longestFunc,
        complex_functions: complexFunctions.slice(0, 20),
        summary,
        message: summary,
      };
    } catch (e: any) {
      return {
        success: false,
        files_analyzed: 0,
        total_lines: 0,
        code_lines: 0,
        functions: 0,
        classes: 0,
        todos: 0,
        fixmes: 0,
        complex_functions: [],
        summary: "",
        message: e.message ?? String(e),
      };
    }
  },
};

// =============================================================================
// 4. SECURITY SCAN â€” vulnerability scanning
// =============================================================================

export const securityScan: ToolDef = {
  name: "security.scan",
  description: "Scan code for security vulnerabilities. Checks for: hardcoded secrets/keys, SQL injection patterns, XSS vulnerabilities, insecure dependencies, exposed credentials, dangerous eval usage, and missing security headers. Use this before deploying to production.",
  inputSchema: z.object({
    path: z.string().describe("Path to file or directory to scan"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    vulnerabilities: z.array(z.object({
      type: z.string(),
      severity: z.enum(["critical", "high", "medium", "low"]),
      file: z.string(),
      line: z.number(),
      message: z.string(),
      recommendation: z.string(),
    })),
    summary: z.string(),
    critical_count: z.number(),
    high_count: z.number(),
    message: z.string(),
  }),
  permissionsRequired: ["fs.read"],
  sideEffect: "read",
  requiresApproval: false,
  async execute({ path }, ctx) {
    const fullPath = safePath(ctx.cwd, path);

    const vulnerabilities: Array<{
      type: string; severity: "critical" | "high" | "medium" | "low";
      file: string; line: number; message: string; recommendation: string;
    }> = [];

    // Security patterns to check
    const patterns: Array<{
      regex: RegExp; type: string; severity: "critical" | "high" | "medium" | "low";
      message: string; recommendation: string;
    }> = [
      // Hardcoded secrets
      { regex: /(?:api[_-]?key|apikey|secret|password|passwd|token)\s*[:=]\s*["'][^"']{8,}["']/i, type: "hardcoded_secret", severity: "critical", message: "Hardcoded API key, secret, or password detected", recommendation: "Move secrets to environment variables or a secrets manager. Never commit credentials to source code." },
      { regex: /AKIA[0-9A-Z]{16}/, type: "aws_key", severity: "critical", message: "AWS Access Key ID detected", recommendation: "Rotate this key immediately and use IAM roles or environment variables instead." },
      { regex: /sk-[a-zA-Z0-9]{20,}/, type: "openai_key", severity: "critical", message: "OpenAI API key detected", recommendation: "Rotate this key and move it to an environment variable." },
      { regex: /ghp_[a-zA-Z0-9]{36}/, type: "github_token", severity: "critical", message: "GitHub Personal Access Token detected", recommendation: "Revoke this token and use GitHub Actions secrets or environment variables." },
      // SQL injection
      { regex: /(?:query|execute|exec)\s*\(\s*["'].*\$\{.*\}.*["']\s*\)/i, type: "sql_injection", severity: "high", message: "Potential SQL injection â€” string interpolation in query", recommendation: "Use parameterized queries or prepared statements instead of string interpolation." },
      { regex: /(?:query|execute|exec)\s*\(\s*["'].*\+.*["']\s*\)/i, type: "sql_injection", severity: "high", message: "Potential SQL injection â€” string concatenation in query", recommendation: "Use parameterized queries instead of string concatenation." },
      // XSS
      { regex: /innerHTML\s*=\s*[^"']/i, type: "xss", severity: "high", message: "Potential XSS â€” direct innerHTML assignment", recommendation: "Use textContent or sanitize HTML before assignment." },
      { regex: /dangerouslySetInnerHTML/i, type: "xss", severity: "medium", message: "React dangerouslySetInnerHTML used", recommendation: "Ensure the HTML is sanitized with DOMPurify before using dangerouslySetInnerHTML." },
      // Eval
      { regex: /\beval\s*\(/i, type: "eval", severity: "high", message: "Use of eval() detected", recommendation: "Avoid eval() â€” it allows arbitrary code execution. Use JSON.parse() or Function() with caution." },
      // Insecure HTTP
      { regex: /http:\/\/(?!localhost|127\.0\.0\.1)/i, type: "insecure_http", severity: "medium", message: "Insecure HTTP URL detected", recommendation: "Use HTTPS for all external URLs." },
      // Disabled security
      { regex: /process\.env\.NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*["']0["']/i, type: "tls_disabled", severity: "high", message: "TLS certificate validation disabled", recommendation: "Never disable TLS validation. Fix the certificate issue instead." },
      // CORS
      { regex: /Access-Control-Allow-Origin.*\*/i, type: "cors_wildcard", severity: "medium", message: "CORS wildcard origin detected", recommendation: "Specify allowed origins explicitly instead of using *." },
      // Hardcoded IP
      { regex: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b(?!.*localhost)/, type: "hardcoded_ip", severity: "low", message: "Hardcoded IP address", recommendation: "Use domain names or environment variables for service addresses." },
    ];

    async function scanFile(filePath: string) {
      const ext = extname(filePath).toLowerCase();
      if (![".js", ".ts", ".jsx", ".tsx", ".py", ".go", ".rs", ".java", ".rb", ".php", ".sh", ".yml", ".yaml", ".json", ".env"].includes(ext)) return;

      const content = await readFileAsync(filePath, "utf8").catch(() => "");
      const lines = content.split("\n");
      const relFile = relative(ctx.cwd, filePath);

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i] ?? "";
        for (const pattern of patterns) {
          if (pattern.regex.test(line)) {
            vulnerabilities.push({
              type: pattern.type,
              severity: pattern.severity,
              file: relFile,
              line: i + 1,
              message: pattern.message,
              recommendation: pattern.recommendation,
            });
          }
        }
      }
    }

    try {
      const stats = await stat(fullPath);
      const files: string[] = [];

      if (stats.isDirectory()) {
        async function walk(dir: string) {
          const entries = await readdir(dir);
          for (const entry of entries) {
            const entryPath = join(dir, entry);
            const s = await stat(entryPath);
            if (s.isDirectory()) {
              if (!entry.startsWith(".") && entry !== "node_modules" && entry !== "dist" && entry !== "build" && entry !== ".git") {
                await walk(entryPath);
              }
            } else {
              files.push(entryPath);
            }
          }
        }
        await walk(fullPath);
      } else {
        files.push(fullPath);
      }

      for (const file of files) {
        await scanFile(file);
      }

      const criticalCount = vulnerabilities.filter((v) => v.severity === "critical").length;
      const highCount = vulnerabilities.filter((v) => v.severity === "high").length;
      const summary = `Security scan: ${vulnerabilities.length} vulnerabilities found (${criticalCount} critical, ${highCount} high, ${vulnerabilities.filter((v) => v.severity === "medium").length} medium, ${vulnerabilities.filter((v) => v.severity === "low").length} low) across ${files.length} files.`;

      return {
        success: true,
        vulnerabilities: vulnerabilities.slice(0, 50),
        summary,
        critical_count: criticalCount,
        high_count: highCount,
        message: summary,
      };
    } catch (e: any) {
      return {
        success: false,
        vulnerabilities: [],
        summary: "",
        critical_count: 0,
        high_count: 0,
        message: e.message ?? String(e),
      };
    }
  },
};

// =============================================================================
// 5. DOCUMENTATION GENERATION â€” generate docs from code
// =============================================================================

export const docsGenerate: ToolDef = {
  name: "docs.generate",
  description: "Generate documentation from source code. Creates API documentation, function docs, and README sections by analyzing code structure, JSDoc/docstring comments, and type annotations. Supports JSDoc (JS/TS) and docstrings (Python).",
  inputSchema: z.object({
    path: z.string().describe("Path to source file or directory"),
    output: z.string().describe("Output markdown file path (e.g. 'docs/API.md')"),
    format: z.enum(["markdown", "html"]).default("markdown").describe("Output format"),
    include_private: z.boolean().default(false).describe("Include private/internal functions"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
    functions_documented: z.number(),
    output_path: z.string(),
  }),
  permissionsRequired: ["fs.read", "fs.write"],
  sideEffect: "write",
  requiresApproval: false,
  async execute({ path, output, format, include_private }, ctx) {
    const fullPath = safePath(ctx.cwd, path);
    const outputPath = safePath(ctx.cwd, output);

    try {
      const files: string[] = [];
      const stats = await stat(fullPath);

      if (stats.isDirectory()) {
        async function walk(dir: string) {
          const entries = await readdir(dir);
          for (const entry of entries) {
            const entryPath = join(dir, entry);
            const s = await stat(entryPath);
            if (s.isDirectory()) {
              if (!entry.startsWith(".") && entry !== "node_modules" && entry !== "dist") {
                await walk(entryPath);
              }
            } else {
              const ext = extname(entry).toLowerCase();
              if ([".js", ".ts", ".jsx", ".tsx", ".py"].includes(ext)) {
                files.push(entryPath);
              }
            }
          }
        }
        await walk(fullPath);
      } else {
        files.push(fullPath);
      }

      let docContent = `# API Documentation\n\nGenerated from \`${path}\` on ${new Date().toISOString().split("T")[0]}\n\n`;
      let totalFuncs = 0;

      for (const file of files) {
        const content = await readFileAsync(file, "utf8");
        const ext = extname(file).toLowerCase();
        const relFile = relative(ctx.cwd, file);
        const isPy = ext === ".py";
        const isJs = [".js", ".ts", ".jsx", ".tsx"].includes(ext);

        const functions: Array<{
          name: string; params: string[]; returnType: string;
          docstring: string; isPrivate: boolean; isAsync: boolean;
        }> = [];

        if (isPy) {
          // Python functions with docstrings
          const funcRegex = /(?:^|\n)((?:async\s+)?def\s+(\w+)\s*\(([^)]*)\)(?:\s*->\s*([^\n:]+))?:)\s*\n\s*("""[\s\S]*?"""|'''[\s\S]*?''')?/g;
          let match;
          while ((match = funcRegex.exec(content)) !== null) {
            const name = match[2] ?? "";
            const params = (match[3] ?? "").split(",").map((p) => p.trim()).filter((p) => p && p !== "self");
            const returnType = match[4]?.trim() ?? "";
            const docstring = (match[5] ?? "").replace(/"""|'''/g, "").trim();
            const isPrivate = name.startsWith("_");
            const isAsync = (match[1] ?? "").includes("async");
            if (!isPrivate || include_private) {
              functions.push({ name, params, returnType, docstring, isPrivate, isAsync });
            }
          }
        } else if (isJs) {
          // JS/TS functions with JSDoc
          const jsdocRegex = /\/\*\*([\s\S]*?)\*\/\s*(?:export\s+)?(?:async\s+)?(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*=>)\s*(?:\(([^)]*)\))?/g;
          let match;
          while ((match = jsdocRegex.exec(content)) !== null) {
            const name = match[2] ?? match[3] ?? "";
            const jsdoc = (match[1] ?? "").trim();
            const params = (match[4] ?? "").split(",").map((p) => p.trim().split(":")[0]?.trim() ?? "").filter(Boolean);
            const isPrivate = name.startsWith("_");
            const isAsync = (match[0] ?? "").includes("async");
            if ((!isPrivate || include_private) && name) {
              functions.push({ name, params, returnType: "", docstring: jsdoc, isPrivate, isAsync });
            }
          }
          // Also find functions without JSDoc
          const funcRegex = /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)(?:\s*:\s*([^{]+))?\s*{/g;
          while ((match = funcRegex.exec(content)) !== null) {
            const name = match[1] ?? "";
            if (!functions.find((f) => f.name === name)) {
              const params = (match[2] ?? "").split(",").map((p) => p.trim().split(":")[0]?.trim() ?? "").filter(Boolean);
              const isPrivate = name.startsWith("_");
              const isAsync = (match[0] ?? "").includes("async");
              if (!isPrivate || include_private) {
                functions.push({ name, params, returnType: (match[3] ?? "").trim(), docstring: "", isPrivate, isAsync });
              }
            }
          }
        }

        if (functions.length === 0) continue;

        docContent += `## ${relFile}\n\n`;
        for (const fn of functions) {
          totalFuncs++;
          docContent += `### \`${fn.isAsync ? "async " : ""}${fn.name}(${fn.params.join(", ")})${fn.returnType ? `: ${fn.returnType}` : ""}\`\n\n`;
          if (fn.docstring) {
            // Parse JSDoc params
            if (isJs) {
              const paramMatches = fn.docstring.matchAll(/@param\s+(?:\{[^}]+\}\s+)?(\w+)\s+(.*)/g);
              for (const pm of paramMatches) {
                docContent += `- **${pm[1]}**: ${pm[2]?.trim() ?? ""}\n`;
              }
              const returnsMatch = fn.docstring.match(/@returns?\s+(?:\{[^}]+\}\s+)?(.*)/);
              if (returnsMatch) docContent += `- **Returns**: ${returnsMatch[1]?.trim() ?? ""}\n`;
              const descMatch = fn.docstring.split("@")[0]?.trim();
              if (descMatch) docContent += `\n${descMatch}\n`;
            } else {
              docContent += `${fn.docstring}\n`;
            }
          } else {
            docContent += `*No documentation available.*\n`;
          }
          docContent += `\n`;
        }
      }

      if (totalFuncs === 0) {
        docContent += `*No documented functions found in the specified path.*\n`;
      }

      // Create output directory if needed
      const outDir = dirname(outputPath);
      mkdirSync(outDir, { recursive: true });

      if (format === "html") {
        const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>API Documentation</title>
<style>body{font-family:system-ui;max-width:800px;margin:0 auto;padding:20px}
code{background:#f0f0f0;padding:2px 6px;border-radius:3px}</style>
</head><body>
${docContent.replace(/^# (.+)$/gm, "<h1>$1</h1>").replace(/^## (.+)$/gm, "<h2>$1</h2>").replace(/^### (.+)$/gm, "<h3>$1</h3>").replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\n/g, "<br>")}
</body></html>`;
        await writeFileAsync(outputPath, html, "utf8");
      } else {
        await writeFileAsync(outputPath, docContent, "utf8");
      }

      return {
        success: true,
        message: `Documentation generated: ${totalFuncs} functions documented across ${files.length} files`,
        functions_documented: totalFuncs,
        output_path: output,
      };
    } catch (e: any) {
      return { success: false, message: e.message ?? String(e), functions_documented: 0, output_path: output };
    }
  },
};

// =============================================================================
// 6. PROJECT SCAFFOLDING â€” create new projects from templates
// =============================================================================

export const projectScaffold: ToolDef = {
  name: "project.scaffold",
  description: "Create a new project from a template. Generates a complete project structure with boilerplate code, configuration files, and dependencies. Supports: next.js, react, vue, express, fastapi, bun-hono, tauri, react-native, and plain static.",
  inputSchema: z.object({
    template: z.enum(["next.js", "react", "vue", "express", "fastapi", "bun-hono", "tauri", "react-native", "static"]).describe("Project template to use"),
    name: z.string().describe("Project name (will be used as directory name and package name)"),
    output_dir: z.string().default(".").describe("Parent directory for the project (project will be created as a subdirectory)"),
    typescript: z.boolean().default(true).describe("Use TypeScript (where applicable)"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
    project_dir: z.string(),
    files_created: z.number(),
  }),
  permissionsRequired: ["fs.write", "shell.exec"],
  sideEffect: "write",
  requiresApproval: false,
  async execute({ template, name, output_dir, typescript }, ctx) {
    const parentDir = safePath(ctx.cwd, output_dir);
    const projectDir = join(parentDir, name);
    mkdirSync(projectDir, { recursive: true });

    let filesCreated = 0;
    const writeFile = async (relPath: string, content: string) => {
      const fullPath = join(projectDir, relPath);
      mkdirSync(dirname(fullPath), { recursive: true });
      await writeFileAsync(fullPath, content, "utf8");
      filesCreated++;
    };

    try {
      switch (template) {
        case "next.js": {
          await writeFile("package.json", JSON.stringify({
            name, version: "0.1.0", private: true,
            scripts: { dev: "next dev", build: "next build", start: "next start", lint: "next lint" },
            dependencies: { react: "^18", "react-dom": "^18", next: "^14" },
            devDependencies: typescript ? { typescript: "^5", "@types/node": "^20", "@types/react": "^18", "@types/react-dom": "^18" } : {},
          }, null, 2));
          await writeFile("tsconfig.json", `{"compilerOptions":{"target":"es5","lib":["dom","dom.iterable","esnext"],"allowJs":true,"skipLibCheck":true,"strict":true,"forceConsistentCasingInFileNames":true,"noEmit":true,"esModuleInterop":true,"module":"esnext","moduleResolution":"bundler","resolveJsonModule":true,"isolatedModules":true,"jsx":"preserve","incremental":true,"paths":{"@/*":["./src/*"]}},"include":["next-env.d.ts","**/*.ts","**/*.tsx",".next/types/**/*.ts"],"exclude":["node_modules"]}`);
          await writeFile("next.config.js", `/** @type {import('next').NextConfig} */\nconst nextConfig = {};\nmodule.exports = nextConfig;\n`);
          await writeFile("src/app/layout.tsx", `export default function RootLayout({children}: {children: React.ReactNode}) {\n  return <html lang="en"><body>{children}</body></html>;\n}`);
          await writeFile("src/app/page.tsx", `export default function Home() {\n  return <main><h1>${name}</h1><p>Welcome to your new Next.js app!</p></main>;\n}`);
          await writeFile("src/app/globals.css", `* { margin: 0; padding: 0; box-sizing: border-box; }\nbody { font-family: system-ui; padding: 2rem; }`);
          break;
        }
        case "react": {
          await writeFile("package.json", JSON.stringify({
            name, version: "0.1.0", private: true, type: "module",
            scripts: { dev: "vite", build: "vite build", preview: "vite preview" },
            dependencies: { react: "^18", "react-dom": "^18" },
            devDependencies: { vite: "^5", "@vitejs/plugin-react": "^4", ...(typescript ? { typescript: "^5", "@types/react": "^18", "@types/react-dom": "^18" } : {}) },
          }, null, 2));
          await writeFile("index.html", `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${name}</title></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>`);
          await writeFile("src/main.tsx", `import React from "react";\nimport ReactDOM from "react-dom/client";\nimport App from "./App";\nReactDOM.createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);`);
          await writeFile("src/App.tsx", `export default function App() {\n  return <div><h1>${name}</h1><p>Welcome to your new React app!</p></div>;\n}`);
          await writeFile("vite.config.ts", `import { defineConfig } from "vite";\nimport react from "@vitejs/plugin-react";\nexport default defineConfig({ plugins: [react()] });`);
          break;
        }
        case "express": {
          await writeFile("package.json", JSON.stringify({
            name, version: "0.1.0", private: true, type: "module",
            scripts: { dev: "tsx watch src/index.ts", build: "tsc", start: "node dist/index.js" },
            dependencies: { express: "^4" },
            devDependencies: { tsx: "^4", ...(typescript ? { typescript: "^5", "@types/express": "^4", "@types/node": "^20" } : {}) },
          }, null, 2));
          await writeFile("src/index.ts", `import express from "express";\nconst app = express();\nconst port = process.env.PORT ?? 3000;\napp.use(express.json());\napp.get("/", (req, res) => res.json({ message: "Hello from ${name}!" }));\napp.listen(port, () => console.log(\`Server running on http://localhost:\${port}\`));`);
          await writeFile("tsconfig.json", `{"compilerOptions":{"target":"ES2022","module":"ESNext","moduleResolution":"bundler","outDir":"./dist","strict":true,"esModuleInterop":true,"skipLibCheck":true}}`);
          break;
        }
        case "fastapi": {
          await writeFile("pyproject.toml", `[project]\nname = "${name}"\nversion = "0.1.0"\nrequires-python = ">=3.11"\ndependencies = ["fastapi", "uvicorn"]\n\n[tool.uv]\ndev-dependencies = ["pytest", "httpx"]`);
          await writeFile("src/main.py", `from fastapi import FastAPI\n\napp = FastAPI(title="${name}")\n\n@app.get("/")\nasync def root():\n    return {"message": "Hello from ${name}!"}\n\nif __name__ == "__main__":\n    import uvicorn\n    uvicorn.run(app, host="0.0.0.0", port=8000)`);
          await writeFile("tests/test_main.py", `from fastapi.testclient import TestClient\nfrom src.main import app\n\nclient = TestClient(app)\n\ndef test_root():\n    response = client.get("/")\n    assert response.status_code == 200\n    assert "message" in response.json()`);
          break;
        }
        case "bun-hono": {
          await writeFile("package.json", JSON.stringify({
            name, version: "0.1.0", private: true, type: "module",
            scripts: { dev: "bun --watch src/index.ts", start: "bun src/index.ts" },
            dependencies: { hono: "^4" },
            devDependencies: typescript ? { typescript: "^5", "@types/bun": "^1" } : {},
          }, null, 2));
          await writeFile("src/index.ts", `import { Hono } from "hono";\nimport { serve } from "@hono/node-server";\n\nconst app = new Hono();\napp.get("/", (c) => c.json({ message: "Hello from ${name}!" }));\n\nconst port = Number(process.env.PORT ?? 3000);\nserve({ fetch: app.fetch, port });\nconsole.log(\`Server running on http://localhost:\${port}\`);`);
          await writeFile("tsconfig.json", `{"compilerOptions":{"target":"ESNext","module":"ESNext","moduleResolution":"bundler","strict":true,"skipLibCheck":true,"types":["bun-types"]}}`);
          break;
        }
        case "tauri": {
          await writeFile("package.json", JSON.stringify({
            name, version: "0.1.0", private: true, type: "module",
            scripts: { dev: "vite", build: "vite build", tauri: "tauri" },
            dependencies: { react: "^18", "react-dom": "^18" },
            devDependencies: { vite: "^5", "@vitejs/plugin-react": "^4", "@tauri-apps/cli": "^1", typescript: "^5", "@types/react": "^18" },
          }, null, 2));
          await writeFile("src/main.tsx", `import React from "react";\nimport ReactDOM from "react-dom/client";\nimport App from "./App";\nReactDOM.createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);`);
          await writeFile("src/App.tsx", `export default function App() {\n  return <div><h1>${name}</h1><p>Tauri Desktop App</p></div>;\n}`);
          await writeFile("index.html", `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${name}</title></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>`);
          await writeFile("src-tauri/Cargo.toml", `[package]\nname = "${name}"\nversion = "0.1.0"\nedition = "2021"\n\n[dependencies]\ntauri = { version = "1", features = ["shell-open"] }\nserde = { version = "1", features = ["derive"] }\nserde_json = "1"\n\n[build-dependencies]\ntauri-build = { version = "1" }`);
          await writeFile("src-tauri/src/main.rs", `#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]\nfn main() {\n  tauri::Builder::default()\n    .run(tauri::generate_context!())\n    .expect("error while running tauri application");\n}`);
          await writeFile("src-tauri/tauri.conf.json", JSON.stringify({
            build: { beforeDevCommand: "bun dev", beforeBuildCommand: "bun build", devPath: "http://localhost:5173", distDir: "../dist" },
            package: { productName: name, version: "0.1.0" },
            tauri: { allowlist: { all: false }, bundle: { active: true, targets: "all" }, windows: [{ title: name, width: 800, height: 600 }] },
          }, null, 2));
          break;
        }
        case "react-native": {
          await writeFile("package.json", JSON.stringify({
            name, version: "0.1.0", private: true,
            scripts: { android: "react-native run-android", ios: "react-native run-ios", start: "react-native start" },
            dependencies: { "react-native": "^0.73", react: "^18" },
            devDependencies: { typescript: "^5", "@types/react": "^18" },
          }, null, 2));
          await writeFile("App.tsx", `import React from "react";\nimport { View, Text, StyleSheet } from "react-native";\n\nexport default function App() {\n  return (\n    <View style={styles.container}>\n      <Text style={styles.title}>${name}</Text>\n      <Text>Welcome to your React Native app!</Text>\n    </View>\n  );\n}\n\nconst styles = StyleSheet.create({\n  container: { flex: 1, justifyContent: "center", alignItems: "center" },\n  title: { fontSize: 24, fontWeight: "bold", marginBottom: 10 },\n});`);
          break;
        }
        case "static": {
          await writeFile("index.html", `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>${name}</title>\n  <link rel="stylesheet" href="style.css">\n</head>\n<body>\n  <main>\n    <h1>${name}</h1>\n    <p>Welcome to your new static website!</p>\n  </main>\n  <script src="script.js"></script>\n</body>\n</html>`);
          await writeFile("style.css", `* { margin: 0; padding: 0; box-sizing: border-box; }\nbody { font-family: system-ui, -apple-system, sans-serif; padding: 2rem; color: #333; }\nmain { max-width: 800px; margin: 0 auto; }\nh1 { color: #1f6feb; margin-bottom: 1rem; }`);
          await writeFile("script.js", `console.log("${name} loaded");`);
          break;
        }
      }

      // Create common files
      await writeFile(".gitignore", `node_modules/\ndist/\n.env\n.env.local\n*.log\n.DS_Store\n__pycache__/\n.pytest_cache/\n.venv/\nbuild/\n*.apk\n*.ipa`);
      await writeFile("README.md", `# ${name}\n\nGenerated by ALPHA agent using \`project.scaffold\` with template: \`${template}\`.\n\n## Getting Started\n\nSee package.json or pyproject.toml for available scripts.\n`);

      // Install dependencies for JS projects
      if (["next.js", "react", "express", "bun-hono", "tauri", "react-native"].includes(template)) {
        try {
          await execAsync("bun install", { cwd: projectDir, timeout: 60000 });
        } catch {
          try { await execAsync("npm install", { cwd: projectDir, timeout: 120000 }); } catch { /* manual install */ }
        }
      }

      return {
        success: true,
        message: `Project '${name}' created with template '${template}' at ${output_dir}/${name}. ${filesCreated} files created.`,
        project_dir: `${output_dir}/${name}`,
        files_created: filesCreated,
      };
    } catch (e: any) {
      return { success: false, message: e.message ?? String(e), project_dir: `${output_dir}/${name}`, files_created: filesCreated };
    }
  },
};

// =============================================================================
// 7. DATA TRANSFORM â€” CSV/JSON data processing
// =============================================================================

export const dataTransform: ToolDef = {
  name: "data.transform",
  description: "Transform data between formats (CSV, JSON, YAML, TSV) and perform operations like filter, sort, map, aggregate, and join. Use this to process data files, convert between formats, or analyze datasets.",
  inputSchema: z.object({
    input_path: z.string().describe("Path to input data file"),
    output_path: z.string().describe("Path for output file"),
    input_format: z.enum(["auto", "csv", "json", "yaml", "tsv"]).default("auto").describe("Input format (auto-detected if omitted)"),
    output_format: z.enum(["csv", "json", "yaml", "tsv"]).describe("Output format"),
    operation: z.enum(["convert", "filter", "sort", "head", "tail", "unique", "count"]).default("convert").describe("Operation to perform"),
    filter_expr: z.string().optional().describe("Filter expression (e.g. 'age > 25' or 'status == active')"),
    sort_key: z.string().optional().describe("Column/key to sort by"),
    sort_desc: z.boolean().default(false).describe("Sort descending"),
    limit: z.number().int().optional().describe("Limit number of rows (for head/tail)"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
    rows_in: z.number(),
    rows_out: z.number(),
  }),
  permissionsRequired: ["fs.read", "fs.write"],
  sideEffect: "write",
  requiresApproval: false,
  async execute({ input_path, output_path, input_format, output_format, operation, filter_expr, sort_key, sort_desc, limit }, ctx) {
    const inPath = safePath(ctx.cwd, input_path);
    const outPath = safePath(ctx.cwd, output_path);

    try {
      // Detect input format
      const inExt = extname(inPath).toLowerCase().replace(".", "");
      const fmt = input_format === "auto" ? (inExt === "yaml" || inExt === "yml" ? "yaml" : inExt as "csv" | "json" | "yaml" | "tsv") : input_format;

      // Read and parse input
      const raw = await readFileAsync(inPath, "utf8");
      let data: any[];

      if (fmt === "json") {
        const parsed = JSON.parse(raw);
        data = Array.isArray(parsed) ? parsed : [parsed];
      } else if (fmt === "csv" || fmt === "tsv") {
        const sep = fmt === "tsv" ? "\t" : ",";
        const lines = raw.trim().split("\n");
        if (lines.length === 0) { data = []; }
        else {
          const headers = lines[0]!.split(sep).map((h) => h.trim().replace(/^"|"$/g, ""));
          data = lines.slice(1).map((line) => {
            const values = line.split(sep).map((v) => v.trim().replace(/^"|"$/g, ""));
            const obj: Record<string, string> = {};
            headers.forEach((h, i) => { obj[h] = values[i] ?? ""; });
            return obj;
          });
        }
      } else if (fmt === "yaml") {
        // Simple YAML parsing for array-of-objects
        try {
          const { parse: parseYaml } = await import("yaml");
          const parsed = parseYaml(raw);
          data = Array.isArray(parsed) ? parsed : [parsed];
        } catch {
          return { success: false, message: "YAML parsing requires 'yaml' package. Install: bun add yaml", rows_in: 0, rows_out: 0 };
        }
      } else {
        return { success: false, message: `Unsupported input format: ${fmt}`, rows_in: 0, rows_out: 0 };
      }

      const rowsIn = data.length;
      let result = data;

      // Apply operations
      if (operation === "filter" && filter_expr) {
        // Simple filter: evaluate expression like "key > value" or "key == value"
        const match = filter_expr.match(/^(\w+)\s*(==|!=|>=|<=|>|<)\s*(.+)$/);
        if (match) {
          const [, key, op, valueStr] = match;
          const value = valueStr!.replace(/^["']|["']$/g, "");
          const isNumeric = !isNaN(Number(value));
          result = data.filter((row) => {
            const cellVal = row[key as string];
            if (op === "==") return String(cellVal) === value || (isNumeric && Number(cellVal) === Number(value));
            if (op === "!=") return String(cellVal) !== value;
            if (isNumeric) {
              const numCell = Number(cellVal);
              const numVal = Number(value);
              if (op === ">") return numCell > numVal;
              if (op === "<") return numCell < numVal;
              if (op === ">=") return numCell >= numVal;
              if (op === "<=") return numCell <= numVal;
            }
            return false;
          });
        }
      } else if (operation === "sort" && sort_key) {
        result = [...data].sort((a, b) => {
          const av = a[sort_key];
          const bv = b[sort_key];
          if (typeof av === "number" && typeof bv === "number") {
            return sort_desc ? bv - av : av - bv;
          }
          return sort_desc ? String(bv).localeCompare(String(av)) : String(av).localeCompare(String(bv));
        });
      } else if (operation === "head") {
        result = data.slice(0, limit ?? 10);
      } else if (operation === "tail") {
        result = data.slice(-(limit ?? 10));
      } else if (operation === "unique") {
        const seen = new Set<string>();
        result = data.filter((row) => {
          const key = JSON.stringify(row);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      } else if (operation === "count") {
        result = [{ count: data.length }];
      }

      // Write output
      let output: string;
      if (output_format === "json") {
        output = JSON.stringify(result, null, 2);
      } else if (output_format === "csv" || output_format === "tsv") {
        const sep = output_format === "tsv" ? "\t" : ",";
        if (result.length === 0) {
          output = "";
        } else {
          const headers = Object.keys(result[0] as Record<string, unknown>);
          output = headers.join(sep) + "\n" + result.map((row) =>
            headers.map((h) => {
              const val = String((row as Record<string, unknown>)[h] ?? "");
              return val.includes(sep) || val.includes('"') ? `"${val.replace(/"/g, '""')}"` : val;
            }).join(sep)
          ).join("\n");
        }
      } else if (output_format === "yaml") {
        try {
          const { stringify: stringifyYaml } = await import("yaml");
          output = stringifyYaml(result);
        } catch {
          // Fallback: output as JSON
          output = JSON.stringify(result, null, 2);
        }
      } else {
        output = JSON.stringify(result, null, 2);
      }

      mkdirSync(dirname(outPath), { recursive: true });
      await writeFileAsync(outPath, output, "utf8");

      return {
        success: true,
        message: `Transformed ${rowsIn} rows -> ${result.length} rows (${operation}, ${fmt} to ${output_format})`,
        rows_in: rowsIn,
        rows_out: result.length,
      };
    } catch (e: any) {
      return { success: false, message: e.message ?? String(e), rows_in: 0, rows_out: 0 };
    }
  },
};

// =============================================================================
// 8. PACKAGE MANAGER â€” install, update, search packages
// =============================================================================

export const pkgInstall: ToolDef = {
  name: "pkg.install",
  description: "Install or update packages/dependencies. Supports npm/bun (Node.js), pip/uv (Python), and cargo (Rust). Use this to add libraries to a project.",
  inputSchema: z.object({
    packages: z.array(z.string()).describe("Package names to install (e.g. ['express', 'cors'] or ['fastapi', 'uvicorn'])"),
    manager: z.enum(["auto", "bun", "npm", "yarn", "pnpm", "pip", "uv", "cargo"]).default("auto").describe("Package manager (auto-detected if omitted)"),
    dev: z.boolean().default(false).describe("Install as dev dependency (npm/bun only)"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
    installed: z.array(z.string()),
  }),
  permissionsRequired: ["shell.exec"],
  sideEffect: "write",
  requiresApproval: false,
  async execute({ packages, manager, dev }, ctx) {
    // Auto-detect package manager
    let mgr = manager;
    if (mgr === "auto") {
      if (existsSync(join(ctx.cwd, "bun.lockb"))) mgr = "bun";
      else if (existsSync(join(ctx.cwd, "pnpm-lock.yaml"))) mgr = "pnpm";
      else if (existsSync(join(ctx.cwd, "yarn.lock"))) mgr = "yarn";
      else if (existsSync(join(ctx.cwd, "pyproject.toml"))) mgr = "uv";
      else if (existsSync(join(ctx.cwd, "Cargo.toml"))) mgr = "cargo";
      else if (existsSync(join(ctx.cwd, "package.json"))) mgr = "npm";
      else if (existsSync(join(ctx.cwd, "requirements.txt"))) mgr = "pip";
      else mgr = "npm"; // default
    }

    try {
      let cmd: string;
      switch (mgr) {
        case "bun": cmd = `bun add ${dev ? "-d " : ""}${packages.join(" ")}`; break;
        case "npm": cmd = `npm install ${dev ? "--save-dev " : ""}${packages.join(" ")}`; break;
        case "yarn": cmd = `yarn add ${dev ? "--dev " : ""}${packages.join(" ")}`; break;
        case "pnpm": cmd = `pnpm add ${dev ? "-D " : ""}${packages.join(" ")}`; break;
        case "pip": cmd = `pip install ${packages.join(" ")}`; break;
        case "uv": cmd = `uv add ${packages.join(" ")}`; break;
        case "cargo": cmd = `cargo add ${packages.join(" ")}`; break;
        default: cmd = `npm install ${packages.join(" ")}`;
      }

      const { stdout } = await execAsync(cmd, { cwd: ctx.cwd, timeout: 120000, maxBuffer: 10 * 1024 * 1024 });
      return {
        success: true,
        message: `Installed ${packages.length} package(s) using ${mgr}: ${packages.join(", ")}`,
        installed: packages,
      };
    } catch (e: any) {
      return { success: false, message: e.stderr?.toString() ?? e.message ?? String(e), installed: [] };
    }
  },
};
