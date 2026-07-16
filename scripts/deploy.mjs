#!/usr/bin/env node
/**
 * Build + deploy to Cloudflare.
 * Auth config comes from Worker secrets at runtime (/api/auth/config), so a
 * CI build without VITE_SUPABASE_* still signs in. VITE_* remains optional for
 * local-only SPA baking.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

const root = resolve(import.meta.dirname, "..");
loadEnvFile(resolve(root, ".env.local"));
loadEnvFile(resolve(root, ".env.production"));
loadEnvFile(resolve(root, ".env"));

if (!process.env.VITE_SUPABASE_URL || !process.env.VITE_SUPABASE_ANON_KEY) {
  console.warn(
    "Note: VITE_SUPABASE_* not set — SPA will load auth config from Worker /api/auth/config (requires SUPABASE_URL + SUPABASE_ANON_KEY secrets).",
  );
}

function run(cmd, args) {
  const result = spawnSync(cmd, args, {
    cwd: root,
    stdio: "inherit",
    env: process.env,
    shell: process.platform === "win32",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run("npm", ["run", "build"]);
run("npx", ["wrangler", "deploy", "--config", "wrangler.jsonc"]);
