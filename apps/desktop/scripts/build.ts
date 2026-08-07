/**
 * build.ts — build the Cascade desktop app from the VS Code fork.
 *
 * Delegates to upstream's yarn scripts. Targets the desktop build.
 * On Windows: produces VS Code's standard build output.
 *
 * Run: bun scripts/build.ts  (from apps/desktop/)
 */
import { $ } from "bun";
import { resolve, join } from "node:path";

const vscodeDir = join(resolve(import.meta.dir, ".."), "vscode");

console.log("[build] compiling VS Code core (yarn compile)");
// Upstream's compile step: compiles the TS sources.
await $`yarn --cwd ${vscodeDir} compile`.nothrow();

// The full packaged build uses gulp. This produces a runnable app in
// ../vscode-web or a platform-specific package depending on the target.
console.log("[build] running gulp package (this may take a while)");
await $`yarn --cwd ${vscodeDir} gulp`.nothrow();

console.log("[build] done. Next: bun scripts/run.ts");
