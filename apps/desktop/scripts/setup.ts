/**
 * setup.ts — one-time fork setup.
 *
 * 1. Overlay our product.json onto upstream vscode/product.json.
 * 2. Install upstream deps (yarn in vscode/).
 * 3. Apply any patches in build/patches/*.patch.
 *
 * Run: bun scripts/setup.ts  (from apps/desktop/)
 */
import { $, file, exists } from "bun";
import { resolve, join } from "node:path";

const desktopDir = resolve(import.meta.dir, "..");
const vscodeDir = join(desktopDir, "vscode");
const ourProduct = join(desktopDir, "product.json");
const upstreamProduct = join(vscodeDir, "product.json");
const patchesDir = join(desktopDir, "build", "patches");

console.log("[setup] overlaying product.json");
const productJson = await file(ourProduct).text();
await Bun.write(upstreamProduct, productJson);

console.log("[setup] installing upstream deps (yarn)");
// VS Code uses yarn classic. Install at the vscode root.
await $`yarn --cwd ${vscodeDir} install --frozen-lockfile`.nothrow();

if (await exists(patchesDir)) {
  console.log("[setup] applying patches");
  for await (const p of new Bun.Glob("*.patch").scan({ cwd: patchesDir })) {
    const patchPath = join(patchesDir, p);
    console.log(`[setup]   applying ${p}`);
    await $`git -C ${vscodeDir} apply --ignore-whitespace ${patchPath}`.nothrow();
  }
} else {
  console.log("[setup] no patches directory; skipping");
}

console.log("[setup] done. Next: bun scripts/build.ts");
