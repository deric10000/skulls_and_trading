// Beta 0: invite-only Supabase auth is the identity boundary for personal data.
// Demo Captain login remains available only when ENABLE_DEMO_GATE=true (legacy).
// Market routes require Bearer JWT when Supabase is configured on the Worker.
// See .cursor/rules/security-hardening.mdc and data-architecture.md.

import { handleMarketApi } from "./market";
import {
  handleMarketCycleApi,
  runScheduledMarketCycle,
  type MarketCycleEnv,
} from "./marketCycle";
import {
  marketAuthRequired,
  verifySupabaseAccessToken,
  type AuthEnv,
} from "./auth";
import {
  dispatchConvictionCycle,
  isConvictionCycleReference,
  readInternalCycle,
  type ConvictionCycleReference,
  type ConvictionDispatchEnv,
} from "./convictionDispatch";

type WorkerEnv = Env &
  MarketCycleEnv &
  AuthEnv & {
    DEMO_PASSWORD?: string;
    AUTH_SECRET?: string;
    ENABLE_DEMO_GATE?: string;
    SERVER_SCORING_ENABLED?: string;
  } &
  ConvictionDispatchEnv;

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
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);

    if (
      url.pathname === "/api/internal/market-cycle" &&
      request.method === "GET"
    ) {
      return readInternalCycle(
        request,
        env.MARKET_CACHE,
        env.INTERNAL_SCORING_SECRET,
      );
    }

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
        return jsonResponse(
          {
            url: null,
            anonKey: null,
            serverScoring: env.SERVER_SCORING_ENABLED ?? "false",
          },
          200,
        );
      }
      return jsonResponse(
        {
          url: env.SUPABASE_URL,
          anonKey: env.SUPABASE_ANON_KEY,
          serverScoring: env.SERVER_SCORING_ENABLED ?? "false",
        },
        200,
      );
    }

    if (url.pathname.startsWith("/api/market/")) {
      let userId = "local";
      if (marketAuthRequired(env)) {
        const user = await verifySupabaseAccessToken(request, env);
        if (!user) {
          return jsonResponse({ error: "Unauthorized" }, 401);
        }
        userId = user.userId;
      }
      const cycle = await handleMarketCycleApi(
        request,
        env,
        url.pathname,
        userId,
      );
      if (cycle) return cycle;
      const market = await handleMarketApi(request, env, url.pathname);
      if (market) return market;
    }

    return env.ASSETS.fetch(request);
  },

  async scheduled(
    controller: ScheduledController,
    env: WorkerEnv,
    _ctx: ExecutionContext,
  ): Promise<void> {
    await runScheduledMarketCycle(env, controller.scheduledTime);
  },

  async queue(
    batch: MessageBatch<ConvictionCycleReference>,
    env: WorkerEnv,
  ): Promise<void> {
    const forwardingStartedAt = performance.now();
    try {
      const metrics = await env.CONVICTION_CYCLE_QUEUE.metrics();
      console.log(
        JSON.stringify({
          event: "conviction_queue_backlog",
          backlogCount: metrics.backlogCount,
          backlogBytes: metrics.backlogBytes,
          oldestMessageTimestamp:
            metrics.oldestMessageTimestamp?.toISOString() ?? null,
          backlogAgeMs: metrics.oldestMessageTimestamp
            ? Math.max(0, Date.now() - metrics.oldestMessageTimestamp.getTime())
            : 0,
        }),
      );
    } catch (error) {
      console.warn(
        JSON.stringify({
          event: "conviction_queue_backlog",
          outcome: "metrics_unavailable",
          error: error instanceof Error ? error.message : "unknown",
        }),
      );
    }
    for (const message of batch.messages) {
      if (!isConvictionCycleReference(message.body)) {
        console.error(
          JSON.stringify({
            event: "conviction_cycle_dispatch",
            messageId: message.id,
            outcome: "invalid",
            deadLettered: false,
          }),
        );
        message.ack();
        continue;
      }
      try {
        await dispatchConvictionCycle(message.body, env);
        console.log(
          JSON.stringify({
            event: "conviction_cycle_dispatch",
            messageId: message.id,
            cycleKey: message.body.cycleKey,
            attempt: message.attempts,
            outcome: "forwarded",
          }),
        );
        message.ack();
      } catch (error) {
        const deadLetterPending = message.attempts >= 6;
        console.error(
          JSON.stringify({
            event: "conviction_cycle_dispatch",
            messageId: message.id,
            cycleKey: message.body.cycleKey,
            attempt: message.attempts,
            outcome: deadLetterPending ? "dead_letter_pending" : "retry",
            deadLetterPending,
            error: error instanceof Error ? error.message : "unknown",
          }),
        );
        message.retry();
      }
    }
    console.log(
      JSON.stringify({
        event: "conviction_queue_batch",
        messageCount: batch.messages.length,
        durationMs: Number((performance.now() - forwardingStartedAt).toFixed(2)),
      }),
    );
  },
};
