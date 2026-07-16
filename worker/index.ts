// Beta 0: invite-only Supabase auth is the identity boundary for personal data.
// Demo Captain login remains available only when ENABLE_DEMO_GATE=true (legacy).
// Market routes require Bearer JWT when Supabase is configured on the Worker.
// See .cursor/rules/security-hardening.mdc and data-architecture.md.

import { handleMarketApi, type MarketEnv } from "./market";
import {
  marketAuthRequired,
  verifySupabaseAccessToken,
  type AuthEnv,
} from "./auth";

interface Env extends MarketEnv, AuthEnv {
  ASSETS: { fetch: (request: Request) => Promise<Response> };
  DEMO_PASSWORD?: string;
  AUTH_SECRET?: string;
  ENABLE_DEMO_GATE?: string;
}

const COOKIE_NAME = "st_demo";
const MAX_AGE_SECONDS = 60 * 60 * 12;

function jsonResponse(
  body: unknown,
  status: number,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...extraHeaders },
  });
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

async function sign(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(value),
  );
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

function buildCookie(value: string, maxAge: number): string {
  return `${COOKIE_NAME}=${value}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}`;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/demo-login") {
      if (env.ENABLE_DEMO_GATE !== "true") {
        return jsonResponse(
          { ok: false, error: "Demo Captain is retired for Beta accounts." },
          403,
        );
      }
      if (request.method !== "POST") {
        return jsonResponse({ ok: false }, 405);
      }

      let password = "";
      try {
        const body = (await request.json()) as { password?: unknown };
        password = typeof body.password === "string" ? body.password : "";
      } catch {
        return jsonResponse({ ok: false }, 400);
      }

      if (
        !env.DEMO_PASSWORD ||
        !env.AUTH_SECRET ||
        !timingSafeEqual(password, env.DEMO_PASSWORD)
      ) {
        return jsonResponse({ ok: false }, 401);
      }

      const expires = String(Date.now() + MAX_AGE_SECONDS * 1000);
      const token = `${expires}.${await sign(expires, env.AUTH_SECRET)}`;
      return jsonResponse({ ok: true }, 200, {
        "set-cookie": buildCookie(token, MAX_AGE_SECONDS),
      });
    }

    if (url.pathname === "/api/demo-logout") {
      if (request.method !== "POST") {
        return jsonResponse({ ok: false }, 405);
      }
      return jsonResponse({ ok: true }, 200, {
        "set-cookie": buildCookie("", 0),
      });
    }

    if (url.pathname === "/api/auth/config" && request.method === "GET") {
      // Anon key is public by design (RLS enforces access). Serving it from
      // Worker secrets means SPA builds do not need VITE_SUPABASE_* baked in.
      if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
        return jsonResponse({ url: null, anonKey: null }, 200);
      }
      return jsonResponse(
        { url: env.SUPABASE_URL, anonKey: env.SUPABASE_ANON_KEY },
        200,
      );
    }

    if (url.pathname.startsWith("/api/market/")) {
      if (marketAuthRequired(env)) {
        const user = await verifySupabaseAccessToken(request, env);
        if (!user) {
          return jsonResponse({ error: "Unauthorized" }, 401);
        }
      }
      const market = await handleMarketApi(request, env, url.pathname);
      if (market) return market;
    }

    return env.ASSETS.fetch(request);
  },
};
