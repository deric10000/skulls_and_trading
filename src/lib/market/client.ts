/**
 * SPA client for Worker `/api/market/*` routes. No provider secrets here.
 * Attaches Supabase access token when present (Beta Worker JWT gate).
 */

import type {
  CandleInterval,
  FundamentalSnapshot,
  MarketContext,
  TechnicalSnapshot,
  TickerQuote,
  TimeframedIndicators,
} from "../../types";
import { getAccessToken } from "../auth/session";
import type { ProviderBudget } from "./liveCache";

export interface MarketCyclePayload {
  cycleAsOf: string;
  completedAt: string;
  publishedAt: string;
  nextCycleAt: string;
  symbols: string[];
  quotes: Record<string, TickerQuote>;
  fundamentals: Record<string, FundamentalSnapshot>;
  technicals: Record<string, TechnicalSnapshot>;
  byTimeframe: Record<
    string,
    Partial<Record<CandleInterval, TimeframedIndicators>>
  >;
  context: MarketContext | null;
  errors: string[];
}

async function authHeaders(
  extra: Record<string, string> = {},
): Promise<Record<string, string>> {
  const token = await getAccessToken();
  return {
    ...extra,
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  };
}

async function readJson<T>(res: Response): Promise<T | null> {
  if (!res.ok) return null;
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function fetchMarketQuotes(
  symbols: string[],
): Promise<{ quotes: Record<string, TickerQuote>; budgets?: ProviderBudget[]; asOf?: string } | null> {
  const unique = [...new Set(symbols.map((s) => s.toUpperCase()).filter(Boolean))];
  if (unique.length === 0) return { quotes: {} };
  try {
    const res = await fetch("/api/market/quotes", {
      method: "POST",
      headers: await authHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({ symbols: unique }),
    });
    return readJson(res);
  } catch {
    return null;
  }
}

export async function registerMarketSymbols(symbols: string[]): Promise<boolean> {
  const unique = [...new Set(symbols.map((s) => s.toUpperCase()).filter(Boolean))];
  try {
    const res = await fetch("/api/market/registry", {
      method: "POST",
      headers: await authHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({ symbols: unique }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchLatestMarketCycle(): Promise<MarketCyclePayload | null> {
  try {
    const res = await fetch("/api/market/cycle", {
      headers: await authHeaders(),
      cache: "no-store",
    });
    const body = await readJson<{ cycle: MarketCyclePayload | null }>(res);
    return body?.cycle ?? null;
  } catch {
    return null;
  }
}

export async function fetchMarketSearch(
  query: string,
): Promise<{ hits: { symbol: string; name: string }[]; budgets?: ProviderBudget[] } | null> {
  try {
    const res = await fetch(
      `/api/market/search?q=${encodeURIComponent(query.trim())}`,
      { headers: await authHeaders() },
    );
    return readJson(res);
  } catch {
    return null;
  }
}

export async function fetchMarketFundamentals(
  symbol: string,
): Promise<{ fundamentals: FundamentalSnapshot | null; budgets?: ProviderBudget[] } | null> {
  try {
    const res = await fetch(
      `/api/market/fundamentals?symbol=${encodeURIComponent(symbol)}`,
      { headers: await authHeaders() },
    );
    return readJson(res);
  } catch {
    return null;
  }
}

export async function fetchMarketTechnicals(
  symbol: string,
  opts?: { sectorEtf?: string; timeframes?: CandleInterval[] },
): Promise<{
  technicals: TechnicalSnapshot | null;
  byTimeframe?: Partial<Record<CandleInterval, TimeframedIndicators>>;
  budgets?: ProviderBudget[];
} | null> {
  try {
    const etfQ = opts?.sectorEtf
      ? `&sectorEtf=${encodeURIComponent(opts.sectorEtf)}`
      : "";
    const tfQ =
      opts?.timeframes && opts.timeframes.length > 0
        ? `&timeframes=${encodeURIComponent(opts.timeframes.join(","))}`
        : "";
    const res = await fetch(
      `/api/market/technicals?symbol=${encodeURIComponent(symbol)}${etfQ}${tfQ}`,
      { headers: await authHeaders() },
    );
    return readJson(res);
  } catch {
    return null;
  }
}

export async function fetchMarketContext(): Promise<{
  context: MarketContext | null;
  budgets?: ProviderBudget[];
} | null> {
  try {
    const res = await fetch("/api/market/context", {
      headers: await authHeaders(),
    });
    return readJson(res);
  } catch {
    return null;
  }
}
