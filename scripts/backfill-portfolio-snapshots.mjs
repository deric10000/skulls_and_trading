/**
 * One-shot Free Tier backfill for portfolio_snapshots after grant fix.
 * Reconstructs daily Open P&L % from Yahoo daily closes × current book
 * (shares / avg / cash). Cannot recover lost live writes — this rebuilds
 * what the sparkline should have accumulated.
 *
 * Usage: node scripts/backfill-portfolio-snapshots.mjs
 * Prints SQL upserts to stdout (pipe or review), or --apply with env
 * SUPABASE_DB is not used — we print SQL for MCP / psql apply.
 */
import { writeFileSync } from "node:fs";

const USER_ID = "731d2b39-bc90-4fa4-b488-cc1d4c1e056f";
const PORTFOLIO_ID = "port-1784172728752-1";
const CASH = 8018.5;
const DAYS = 30;

const HOLDINGS = [
  { ticker: "SOFI", shares: 404, avgPrice: 16.18, strategyIds: ["aggressive-ai-high-beta"] },
  { ticker: "MSFT", shares: 12, avgPrice: 393.14, strategyIds: ["value-growth-dividend"] },
  { ticker: "RGTI", shares: 60, avgPrice: 21.38, strategyIds: ["aggressive-ai-high-beta"] },
  { ticker: "IONQ", shares: 22, avgPrice: 56.36, strategyIds: ["aggressive-ai-high-beta"] },
  { ticker: "CRWV", shares: 35, avgPrice: 87.71, strategyIds: ["aggressive-ai-high-beta"] },
  { ticker: "CRM", shares: 10, avgPrice: 176.59727272727272, strategyIds: ["value-growth-dividend"] },
  { ticker: "CELH", shares: 134, avgPrice: 28.61, strategyIds: ["aggressive-ai-high-beta"] },
  { ticker: "ACHR", shares: 752, avgPrice: 5.3671490659055525, strategyIds: ["aggressive-ai-high-beta"] },
  { ticker: "ELF", shares: 90, avgPrice: 55.33, strategyIds: ["value-growth-dividend"] },
  { ticker: "NVDA", shares: 34, avgPrice: 186.55941176470589, strategyIds: ["value-growth-dividend"] },
];

const STRATEGIES = ["value-growth-dividend", "aggressive-ai-high-beta"];

async function fetchDailyCloses(ticker) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=${DAYS}d&interval=1d`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 SkullsBackfill/1.0" },
  });
  if (!res.ok) throw new Error(`${ticker} chart HTTP ${res.status}`);
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error(`${ticker} empty chart`);
  const timestamps = result.timestamp ?? [];
  const closes = result.indicators?.quote?.[0]?.close ?? [];
  const out = new Map();
  for (let i = 0; i < timestamps.length; i++) {
    const close = closes[i];
    if (close == null || !Number.isFinite(close) || close <= 0) continue;
    const asOf = new Date(timestamps[i] * 1000).toISOString().slice(0, 10);
    out.set(asOf, close);
  }
  return out;
}

function totals(holdings, prices, cash) {
  let holdingsMarketValue = 0;
  let costBasis = 0;
  let openPnl = 0;
  for (const h of holdings) {
    const price = prices.get(h.ticker);
    if (!(price > 0) || h.shares <= 0) continue;
    holdingsMarketValue += price * h.shares;
    costBasis += h.avgPrice * h.shares;
    openPnl += (price - h.avgPrice) * h.shares;
  }
  const cashAvailable = Math.max(0, cash);
  const openPnlPct = costBasis > 0 ? (openPnl / costBasis) * 100 : 0;
  return {
    holdingsMarketValue,
    costBasis,
    cashAvailable,
    totalValue: holdingsMarketValue + cashAvailable,
    openPnl,
    openPnlPct,
  };
}

function sqlNum(n) {
  if (!Number.isFinite(n)) return "0";
  return Number(n.toFixed(8)).toString();
}

function sqlStr(s) {
  return `'${String(s).replace(/'/g, "''")}'`;
}

async function main() {
  const tickers = HOLDINGS.map((h) => h.ticker);
  const byTicker = new Map();
  for (const ticker of tickers) {
    byTicker.set(ticker, await fetchDailyCloses(ticker));
    await new Promise((r) => setTimeout(r, 200));
  }

  const dates = new Set();
  for (const map of byTicker.values()) {
    for (const d of map.keys()) dates.add(d);
  }
  const sortedDates = Array.from(dates).sort();

  const rows = [];
  for (const asOf of sortedDates) {
    const prices = new Map();
    let missing = false;
    for (const ticker of tickers) {
      const px = byTicker.get(ticker)?.get(asOf);
      if (!(px > 0)) {
        missing = true;
        break;
      }
      prices.set(ticker, px);
    }
    if (missing) continue;

    const whole = totals(HOLDINGS, prices, CASH);
    rows.push({
      strategyId: "",
      asOf,
      ...whole,
    });

    for (const strategyId of STRATEGIES) {
      const scoped = HOLDINGS.filter((h) => h.strategyIds.includes(strategyId));
      const t = totals(scoped, prices, CASH);
      rows.push({
        strategyId,
        asOf,
        ...t,
      });
    }
  }

  if (rows.length === 0) {
    console.error("No complete trading days found for backfill.");
    process.exit(1);
  }

  const values = rows
    .map((row) => {
      const metrics = "{}";
      return `(${sqlStr(USER_ID)}, ${sqlStr(PORTFOLIO_ID)}, ${sqlStr(row.strategyId)}, ${sqlStr(row.asOf)}::date, ${sqlNum(row.holdingsMarketValue)}, ${sqlNum(row.costBasis)}, ${sqlNum(row.cashAvailable)}, ${sqlNum(row.totalValue)}, ${sqlNum(row.openPnl)}, ${sqlNum(row.openPnlPct)}, '${metrics}'::jsonb)`;
    })
    .join(",\n");

  const sql = `-- Backfill portfolio_snapshots (Free Tier Yahoo closes × current WB1 book)
insert into public.portfolio_snapshots (
  user_id, portfolio_id, strategy_id, as_of,
  holdings_market_value, cost_basis, cash_available, total_value,
  open_pnl, open_pnl_pct, metrics
) values
${values}
on conflict (user_id, portfolio_id, strategy_id, as_of) do update set
  holdings_market_value = excluded.holdings_market_value,
  cost_basis = excluded.cost_basis,
  cash_available = excluded.cash_available,
  total_value = excluded.total_value,
  open_pnl = excluded.open_pnl,
  open_pnl_pct = excluded.open_pnl_pct;
`;

  const outPath = new URL("./backfill-portfolio-snapshots.sql", import.meta.url);
  writeFileSync(outPath, sql);
  console.error(
    `Wrote ${rows.length} rows across ${new Set(rows.map((r) => r.asOf)).size} days → ${outPath.pathname}`,
  );
  console.log(sql);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
