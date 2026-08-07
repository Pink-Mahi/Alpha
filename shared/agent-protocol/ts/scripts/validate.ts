/**
 * validate.ts — validates sample agent messages against the JSON Schemas.
 *
 * Ensures the canonical schemas are loadable and that representative messages
 * of each type validate. Run: bun run validate
 */
import Ajv from "ajv/dist/2020.js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { envelope } from "../src/index.ts";

// import.meta.dir is .../ts/scripts; schema lives at .../agent-protocol/schema
const schemaDir = resolve(import.meta.dir, "..", "..", "schema");
const readSchema = (f: string) => JSON.parse(readFileSync(resolve(schemaDir, f), "utf8"));

const envelopeSchema = readSchema("envelope.json");
const payloadsSchema = readSchema("payloads.json");

const ajv = new Ajv({ allErrors: true, strict: false });
// Register the payloads $defs so the envelope's $ref resolves.
const validateEnvelope = ajv.addSchema(payloadsSchema).compile(envelopeSchema);

const base = { org_id: "00000000-0000-0000-0000-000000000001", run_id: "00000000-0000-0000-0000-000000000002", task_id: "00000000-0000-0000-0000-000000000003", seq: 0 };

const samples = [
  envelope(base, "task.start", {
    spec: "Refactor auth to passkeys",
    budget_usd: 2.5,
    deadline: new Date(Date.now() + 3600_000).toISOString(),
    runtime: "cloud",
    tool_allowlist: ["fs.read", "fs.write", "shell.exec"],
    model_policy: { preferred: ["anthropic:claude-opus"] },
    memory_scope: ["project", "user"],
  }),
  envelope({ ...base, seq: 1 }, "task.plan", {
    steps: [{ summary: "Add passkey lib", risk: "low" }],
  }),
  envelope({ ...base, seq: 2 }, "tool.call", { request_id: "r1", tool: "fs.read", args: { path: "/repo/a.ts" } }),
  envelope({ ...base, seq: 3 }, "tool.result", { request_id: "r1", output: "file contents", error: null }),
  envelope({ ...base, seq: 4 }, "cost.tick", { model: "anthropic:claude-opus", tokens_in: 100, tokens_out: 50, cost_usd: 0.012 }),
  envelope({ ...base, seq: 5 }, "task.complete", { summary: "done", artifacts: ["pr"], pr_url: "https://example/pr/1", cost_usd: 0.5, duration_ms: 12000 }),
];

let failed = 0;
for (const s of samples) {
  const ok = validateEnvelope(s);
  if (ok) {
    console.log(`[validate] ok   ${s.type}`);
  } else {
    failed++;
    console.error(`[validate] FAIL ${s.type}`, validateEnvelope.errors);
  }
}

if (failed > 0) {
  console.error(`[validate] ${failed} sample(s) failed`);
  process.exit(1);
}
console.log(`[validate] all ${samples.length} samples valid`);
