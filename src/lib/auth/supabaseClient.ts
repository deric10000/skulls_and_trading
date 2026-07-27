import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type ServerScoringMode = "client" | "shadow" | "authoritative";
type AuthConfig = {
  url: string;
  anonKey: string;
  serverScoringMode: ServerScoringMode;
};

const viteEnv = import.meta.env as ImportMetaEnv | undefined;
const viteUrl = viteEnv?.VITE_SUPABASE_URL?.trim();
const viteAnon = viteEnv?.VITE_SUPABASE_ANON_KEY?.trim();
const viteServerScoring = viteEnv?.VITE_SERVER_SCORING_ENABLED?.trim();

function parseServerScoringMode(value: unknown): ServerScoringMode {
  if (value === true || value === "true" || value === "authoritative") {
    return "authoritative";
  }
  return value === "shadow" ? "shadow" : "client";
}

let config: AuthConfig | null =
  viteUrl && viteAnon
    ? {
        url: viteUrl,
        anonKey: viteAnon,
        serverScoringMode: parseServerScoringMode(viteServerScoring),
      }
    : null;
let loadPromise: Promise<AuthConfig | null> | null = null;
let client: SupabaseClient | null = null;

async function fetchWorkerAuthConfig(): Promise<AuthConfig | null> {
  try {
    const res = await fetch("/api/auth/config", { credentials: "same-origin" });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      url?: unknown;
      anonKey?: unknown;
      serverScoring?: unknown;
    };
    const url = typeof body.url === "string" ? body.url.trim() : "";
    const anonKey =
      typeof body.anonKey === "string" ? body.anonKey.trim() : "";
    if (!url || !anonKey) return null;
    return {
      url,
      anonKey,
      serverScoringMode: parseServerScoringMode(body.serverScoring),
    };
  } catch {
    return null;
  }
}

/** Resolve Supabase from Vite env (local) or Worker secrets (production). */
export async function ensureSupabaseReady(): Promise<boolean> {
  if (config) return true;
  if (!loadPromise) {
    loadPromise = fetchWorkerAuthConfig().then((remote) => {
      if (remote) config = remote;
      return config;
    });
  }
  await loadPromise;
  return Boolean(config);
}

export function isSupabaseConfigured(): boolean {
  return Boolean(config);
}

export function getServerScoringMode(): ServerScoringMode {
  return config?.serverScoringMode ?? "client";
}

export function getSupabase(): SupabaseClient {
  if (!config) {
    throw new Error(
      "Supabase is not configured. Local: set VITE_SUPABASE_* in .env.local. Production: set Worker secrets SUPABASE_URL and SUPABASE_ANON_KEY.",
    );
  }
  if (!client) {
    client = createClient(config.url, config.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return client;
}
