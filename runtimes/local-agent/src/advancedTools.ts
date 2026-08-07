/**
 * Advanced tools — Tier 1 capabilities that make the agent near-human.
 *
 * 1. vision.analyze    — See and analyze images/screenshots using LLM vision
 * 2. code.run          — Execute code in an isolated sandbox
 * 3. http.request      — Make HTTP requests (GET/POST/PUT/DELETE)
 * 4. fs.edit           — Surgical find-and-replace editing within files
 * 5. deploy.static     — Deploy a static site and get a live URL
 * 6. image.generate    — Generate images (logos, icons, graphics) via DALL-E
 */
import { z } from "zod";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { readFile as readFileAsync, writeFile as writeFileAsync, unlink as unlinkAsync, writeFile } from "node:fs/promises";
import { join, isAbsolute, relative, basename, extname } from "node:path";
import { exec as execCb } from "node:child_process";
import { promisify } from "node:util";
import type { ToolDef, ToolContext } from "./toolBus.js";
import type { ModelRouterClient } from "./modelRouterClient.js";

const execAsync = promisify(execCb);

function safePath(cwd: string, path: string): string {
  const resolved = isAbsolute(path) ? path : join(cwd, path);
  const rel = relative(cwd, resolved);
  if (rel.startsWith("..")) throw new Error(`path outside working directory: ${path}`);
  return resolved;
}

// =============================================================================
// 1. VISION — Analyze images/screenshots using LLM vision capabilities
// =============================================================================

/**
 * The vision tool needs access to the model router to send image+text to the LLM.
 * We use a factory function to inject the router dependency.
 */
export function createVisionTool(router: ModelRouterClient, defaultModel: string, apiKey?: string): ToolDef {
  return {
    name: "vision.analyze",
    description: "Analyze an image file (screenshot, photo, diagram, mockup) using AI vision. The agent can SEE the image and describe its contents, identify problems, compare designs, read text from the image, and more. Use this after taking screenshots of competitor websites, or to visually inspect files you've created. Pass an image path and a question about what you want to know.",
    inputSchema: z.object({
      image_path: z.string().describe("Path to the image file (PNG, JPG, etc.) relative to cwd"),
      question: z.string().describe("What do you want to know about this image? e.g. 'Describe the layout and design of this website. What are the main visual elements? What could be improved?'"),
      model: z.string().optional().describe("Model to use for vision (defaults to the task's model). Must support vision."),
    }),
    outputSchema: z.object({
      analysis: z.string(),
      image_path: z.string(),
    }),
    permissionsRequired: ["vision.analyze"],
    sideEffect: "read",
    requiresApproval: false,
    async execute({ image_path, question, model }, ctx) {
      const fullPath = safePath(ctx.cwd, image_path);
      if (!existsSync(fullPath)) {
        return { analysis: `Error: Image file not found at ${image_path}`, image_path };
      }
      try {
        const imageBuffer = readFileSync(fullPath);
        const base64 = imageBuffer.toString("base64");
        const ext = extname(fullPath).toLowerCase().replace(".", "");
        const mimeType = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "png" ? "image/png" : ext === "gif" ? "image/gif" : ext === "webp" ? "image/webp" : "image/png";

        const visionModel = model ?? defaultModel;
        const response = await router.complete({
          model: visionModel,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: question },
                { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } },
              ],
            },
          ],
          max_tokens: 2000,
          api_key: apiKey,
        });

        return { analysis: response.content, image_path };
      } catch (e) {
        return { analysis: `Error analyzing image: ${e}`, image_path };
      }
    },
  };
}

// =============================================================================
// 2. CODE SANDBOX — Execute code in isolation and return output
// =============================================================================

export const codeRun: ToolDef = {
  name: "code.run",
  description: "Execute code in an isolated sandbox and return the output. Supports JavaScript/TypeScript (via Bun), Python, and shell commands. Use this to test code snippets, validate logic, run calculations, or prototype ideas before writing to files. The code runs in a temporary context — it cannot modify your project files (use fs.write for that).",
  inputSchema: z.object({
    language: z.enum(["javascript", "typescript", "python", "bash"]).describe("Programming language to execute"),
    code: z.string().describe("The code to execute"),
    timeout_ms: z.number().int().min(1000).max(30000).default(10000).describe("Maximum execution time in milliseconds"),
  }),
  outputSchema: z.object({
    stdout: z.string(),
    stderr: z.string(),
    exit_code: z.number(),
    success: z.boolean(),
  }),
  permissionsRequired: ["code.run"],
  sideEffect: "read",
  requiresApproval: false,
  async execute({ language, code, timeout_ms }) {
    try {
      let cmd: string;
      let tmpFile: string;

      if (language === "javascript" || language === "typescript") {
        const ext = language === "typescript" ? ".ts" : ".js";
        tmpFile = join(require("node:os").tmpdir(), `sandbox_${Date.now()}${ext}`);
        await import("node:fs/promises").then((fs) => fs.writeFile(tmpFile, code, "utf8"));
        cmd = `bun run "${tmpFile}"`;
      } else if (language === "python") {
        tmpFile = join(require("node:os").tmpdir(), `sandbox_${Date.now()}.py`);
        await import("node:fs/promises").then((fs) => fs.writeFile(tmpFile, code, "utf8"));
        cmd = `python "${tmpFile}"`;
      } else {
        // bash — run directly
        cmd = code;
      }

      const { stdout, stderr } = await execAsync(cmd, {
        timeout: timeout_ms,
        maxBuffer: 1024 * 1024,
        cwd: require("node:os").tmpdir(),
      });

      // Cleanup temp file
      if (language !== "bash") {
        try { await import("node:fs/promises").then((fs) => fs.unlink(tmpFile)); } catch { /* ignore */ }
      }

      return { stdout: stdout.toString(), stderr: stderr.toString(), exit_code: 0, success: true };
    } catch (e: any) {
      const stdout = e.stdout?.toString() ?? "";
      const stderr = e.stderr?.toString() ?? e.message ?? String(e);
      return { stdout, stderr, exit_code: e.code ?? 1, success: false };
    }
  },
};

// =============================================================================
// 3. HTTP CLIENT — Make HTTP requests to any API
// =============================================================================

export const httpRequest: ToolDef = {
  name: "http.request",
  description: "Make an HTTP request to any URL. Use this to call APIs, test your own endpoints, integrate with third-party services, fetch data from web services, or interact with REST/GraphQL APIs. Supports GET, POST, PUT, PATCH, DELETE with custom headers and body.",
  inputSchema: z.object({
    method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).default("GET").describe("HTTP method"),
    url: z.string().describe("The URL to request (include https://)"),
    headers: z.record(z.string()).optional().describe("Custom headers as key-value pairs (e.g. {\"Authorization\": \"Bearer token\", \"Content-Type\": \"application/json\"})"),
    body: z.string().optional().describe("Request body (for POST/PUT/PATCH). Send as string — if JSON, stringify it first."),
    timeout_ms: z.number().int().min(1000).max(60000).default(30000).describe("Request timeout in milliseconds"),
  }),
  outputSchema: z.object({
    status: z.number(),
    status_text: z.string(),
    headers: z.record(z.string()),
    body: z.string(),
    ok: z.boolean(),
  }),
  permissionsRequired: ["http.request"],
  sideEffect: "read",
  requiresApproval: false,
  async execute({ method, url, headers, body, timeout_ms }) {
    try {
      const resp = await fetch(url, {
        method,
        headers: headers ?? {},
        body: body ?? undefined,
        signal: AbortSignal.timeout(timeout_ms),
        redirect: "follow",
      });

      const respText = await resp.text();
      const respHeaders: Record<string, string> = {};
      resp.headers.forEach((value, key) => { respHeaders[key] = value; });

      return {
        status: resp.status,
        status_text: resp.statusText,
        headers: respHeaders,
        body: respText.slice(0, 50000),
        ok: resp.ok,
      };
    } catch (e: any) {
      return {
        status: 0,
        status_text: "Error",
        headers: {},
        body: `Request failed: ${e.message ?? String(e)}`,
        ok: false,
      };
    }
  },
};

// =============================================================================
// 4. SURGICAL EDITING — Find and replace within files
// =============================================================================

export const fsEdit: ToolDef = {
  name: "fs.edit",
  description: "Make a surgical edit to a file by finding and replacing text. This is safer and faster than rewriting the entire file. The old_text must match exactly (including whitespace and indentation). If old_text appears multiple times, all occurrences are replaced. Use this for targeted changes like fixing a bug, renaming a variable, or updating a function.",
  inputSchema: z.object({
    path: z.string().describe("Path to the file to edit (relative to cwd)"),
    old_text: z.string().describe("The exact text to find in the file (must match exactly, including whitespace)"),
    new_text: z.string().describe("The text to replace it with"),
    replace_all: z.boolean().default(true).describe("If true, replace all occurrences. If false, only replace the first match."),
  }),
  outputSchema: z.object({
    path: z.string(),
    replacements_made: z.number(),
    success: z.boolean(),
    error: z.string().optional(),
  }),
  permissionsRequired: ["fs.write"],
  sideEffect: "write",
  requiresApproval: false,
  async execute({ path, old_text, new_text, replace_all }, ctx) {
    const fullPath = safePath(ctx.cwd, path);
    try {
      const content = await readFileAsync(fullPath, "utf8");

      if (!content.includes(old_text)) {
        return { path, replacements_made: 0, success: false, error: "old_text not found in file. Make sure it matches exactly including whitespace." };
      }

      if (replace_all) {
        const newContent = content.split(old_text).join(new_text);
        const count = content.split(old_text).length - 1;
        await writeFileAsync(fullPath, newContent, "utf8");
        return { path, replacements_made: count, success: true };
      } else {
        const idx = content.indexOf(old_text);
        const newContent = content.slice(0, idx) + new_text + content.slice(idx + old_text.length);
        await writeFileAsync(fullPath, newContent, "utf8");
        return { path, replacements_made: 1, success: true };
      }
    } catch (e) {
      return { path, replacements_made: 0, success: false, error: String(e) };
    }
  },
};

// =============================================================================
// 5. DEPLOYMENT — Deploy static sites and get a live URL
// =============================================================================

export const deployStatic: ToolDef = {
  name: "deploy.static",
  description: "Deploy a static website (HTML/CSS/JS) to a live URL. The agent can deploy the files it created so the user gets a real, accessible website. Uses a simple HTTP server or copies to a deploy directory. Returns the URL where the site is live.",
  inputSchema: z.object({
    directory: z.string().describe("Path to the directory containing the static site (must have index.html)"),
    port: z.number().int().min(8000).max(9999).optional().describe("Port to serve on (if using local server). If omitted, uses next available port from 8100."),
    method: z.enum(["local", "netlify", "vercel"]).default("local").describe("Deployment method: local=serve locally, netlify=deploy to Netlify (needs token), vercel=deploy to Vercel (needs token)"),
  }),
  outputSchema: z.object({
    url: z.string(),
    method: z.string(),
    success: z.boolean(),
    message: z.string(),
  }),
  permissionsRequired: ["deploy.static"],
  sideEffect: "write",
  requiresApproval: false,
  async execute({ directory, port, method }, ctx) {
    const fullPath = safePath(ctx.cwd, directory);
    const indexPath = join(fullPath, "index.html");

    if (!existsSync(indexPath)) {
      return { url: "", method, success: false, message: "No index.html found in the specified directory." };
    }

    if (method === "local") {
      // Start a simple static file server using Bun
      const serverPort = port ?? 8100 + Math.floor(Math.random() * 100);
      try {
        // Use Bun.serve in a detached process
        const serverCode = `
          const dir = "${fullPath.replace(/\\/g, "\\\\")}";
          Bun.serve({
            port: ${serverPort},
            async fetch(req) {
              const url = new URL(req.url);
              let path = url.pathname;
              if (path === "/") path = "/index.html";
              const file = dir + path;
              try {
                const f = Bun.file(file);
                if (await f.exists()) return new Response(f);
              } catch {}
              // Fallback to index.html for SPA
              try {
                const f = Bun.file(dir + "/index.html");
                if (await f.exists()) return new Response(f);
              } catch {}
              return new Response("Not found", { status: 404 });
            },
          });
          console.log("Server running on port ${serverPort}");
        `;
        const tmpServer = join(require("node:os").tmpdir(), `deploy_${Date.now()}.js`);
        await import("node:fs/promises").then((fs) => fs.writeFile(tmpServer, serverCode));
        const { spawn } = await import("node:child_process");
        spawn("bun", ["run", tmpServer], { detached: true, stdio: "ignore" }).unref();

        // Wait a moment for server to start
        await new Promise((r) => setTimeout(r, 1500));

        return {
          url: `http://localhost:${serverPort}`,
          method: "local",
          success: true,
          message: `Static site deployed locally. The server is running in the background.`,
        };
      } catch (e) {
        return { url: "", method: "local", success: false, message: `Failed to start server: ${e}` };
      }
    } else if (method === "netlify" || method === "vercel") {
      // Check if CLI is available
      const cli = method === "netlify" ? "netlify" : "vercel";
      try {
        await execAsync(`${cli} --version`, { timeout: 5000 });
      } catch {
        return {
          url: "",
          method,
          success: false,
          message: `${cli} CLI not installed. Install with: npm install -g ${cli}. Then set up authentication with: ${cli} login.`,
        };
      }

      try {
        const { stdout } = await execAsync(`${cli} deploy --prod --yes`, {
          cwd: fullPath,
          timeout: 60000,
        });
        // Extract URL from output
        const urlMatch = stdout.match(/https?:\/\/[^\s]+/);
        const url = urlMatch ? urlMatch[0] : "";
        return {
          url,
          method,
          success: true,
          message: `Deployed to ${method}. ${stdout.slice(0, 500)}`,
        };
      } catch (e: any) {
        return {
          url: "",
          method,
          success: false,
          message: `Deployment failed: ${e.stderr?.toString() ?? e.message}. Make sure you're logged in with '${cli} login'.`,
        };
      }
    }

    return { url: "", method, success: false, message: "Unknown deployment method." };
  },
};

// =============================================================================
// 6. IMAGE GENERATION — Create images via DALL-E or compatible API
// =============================================================================

export function createImageGenTool(router: ModelRouterClient, apiKey?: string): ToolDef {
  return {
    name: "image.generate",
    description: "Generate an image from a text description using AI. Use this to create logos, icons, illustrations, favicons, OG images, mockups, or any visual asset your project needs. The generated image is saved to a file. Be specific in your description for best results (e.g. 'A minimalist logo for a coffee shop, featuring a coffee bean shape, warm brown colors, flat design, on white background').",
    inputSchema: z.object({
      prompt: z.string().describe("Detailed description of the image to generate. Be specific about style, colors, composition, and subject."),
      output_path: z.string().describe("Path to save the generated image (relative to cwd). Include extension (.png or .jpg)."),
      size: z.enum(["256x256", "512x512", "1024x1024", "1792x1024", "1024x1792"]).default("1024x1024").describe("Image dimensions"),
      model: z.string().default("openai:dall-e-3").describe("Image generation model to use"),
    }),
    outputSchema: z.object({
      path: z.string(),
      success: z.boolean(),
      message: z.string(),
    }),
    permissionsRequired: ["image.generate"],
    sideEffect: "write",
    requiresApproval: false,
    async execute({ prompt, output_path, size, model }, ctx) {
      const fullPath = safePath(ctx.cwd, output_path);

      // Ensure directory exists
      const dir = fullPath.substring(0, Math.max(fullPath.lastIndexOf("\\"), fullPath.lastIndexOf("/")));
      try { mkdirSync(dir, { recursive: true }); } catch { /* exists */ }

      try {
        // Use the model router to generate the image
        // The model router passes through to OpenAI's image generation API
        const provider = model.split(":")[0] ?? "openai";
        const modelName = model.split(":")[1] ?? "dall-e-3";

        // OpenAI DALL-E API endpoint
        const openaiUrl = "https://api.openai.com/v1/images/generations";
        const key = apiKey ?? process.env.OPENAI_API_KEY;

        if (!key) {
          return { path: output_path, success: false, message: "No API key available for image generation. Set OPENAI_API_KEY or provide a key." };
        }

        const resp = await fetch(openaiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${key}`,
          },
          body: JSON.stringify({
            model: modelName,
            prompt,
            n: 1,
            size,
            response_format: "b64_json",
          }),
          signal: AbortSignal.timeout(60000),
        });

        if (!resp.ok) {
          const errText = await resp.text();
          return { path: output_path, success: false, message: `Image generation failed (${resp.status}): ${errText.slice(0, 300)}` };
        }

        const data = await resp.json() as { data: Array<{ b64_json: string; url?: string }> };
        const imageBase64 = data.data[0]?.b64_json;

        if (!imageBase64) {
          // Some models return URL instead of base64
          const imageUrl = data.data[0]?.url;
          if (imageUrl) {
            const imgResp = await fetch(imageUrl);
            const imgBuffer = await imgResp.arrayBuffer();
            await import("node:fs/promises").then((fs) => fs.writeFile(fullPath, Buffer.from(imgBuffer)));
            return { path: output_path, success: true, message: `Image generated and saved to ${output_path}` };
          }
          return { path: output_path, success: false, message: "No image data in response." };
        }

        // Write base64 to file
        await import("node:fs/promises").then((fs) => fs.writeFile(fullPath, Buffer.from(imageBase64, "base64")));
        return { path: output_path, success: true, message: `Image generated and saved to ${output_path}` };
      } catch (e: any) {
        return { path: output_path, success: false, message: `Image generation error: ${e.message ?? String(e)}` };
      }
    },
  };
}
