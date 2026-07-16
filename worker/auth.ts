/** Verify Supabase JWT by calling Auth /user endpoint (no JWT secret in Worker). */

export interface AuthEnv {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  /** When "false", market routes stay open (local wrangler). Default require auth in prod. */
  MARKET_AUTH_REQUIRED?: string;
}

export async function verifySupabaseAccessToken(
  request: Request,
  env: AuthEnv,
): Promise<{ userId: string; email?: string } | null> {
  const header = request.headers.get("authorization") || "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) return null;
  const token = match[1].trim();
  if (!token || !env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return null;

  const res = await fetch(`${env.SUPABASE_URL.replace(/\/$/, "")}/auth/v1/user`, {
    headers: {
      authorization: `Bearer ${token}`,
      apikey: env.SUPABASE_ANON_KEY,
    },
  });
  if (!res.ok) return null;
  const user = (await res.json()) as { id?: string; email?: string };
  if (!user.id) return null;
  return { userId: user.id, email: user.email };
}

export function marketAuthRequired(env: AuthEnv): boolean {
  if (env.MARKET_AUTH_REQUIRED === "false") return false;
  if (env.MARKET_AUTH_REQUIRED === "true") return true;
  // Default: require when Supabase is configured (Beta deploy).
  return Boolean(env.SUPABASE_URL && env.SUPABASE_ANON_KEY);
}
