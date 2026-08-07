/**
 * codegen.ts — regenerates src/index.ts types from ../schema/*.json.
 *
 * M0 status: STUB. Types are currently hand-authored in src/index.ts and kept
 * in sync manually. This script will be wired to `json-schema-to-typescript`
 * (TS) and `datamodel-code-generator` (Python) in CI once the schema stabilizes.
 *
 * Run: bun run codegen
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const schemaDir = resolve(import.meta.dir, "..", "..", "schema");
const files = ["envelope.json", "payloads.json", "tool-descriptor.json"];

for (const f of files) {
  const p = resolve(schemaDir, f);
  if (!existsSync(p)) {
    console.error(`[codegen] missing schema: ${p}`);
    process.exit(1);
  }
}

console.log("[codegen] schemas present:");
console.log(files.map((f) => `  - ${f}`).join("\n"));
console.log("[codegen] TODO: wire json-schema-to-typescript + datamodel-code-generator.");
