/**
 * SPA client for Worker `/api/market/*` routes. No provider secrets here.
 * Attaches Supabase access token when present (Beta Worker JWT gate).
 */

import type {
  FundamentalSnapshot,
  MarketContext,
  TechnicalSnapshot,
  TickerQuote,
} from "../../types";
import { getAccessToken } from "../auth/session";
import type { ProviderBudget } from "./liveCache";

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
): Promise<{ technicals: TechnicalSnapshot | null; budgets?: ProviderBudget[] } | null> {
  try {
    const res = await fetch(
      `/api/market/technicals?symbol=${encodeURIComponent(symbol)}`,
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
