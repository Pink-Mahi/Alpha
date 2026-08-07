/**
 * run.ts — launch the built Cascade desktop app for local dev.
 *
 * In dev, the simplest way to run the fork is via upstream's `yarn` launch
 * script which starts Electron with the compiled sources.
 *
 * Run: bun scripts/run.ts  (from apps/desktop/)
 */
import { $ } from "bun";
import { resolve, join } from "node:path";

const vscodeDir = join(resolve(import.meta.dir, ".."), "vscode");

console.log("[run] launching Cascade (yarn electron)");
await $`yarn --cwd ${vscodeDir} electron`.nothrow();
