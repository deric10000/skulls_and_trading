import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export function isSupabaseConfigured(): boolean {
  return Boolean(url && anon);
}

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!isSupabaseConfigured()) {
    throw new Error(
      "Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.",
    );
  }
  if (!client) {
    client = createClient(url!, anon!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return client;
}
