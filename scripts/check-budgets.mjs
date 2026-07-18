#!/usr/bin/env node
/**
 * Performance budget gate — fails the build/deploy when a budget is blown.
 * Budgets and rationale live in performance-budget.md. Runs automatically
 * before every deploy (scripts/deploy.mjs); run manually with
 * `npm run check:budgets` (requires a fresh `npm run build` for JS checks).
 *
 * If a budget fails: fix the regression (image pipeline / code splitting)
 * rather than raising the number. Raising a budget requires updating
 * performance-budget.md in the same change with the reason.
 */

import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const BUDGETS = {
  // Images (checked in src/assets — the deliverables the app imports)
  maxSingleImageKB: 200,
  maxTotalImagesKB: 1300,
  // JS (checked in dist — gzip, as shipped)
  maxEntryChunkGzipKB: 80,
  maxAnyChunkGzipKB: 100,
};

const IMAGE_EXTS = new Set([".png", ".webp", ".jpg", ".jpeg", ".gif", ".svg", ".avif"]);
const failures = [];
const kb = (bytes) => Math.round(bytes / 102.4) / 10;

// ---- Image budgets (src/assets) -------------------------------------------
const assetsDir = path.join(root, "src", "assets");
let totalImageBytes = 0;
for (const file of readdirSync(assetsDir)) {
  if (!IMAGE_EXTS.has(path.extname(file).toLowerCase())) continue;
  const size = statSync(path.join(assetsDir, file)).size;
  totalImageBytes += size;
  if (kb(size) > BUDGETS.maxSingleImageKB) {
    failures.push(
      `IMAGE OVER BUDGET: src/assets/${file} is ${kb(size)} KB (limit ${BUDGETS.maxSingleImageKB} KB). ` +
        `Re-run the pipeline with a tighter manifest entry (scripts/optimize-images.mjs).`,
    );
  }
}
if (kb(totalImageBytes) > BUDGETS.maxTotalImagesKB) {
  failures.push(
    `TOTAL IMAGE WEIGHT OVER BUDGET: src/assets images total ${kb(totalImageBytes)} KB ` +
      `(limit ${BUDGETS.maxTotalImagesKB} KB).`,
  );
}

// ---- JS chunk budgets (dist, gzip) -----------------------------------------
const distAssets = path.join(root, "dist", "assets");
const distIndex = path.join(root, "dist", "index.html");
if (!existsSync(distAssets) || !existsSync(distIndex)) {
  console.error("dist/ not found — run `npm run build` before check:budgets.");
  process.exit(1);
}

const indexHtml = readFileSync(distIndex, "utf8");
const entryMatch = indexHtml.match(/assets\/(index-[^"']+\.js)/);
const entryName = entryMatch ? entryMatch[1] : null;

for (const file of readdirSync(distAssets)) {
  if (!file.endsWith(".js")) continue;
  const gzip = kb(gzipSync(readFileSync(path.join(distAssets, file))).length);
  if (file === entryName && gzip > BUDGETS.maxEntryChunkGzipKB) {
    failures.push(
      `ENTRY CHUNK OVER BUDGET: ${file} is ${gzip} KB gzip (limit ${BUDGETS.maxEntryChunkGzipKB} KB). ` +
        `Something heavy leaked into the eager path — check imports in App.tsx / LoginScreen / AppState.`,
    );
  } else if (gzip > BUDGETS.maxAnyChunkGzipKB) {
    failures.push(
      `CHUNK OVER BUDGET: ${file} is ${gzip} KB gzip (limit ${BUDGETS.maxAnyChunkGzipKB} KB). ` +
        `Split it (lazy page/modal or vendor group in vite.config.ts).`,
    );
  }
}

// ---- Report -----------------------------------------------------------------
if (failures.length > 0) {
  console.error("\nPerformance budget check FAILED:\n");
  for (const f of failures) console.error(`  ✗ ${f}`);
  console.error("\nSee performance-budget.md for the workflow.\n");
  process.exit(1);
}
console.log(
  `Performance budgets OK — images ${kb(totalImageBytes)} KB total; all JS chunks within gzip limits.`,
);
