/**
 * Pass 2 live refresh — fills liveCache from Worker, updates strategy pull stamps.
 * AppState owns loading; call after auth / when holdings change.
 */

import type { Strategy } from "../../types";
import {
  fetchMarketContext,
  fetchMarketFundamentals,
  fetchMarketQuotes,
  fetchMarketTechnicals,
} from "./client";
import { clearLiveWeatherCache } from "../datasource/freeTier";
import {
  setLastDataPullAt,
  setLiveFundamentals,
  setLiveMarketContext,
  setLiveQuotes,
  setLiveTechnicals,
  setProviderBudgets,
} from "./liveCache";
import type {
  FundamentalSnapshot,
  MarketContext,
  TechnicalSnapshot,
} from "../../types";

export async function refreshLiveMarketForPortfolios(
  tickers: string[],
  appliedStrategies: Strategy[],
): Promise<void> {
  const unique = [...new Set(tickers.map((t) => t.toUpperCase()).filter(Boolean))];
  if (unique.length === 0) return;

  const quotesRes = await fetchMarketQuotes(unique);
  if (quotesRes?.budgets) setProviderBudgets(quotesRes.budgets);
  if (quotesRes?.quotes) {
    const mapped = Object.fromEntries(
      Object.entries(quotesRes.quotes).map(([ticker, quote]) => [
        ticker,
        {
          ticker,
          lastPrice: quote.lastPrice,
          asOf: quote.asOf,
          source: "live" as const,
        },
      ]),
    );
    setLiveQuotes(mapped);
  }

  // Fundamentals + technicals — sequential to respect free-tier budgets.
  for (const ticker of unique.slice(0, 25)) {
    const fundy = await fetchMarketFundamentals(ticker);
    if (fundy?.budgets) setProviderBudgets(fundy.budgets);
    if (fundy?.fundamentals) {
      setLiveFundamentals(ticker, fundy.fundamentals as FundamentalSnapshot);
    }
    const tech = await fetchMarketTechnicals(ticker);
    if (tech?.budgets) setProviderBudgets(tech.budgets);
    if (tech?.technicals) {
      setLiveTechnicals(ticker, tech.technicals as TechnicalSnapshot);
    }
  }

  const ctx = await fetchMarketContext();
  if (ctx?.budgets) setProviderBudgets(ctx.budgets);
  if (ctx?.context) {
    setLiveMarketContext(ctx.context as MarketContext);
    clearLiveWeatherCache();
  }

  const pulledAt = quotesRes?.asOf ?? new Date().toISOString();
  for (const strategy of appliedStrategies) {
    setLastDataPullAt(strategy.id, pulledAt);
  }
}

/** Format ISO / date for Current Watch stamp: mm/dd/yyyy */
export function formatPullStamp(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    // Already a date-only string?
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
    if (m) return `${m[2]}/${m[3]}/${m[1]}`;
    return null;
  }
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}
