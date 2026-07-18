#!/usr/bin/env node
/**
 * Image pipeline — the only sanctioned way assets reach src/assets/.
 *
 * Masters live in assets-src/ (full resolution, never imported).
 * This script resizes/re-encodes them into src/assets/ per the manifest
 * below. See performance-budget.md for the workflow and quality gate.
 *
 * Usage: npm run optimize:images
 */

import { existsSync } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC_DIR = path.join(root, "assets-src");
const OUT_DIR = path.join(root, "src", "assets");

/**
 * Manifest — one entry per deliverable asset.
 *
 * width: max output width in px (omit to keep master dimensions).
 *        Chosen as ~2× the largest rendered CSS size for retina headroom.
 * quality: WebP quality. Raise it (or width) if the visual gate fails —
 *          bytes always lose to quality (performance-budget.md).
 */
const MANIFEST = [
  // Brand logo: renders ≤160 CSS px (login masthead) → 384px covers 2× + slack.
  { src: "st-logo.png", out: "st-logo.webp", width: 384, quality: 92 },

  // Compass emblems: render 48–60 CSS px → 256px covers 2× with headroom.
  { src: "bull-skull-compass.png", out: "bull-skull-compass.webp", width: 256, quality: 90 },
  { src: "bear-skull-compass.png", out: "bear-skull-compass.webp", width: 256, quality: 90 },

  // Login/hero backdrops: full-card cover art — keep dimensions, tighter encode.
  {
    src: "skulls-and-trading-login-background-2.webp",
    out: "skulls-and-trading-login-background-2.webp",
    quality: 72,
  },
  {
    src: "skulls-and-trading-login-background-mobile.webp",
    out: "skulls-and-trading-login-background-mobile.webp",
    quality: 75,
  },

  // Market Weather card art: renders ≤ ~460 CSS px wide → cap 1024 for 2×.
  ...[
    "breakout-wind",
    "calm-waters",
    "chop-seas",
    "headwind",
    "red-sky-warning",
    "risk-off-storm",
    "risk-on-tide",
    "rogue-wave",
    "rotation-current",
    "tailwind",
  ].map((id) => ({
    src: `market-weather-bg-${id}.webp`,
    out: `market-weather-bg-${id}.webp`,
    width: 1024,
    quality: 72,
  })),
];

function kb(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

async function run() {
  await mkdir(OUT_DIR, { recursive: true });
  let totalBefore = 0;
  let totalAfter = 0;
  const rows = [];

  for (const entry of MANIFEST) {
    const srcPath = path.join(SRC_DIR, entry.src);
    if (!existsSync(srcPath)) {
      console.error(`MISSING MASTER: assets-src/${entry.src}`);
      process.exitCode = 1;
      continue;
    }
    const before = (await stat(srcPath)).size;

    let pipeline = sharp(srcPath);
    const meta = await pipeline.metadata();
    if (entry.width && meta.width > entry.width) {
      pipeline = pipeline.resize({ width: entry.width, withoutEnlargement: true });
    }
    // smartSubsample keeps chroma detail on art; effort 6 = best compression.
    const buffer = await pipeline
      .webp({ quality: entry.quality, effort: 6, smartSubsample: true })
      .toBuffer();

    const outPath = path.join(OUT_DIR, entry.out);
    await sharp(buffer).toFile(outPath);
    const after = (await stat(outPath)).size;

    totalBefore += before;
    totalAfter += after;
    rows.push({ asset: entry.out, before: kb(before), after: kb(after) });
  }

  console.table(rows);
  console.log(`TOTAL: ${kb(totalBefore)} -> ${kb(totalAfter)}`);
  console.log(
    "Now run the visual quality gate (performance-budget.md) before committing.",
  );
}

run();
