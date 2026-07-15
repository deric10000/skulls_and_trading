// B1 demo gate — see .cursor/rules/security-hardening.mdc.
//
// Validates the shared "Demo Captain" password server-side so it never ships in
// the client bundle, then sets a signed, HttpOnly cookie. IMPORTANT: this gates
// the login *flow* only. The static SPA bundle is still publicly downloadable
// and the signed-in state lives in client React, so this is NOT a security
// boundary for personal/brokerage data.
//
// Free-tier *public* market data is proxied under /api/market/* (secrets stay
// on the Worker). Harden further before any real personal holdings APIs.

import { handleMarketApi, type MarketEnv } from "./market";

interface Env extends MarketEnv {
  ASSETS: { fetch: (request: Request) => Promise<Response> };
  DEMO_PASSWORD: string;
  AUTH_SECRET: string;
}

const COOKIE_NAME = "st_demo";
const MAX_AGE_SECONDS = 60 * 60 * 12; // 12 hours

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

      if (!env.DEMO_PASSWORD || !timingSafeEqual(password, env.DEMO_PASSWORD)) {
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

    const market = await handleMarketApi(request, env, url.pathname);
    if (market) return market;

    return env.ASSETS.fetch(request);
  },
};
