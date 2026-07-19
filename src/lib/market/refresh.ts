/**
 * Pass 2 live refresh — fills liveCache from Worker, updates strategy pull stamps.
 * AppState owns loading; call after auth / when holdings change.
 */

import type {
  CandleInterval,
  FundamentalSnapshot,
  MarketContext,
  Strategy,
  TechnicalSnapshot,
  TimeframedIndicators,
} from "../../types";
import { TICKERS } from "../../data";
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
  setLiveTechnicalsByTimeframe,
  setProviderBudgets,
} from "./liveCache";
import { neededTimeframesForStrategies } from "./neededTimeframes";

/** GICS sector → SPDR sector ETF (taxonomy.ts keys). Powers sectorEtf1mChangePct. */
const SECTOR_ETF: Record<string, string> = {
  Energy: "XLE",
  Materials: "XLB",
  Industrials: "XLI",
  "Consumer Discretionary": "XLY",
  "Consumer Staples": "XLP",
  "Health Care": "XLV",
  Financials: "XLF",
  "Information Technology": "XLK",
  "Communication Services": "XLC",
  Utilities: "XLU",
  "Real Estate": "XLRE",
};

/**
 * Sector ETF only for researched tickers (TICKERS registry company facts) —
 * bootstrap tickers carry a placeholder sector, and scoring a real ETF against
 * a guessed sector would fabricate data.
 */
function sectorEtfFor(ticker: string): string | undefined {
  const sector = TICKERS[ticker]?.sector;
  return sector ? SECTOR_ETF[sector] : undefined;
}

/** Weekdays (Mon–Fri) from today until `isoDate` — trading-day approximation. */
function weekdaysUntil(isoDate: string): number | null {
  const target = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (target <= today) return 0;
  let count = 0;
  const cursor = new Date(today);
  while (cursor < target) {
    cursor.setDate(cursor.getDate() + 1);
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) count += 1;
  }
  return count;
}

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

  // Candle Times needed by enabled timeframed chips on applied strategies.
  const timeframes = neededTimeframesForStrategies(appliedStrategies);

  // Fundamentals + technicals — sequential to respect free-tier budgets.
  for (const ticker of unique.slice(0, 25)) {
    const fundy = await fetchMarketFundamentals(ticker);
    if (fundy?.budgets) setProviderBudgets(fundy.budgets);
    if (fundy?.fundamentals) {
      setLiveFundamentals(ticker, fundy.fundamentals as FundamentalSnapshot);
    }
    const tech = await fetchMarketTechnicals(ticker, {
      sectorEtf: sectorEtfFor(ticker),
      timeframes,
    });
    if (tech?.budgets) setProviderBudgets(tech.budgets);
    if (tech?.technicals) {
      // daysUntilEarnings derives from the fundamentals pull (calendarEvents
      // next earnings date) — the chart-only technicals payload can't know it.
      const nextEarnings = (fundy?.fundamentals as FundamentalSnapshot | null)
        ?.nextEarningsDate;
      const technicals = tech.technicals as TechnicalSnapshot;
      setLiveTechnicals(ticker, {
        ...technicals,
        daysUntilEarnings: nextEarnings
          ? weekdaysUntil(nextEarnings)
          : technicals.daysUntilEarnings,
      });
    }
    if (tech?.byTimeframe) {
      setLiveTechnicalsByTimeframe(
        ticker,
        tech.byTimeframe as Partial<
          Record<CandleInterval, TimeframedIndicators>
        >,
      );
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
