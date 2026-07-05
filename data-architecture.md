# Data Architecture

How mock data is modeled today and how it gets swapped for real-time market and
brokerage data later. Pairs with the enforceable rule in
`.cursor/rules/data-architecture.mdc` (this file is the long-form reference;
the `.mdc` is the short contract the agent follows on edits).

> All data today is **static mock**. There are no APIs, no brokerage sync, and no
> live market data. Values are placeholders — see
> `.cursor/rules/security-hardening.mdc` before wiring anything realistic.

## 1. Single source of truth

`src/data.ts` holds two authoritative registries. Everything ticker- or
holding-shaped is **derived** from them, so one edit updates every surface.

- **`TICKERS`** — company-level facts that are the same regardless of who holds
  the name: `company`, `category`, `sector`, `industry`, `lastPrice`,
  `analysis`, `logs`. (`sector`/`industry` drive the Market Weather layers.)
- **`PORTFOLIOS[].holdings`** — holding-level facts that belong to a specific
  portfolio/watchlist: `shares`, `avgPrice`, `openPnlPct`, `conviction`,
  `status`, `reason`, `strategyIds`.

Derived exports (do **not** hand-edit these — edit the registries above):

| Derived export | Derived from |
|----------------|--------------|
| `INITIAL_WATCHLIST` | `DEFAULT_PORTFOLIO.holdings` via `watchlistFromHoldings()` |
| `TICKER_ANALYSIS` | `TICKERS[*].analysis` |
| `LOG_ENTRIES` | `TICKERS[*].logs` |
| `DEFAULT_ASSIGNMENTS` | `DEFAULT_PORTFOLIO.holdings[*].strategyIds` |
| `POSITIONS` | `DEFAULT_PORTFOLIO.holdings` + `TICKERS[*].lastPrice` |

**Rule of thumb:** if a value can be computed from `TICKERS`/`PORTFOLIOS`, derive
it — never duplicate the fact in a second constant where it can drift.

### Known exception (intentional)

`ALLOCATIONS`, `RISK_RULES`, and `PORTFOLIO_METRICS` are still **hand-authored
literals**, not derived. Deriving allocations accurately would require a
sector→bucket mapping and a portfolio cash balance (not modeled yet) and would
change the displayed numbers, so it was deliberately left as-is. They are still
served through the data source (below), so they stay swappable later.

## 2. The `DataSource` seam (`src/lib/datasource/`)

The one boundary between the app and its "live-ish" data. Swapping the mock for a
real API is a **single-line change** and touches no consumers.

- `DataSource.ts` — the interface. Covers only data that will eventually come
  from a market/brokerage feed: portfolios/holdings, ticker analysis, logs,
  assignments, positions, allocations, risk rules, portfolio metrics, market
  flow.
- `mock.ts` — `mockDataSource`, backed by `src/data.ts`, returns today's values
  verbatim.
- `index.ts` — exports the active `dataSource` (defaults to `mockDataSource`).

```ts
// To go live, swap one binding:
export const dataSource: DataSource = apiDataSource; // was mockDataSource
```

### Live vs. static boundary

Behind the seam (live/portfolio data → comes from a feed eventually):
portfolios, holdings, ticker analysis, logs, assignments, positions,
allocations, risk rules, portfolio metrics, market flow.

**Not** behind the seam (static configuration / reference content → plain
imports from `src/data.ts`): the strategy catalog (`DEFAULT_STRATEGIES`),
profile option lists (style/risk/horizon/focus/privacy), `DEFAULT_CAPTAIN`,
education cards, ships/badges, score copy.

`AppState` reads watchlist / assignments / logs through `dataSource`; it keeps
`DEFAULT_CAPTAIN` and `DEFAULT_STRATEGIES` as direct imports (config, not feed
data).

## 3. Going live later (Pass 2 — not done yet)

When the first real API is chosen:

1. Add an `ApiDataSource` implementing `DataSource` (fetch quotes + positions).
2. Make the interface **async** (return `Promise<…>`).
3. Add `loading` / `error` / `lastUpdated` handling **in `AppState` only** — the
   single owner of app state. Components keep reading from `AppState`.
4. Split a holding into **brokerage/quote fields** (live: `shares`, `avgPrice`,
   `openPnlPct`, `lastPrice`) vs. **app overlay** (user/AI: `conviction`,
   `status`, `reason`, `strategyIds`, analysis, logs), merged by ticker — so a
   quote tick never overwrites an AI-generated status.

Keep all transforms (e.g. `watchlistFromHoldings()`) **pure** so they work
unchanged once data arrives over the wire.

## 4. How to add or change data

- **New ticker:** add an entry to `TICKERS` (company facts + analysis + logs).
- **New holding:** add a `PortfolioHolding` to the relevant `PORTFOLIOS` entry.
- **New portfolio/watchlist:** add a `Portfolio` to `PORTFOLIOS` (`type:
  "portfolio"` = read-only/live-connected; `type: "watchlist"` = user-editable).
- **Reading data in a component:** import `dataSource` from `../lib/datasource`
  (or read derived state from `AppState`). Do **not** import live-data constants
  from `src/data.ts` directly.

## 5. Market Weather (`src/lib/weather/`)

Reads five instruments (trend, breadth, volatility, risk appetite, rotation)
across four layers (market → sector → industry → stock) and turns them into one
of 10 plain-English weather conditions. It is **not** advice and never produces
buy/sell calls ("We don't predict the future — we read the conditions").

Module map:

| File | Role |
|------|------|
| `types.ts` | All weather types (timeframe, layer, sub-scores, trend inputs, reading, condition def, snapshot). |
| `conditions.ts` | The shared 10-condition library (label, colors, icon, copy, `dynamicGraphicKey`). |
| `scoring.ts` | Pure engine: trend score, weather score, priority classification, confidence (+ session caps), 200-day climate context, "why" copy. |
| `session.ts` | ET-clock session detection (premarket / live / afterhours), DST-safe via `Intl`. |
| `mock.ts` | Authored sub-score seeds → readings via the engine, assembled into a per-session snapshot. |
| `graphics.ts` | Resolves a `dynamicGraphicKey` to a background treatment (gradient fallback now, image/video later). |

Scoring is **provider-agnostic** — `buildReading()` takes normalized 0–100
sub-scores and climate inputs, so the same engine runs on mock and real data.

### Going live — one fetch per session, app-wide

`getMarketWeather(timeframe)` returns a `MarketWeatherSnapshot` covering **every**
sector, industry, and tracked stock, plus `industrySectors` (the industry→sector
taxonomy the client uses to cascade the layers). The contract for the real API
layer:

- Fetch **one** snapshot per session (premarket / live / afterhours), not per
  user and not per render.
- Refresh it at each **session boundary** (the time a session starts), so it
  updates automatically for everyone; logging in mid-session reuses the cached
  snapshot instead of re-fetching.
- Cache it **app-wide** (shared across users). The mock approximates this with a
  per-session `Map` cache in `weather/mock.ts`.
- Filter per user **client-side** by mapping their watch tickers →
  `TICKERS[ticker].sector` / `.industry` (no extra calls per user).

The widget (`MarketFlowWidget`) is read-only on the home page: it detects the
session, pulls the snapshot through the `dataSource` seam, and focuses
sector/industry/stock on the name selected in Current Watch (or the first watch
name by default). The Sector/Industry droplists span the full universe while the
Stock layer is scoped to the watch; the three **cascade** (Sector → first
Industry → first watch stock, with the Stock card disabled when the watch holds
no name in that slice). All of it is local to the widget — it never writes back
to the Current Watch selection.

## 6. Strategy Forge (`src/lib/forge/`)

The Forge turns a strategy's **rule chips** + a stock's data into a 0–100
**Strategy Conviction** and an alignment status, then plumbs that downstream to
the Home/Dashboard chips. The long-form framework (six categories, weighting,
gates, cadence) lives in `docs/strategy-forge.md`; this section is the **data
flow**.

### Inputs — behind the `DataSource` seam

Three accessors feed the engine and are swappable for a live provider exactly
like the rest of the seam. A missing metric returns `null` ("no data") — never a
fabricated value.

| Accessor | Returns | Seeded from |
|----------|---------|-------------|
| `getFundamentals(ticker)` | `FundamentalSnapshot` (EPS, growth, margins, P/E, D/E, FCF) | `FUNDAMENTAL_SNAPSHOTS` |
| `getTechnicals(ticker)` | `TechnicalSnapshot` (RSI, VWAP, EMA distances) | `TECHNICAL_SNAPSHOTS` |
| `getMarketContext()` | `MarketContext` (VIX, SPY RSI) | `MARKET_CONTEXT` |
| `getBuckets()` | `Bucket[]` (portfolio slices governed by one strategy) | `DEFAULT_BUCKETS` |

Snapshots carry an `asOf` timestamp and `source: "mock"`. They are **researched
real values** (last close + latest reported fundamentals), not random — so the
mock validates like the real thing. Update them only with real, sourced figures.

### Engine — pure, no I/O (`src/lib/forge/`)

| File | Role |
|------|------|
| `metrics.ts` | The **metric registry** — single source of truth for every data point a chip can test (label + plainLabel, source snapshot, operators, unit). Drives the chip editor and tells the engine where to read each value. |
| `scoring.ts` | Pure functions: `evaluateChip` → category sub-scores → weighted blend → `scoreStock`. Thesis is a boolean composite (AND within a group, OR across groups). **Gates** (failed thesis, breached risk) override + clamp conviction so the meter stays coherent with the status chip. |
| `alignment.ts` | The **bridge**: pulls snapshots through `dataSource`, scores each holding in each bucket, and aggregates **market-value-weighted** conviction `byTicker` (best-aligned bucket = headline), `byBucket`, and `portfolio`. |
| `scheduler.ts` | Stubbed per-bucket refresh scheduler. No-op against mock; establishes the gated (market-hours / tab-visible / cache-stale) contract for live data. |

To add a metric: add the key to `MetricKey` (`types.ts`), seed it in the
snapshots (`data.ts`), and register it in `metrics.ts`. Nothing else changes.

### Buckets — independent cadence per strategy

A portfolio is split into **buckets**; each bucket is governed by one strategy
(which carries its own `checkInterval` + `technicalsInterval`) and holds a share
allocation of one or more tickers. A ticker may live in **several** buckets
(e.g. 100 sh in a daily "Core Growth", 10 sh in a 15m "Momentum") — each slice
is scored by its bucket's strategy on its own cadence. Modeled + seeded now;
the bucket/share-allocation **authoring UI is a later dashboard pass**.

### Conviction flows downstream (no new UI system)

`AppState` computes `alignmentByPortfolio` from `buckets` + `strategies` + the
snapshots, then **overlays** the computed `conviction`/`status` onto the
watchlist items. The Home `WatchlistWidget`, snapshot, and Dashboard read these
decorated values — the existing chips/meters just reflect the engine. "Notify"
means these in-app chips update; there is **no** push-notification system.

### Cadence rules (enforced in the Forge UI)

- `checkInterval` (15m → 1M, default Daily) is the re-score + chip-refresh
  cadence and the **default** technicals candle size.
- `technicalsInterval` is user-adjustable but clamped: **≥ 15m** and **never
  faster than `checkInterval`** (we couldn't refresh data we don't poll for).
- Fundamentals refresh on a fixed daily cadence and are **not** user-selectable.

### Chip library

Reusable rule chips live in `AppState.chipLibrary` (seeded from
`CHIP_LIBRARY_SEED`). "Save to library" in the chip editor adds a copy; adding
from the library clones a chip into the current strategy. The library is
in-memory app config, **not** behind the `DataSource` seam.
