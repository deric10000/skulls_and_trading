#!/usr/bin/env node
/**
 * Build + deploy to Cloudflare only when VITE_SUPABASE_* are present.
 * Prevents the flip-flop where a code-only deploy ships a login screen
 * that says "not configured" after a good local env deploy.
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

const url = process.env.VITE_SUPABASE_URL?.trim();
const anon = process.env.VITE_SUPABASE_ANON_KEY?.trim();
if (!url || !anon) {
  console.error(
    [
      "Refusing to deploy: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set.",
      "Put them in .env.local (local) or Workers Builds → Build variables (CI).",
      "Worker secrets SUPABASE_* are runtime-only and do NOT bake into the SPA.",
    ].join("\n"),
  );
  process.exit(1);
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
