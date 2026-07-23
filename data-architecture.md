# Data Architecture

How mock data is modeled today and how it gets swapped for real-time market and
brokerage data later. Pairs with the enforceable rule in
`.cursor/rules/data-architecture.mdc` (this file is the long-form reference;
the `.mdc` is the short contract the agent follows on edits).

> **Beta 0:** Market quotes/fundies/techs/Weather are FreeTier via the Worker.
> **User workspaces** (portfolios, strategies, chips) persist in **Supabase
> Postgres** behind invite-only auth — see § Forge / user persistence below.
> Seed `PORTFOLIOS` in `src/data.ts` are fixtures for mock/demo catalogs only;
> Beta accounts start empty and do not hydrate those books.

## 1. Single source of truth

`src/data.ts` holds two authoritative registries. Everything ticker- or
holding-shaped is **derived** from them, so one edit updates every surface.

- **`TICKERS`** — company-level facts that are the same regardless of who holds
  the name: `company`, `category`, `sector`, `industry`, `lastPrice`,
  `priceAsOf`, `analysis`, `logs`. (`sector`/`industry` must be exact GICS keys
  from `weather/taxonomy.ts` so Market Weather cascade labels match weather
  readings 1:1; `lastPrice`/`priceAsOf` are the mock quote seed — swap via
  `DataSource.getQuote()` when live.)
- **`PORTFOLIOS[].holdings`** — holding-level facts that belong to a specific
  portfolio/watchlist: `shares`, `avgPrice`, `openPnlPct`, `conviction`,
  `status`, `reason`, `strategyIds`. Open P&L display should prefer
  recomputing from `lastPrice` vs `avgPrice` (average-cost method). Confirmed
  qty edits append session `ShareFillEvent`s in AppState (live: brokerage fill
  ledger later). Optional `Portfolio.cashAvailable` is settled cash for running
  totals (not a holding row).

## 1a. All seeded sources unless the user scopes

Any change that touches portfolio/watchlist seed data, `appliedPortfolioIds`,
scoring filters, Current Watch edit-mode paths, quotes/fills, or Forge apply
lists must cover **every** `PORTFOLIOS` entry (and the same pattern for
session-created or future API sources). Never hand-seed only `deric` /
`PORTFOLIOS[0]`. Prefer derive-from-holdings
(`portfolioIdsReferencingStrategy` in `src/lib/forge/appliedPortfolios.ts`).
If scope is ambiguous, **stop and ask** — the default is all sources.

Prefer a derived helper over parallel hand-maintained apply lists so new seeded
sources cannot be forgotten. Seed + demo-load assert via
`assertAppliedPortfoliosCoverHoldings`.

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
sector→bucket mapping (and would change displayed numbers), so it was
deliberately left as-is. They are still served through the data source (below),
so they stay swappable later.

`Portfolio.cashAvailable` is the settled cash balance for Current Watch running
totals (holdings market value + cash). Seeded on demo portfolios; watchlists and
new sources default to `0`. **Editable** on portfolio sources in Current Watch
edit mode via `AppState.updatePortfolioCash` (clamped ≥ 0; persists with
`user_state`). Watchlists stay display-only / 0. Not used to re-derive
`ALLOCATIONS`.

### Portfolio transaction ledger (`user_state.share_fills`)

Qty confirms and manual cash saves append `PortfolioTransaction` rows (legacy
`ShareFillEvent` qty shapes still load via `normalizePortfolioTransactions`).
Kinds: `qty` | `cash`. Optional stamps at write time (do **not** change Forge
scoring / Layer 3 zone math): `actionClass` (`trim` | `add` | `hold` |
`go_to_cash` | `deposit` | `withdrawal` | `unclassified`), `strategyIds`,
`zoneHints`. Editable `filledAt` on the Current Watch review modal records when
the Captain says the simulated buy/sell/deposit/withdrawal happened.

**Manual cash only** creates `cash` ledger rows (Simulated Cash Deposit /
Withdrawal). Qty-driven cash moves from paper buys/sells update
`cashAvailable` without a cash ledger row — the qty fill is the record.
`metrics.cashAdded` / `metrics.cashWithdrawn` on daily `portfolio_snapshots`
sum same-day cash ledger deltas for Helm “Cash Added over Time.” Hold-from-
inaction is recorded as `forge_check_events.kind = 'hold'` on each check when
no qty fill landed in the cadence bucket (Plan Adherence Total Actions).
Optional later: promote the qty/cash ledger to a dedicated Postgres table.

## 2. The `DataSource` seam (`src/lib/datasource/`)

The one boundary between the app and its "live-ish" data. Swapping the mock for a
real API is a **single-line change** and touches no consumers.

- `DataSource.ts` — the interface. Covers only data that will eventually come
  from a market/brokerage feed: portfolios/holdings, ticker analysis, logs,
  assignments, positions, allocations, risk rules, portfolio metrics, market
  flow, Forge snapshots, Weather.
- `mock.ts` — `mockDataSource`, backed by `src/data.ts` (fixtures / offline).
- `freeTier.ts` — FreeTier live paths via Worker + `liveCache` (active).
- `index.ts` — exports the active `dataSource` (`freeTierDataSource`).

```ts
export const dataSource = freeTierDataSource;
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

## 3. Going live (Pass 2 — FreeTier live market data)

Active binding: `src/lib/datasource/index.ts` exports `freeTierDataSource`.
Market quotes, fundamentals, technicals, market context, Weather inputs, and
symbol search are filled through Cloudflare Worker routes under `/api/market/*`
(`worker/market.ts` + `worker/marketCycle.ts`), cached durably in Workers KV,
then committed atomically to `src/lib/market/liveCache.ts` by `AppState`.

1. **FreeTierDataSource** implements `DataSource` for live fields; portfolios /
   holdings / logs remain mock seeds until brokerage Pass 2+.
2. Authenticated clients only register their unique watch symbols (40/user,
   800 globally across active registries) and
   read the latest completed cycle. **Login, manual refresh, and portfolio edits
   never query an upstream market provider.** A one-minute Worker cron shards
   each hourly sweep under Free-plan limits (50 external subrequests/invocation,
   Yahoo soft budget ~30/min), checkpoints it in KV, and publishes one atomic
   cycle at a fixed hour boundary.
3. Holding split: live quote fields (`lastPrice` via `getQuote` /
   `getTickerInfo`) vs app overlay (`conviction`, `status`, `reason`,
   `strategyIds`) — a quote tick never wipes Forge overlay.
4. **Ticker search:** `asyncSearchTickers` → Worker Yahoo search. Never merge
   with quarantined `TOP_SEARCH_TICKERS` (mock-only).
5. **Cadence:** Check cadence offers 1h/2h/4h/Daily/Weekly/Monthly plus a
   multi-select of 4 session closes (premarket/regular/after-hours/overnight ET).
   **1h is the reliable floor; 15m/30m are disabled Future Capability.**
   Strategy checks always run for applied strategies; `cadenceEnabled` is now
   the **Enable Notifications** preference only (delivery remains future).
   Each chip reads the last closed candle of its own Time. Persisted 15m/30m
   chips auto-migrate to 1h; any invalid straggler is excluded as no-data.
6. **Availability layers:** `liveCoverage.ts` + Forge dropdown prune; null =
   no-data; critical nulls → `NeedsDataReviewFlag`. Free-tier coverage is
   maximal for the current channels: fundamentals map from Yahoo quoteSummary
   (`financialData` / `defaultKeyStatistics` / `summaryDetail` /
   `calendarEvents` — module + unit fidelity matters: D/E percent→ratio,
   cash-flow dollars→$B). **Timeframed technicals:** Yahoo returns raw OHLCV
   only; the Worker (`worker/indicators.ts` + `?timeframes=`) computes a
   comprehensive-core TA library (RSI, Stochastic, StochRSI, Williams %R, CCI,
   MACD line/signal/hist, ROC, SMA/EMA, ADX/+DI/−DI, Aroon, ATR%, Bollinger
   %B/bandwidth, Donchian, relative volume, session VWAP, MFI, CMF, OBV %chg)
   per candle Time (1h/2h/4h/1D/1W/1M). The cron fetches one closed 1h OHLCV
   series per ticker and resamples longer Times locally; insufficient lookback
   stays null. Chips store Time in `RuleChip.dateRange`; scoring reads
   `getTechnicalsByTimeframe`. Legacy daily snapshot fields
   remain for non-timeframed reads + mock seeds. Also daily: 1Y beta vs SPY,
   `daysUntilEarnings`, `sectorEtf1mChangePct` (GICS→SPDR, researched
   `TICKERS` only). Excluded (no honest free source; never fabricate):
   `interestCoverage`, `dividendGrowth5yPct`, `buybackYieldPct` — see
   `liveCoverage.ts`.
7. **Weather:** FreeTier builds readings from live `MarketContext` via
   `weather/live.ts` (mock seeds quarantined for `mockDataSource` only).
   Sector/industry keys come from `weather/taxonomy.ts` (GICS 11 / 74 SSOT).
   `TICKERS[].sector` / `.industry` must map into that taxonomy (asserted at
   snapshot build) — do not invent parallel nicknames in `live.ts` / `mock.ts`.

```ts
// Active binding today:
export const dataSource = freeTierDataSource;
```

Keep all transforms (e.g. `watchlistFromHoldings()`) **pure**.

### Quarantined mock catalogs

`TOP_SEARCH_TICKERS` and static `MARKET_CONTEXT` remain in `src/data.ts` for
`mockDataSource` / fixtures only. FreeTier must not dual-read them for the
same field once that field is on the live path.

## 4. How to add or change data

- **New ticker:** add an entry to `TICKERS` (company facts + analysis + logs).
  `sector` / `industry` must be exact keys from `weather/taxonomy.ts` (GICS).
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
| `taxonomy.ts` | Canonical GICS 11 sectors + 74 industries (Weather browse SSOT). |
| `mock.ts` | Authored sub-score seeds for `mockDataSource` only (quarantined); emits full taxonomy. |
| `live.ts` | FreeTier Weather from live `MarketContext`; sector/industry keys from `taxonomy.ts`. |
| `graphics.ts` | Resolves a `dynamicGraphicKey` to a background treatment (gradient fallback now, image/video later). |

Scoring is **provider-agnostic** — `buildReading()` takes normalized 0–100
sub-scores and climate inputs, so the same engine runs on mock and live data.

### Going live — one fetch per session, app-wide

`getMarketWeather(timeframe)` on FreeTier builds from the latest live
`MarketContext` (Worker: SPY / VIX / FRED) and caches per timeframe until the
next context refresh clears it. Macro inputs refresh with market context
(session / daily TTL on the Worker). The snapshot always includes **every**
GICS sector and industry reading (one key → one projection). Filter per user
**client-side** by mapping watch tickers → `TICKERS[ticker].sector` /
`.industry` (must equal taxonomy keys).

The widget (`MarketFlowWidget`) is read-only on the home page: it detects the
session, pulls the snapshot through the `dataSource` seam, and focuses
sector/industry/stock on the name selected in Current Watch (or the first watch
name by default). Sector/Industry use `SearchableSelect` typeahead over the
full GICS universe (industry list filtered to the selected sector); the Stock
layer is scoped to the watch. The three **cascade** (Sector → first Industry →
first watch stock, with the Stock card disabled when the watch holds no name in
that slice). All of it is local to the widget — it never writes back to the
Current Watch selection.

## 6. Strategy Forge (`src/lib/forge/`)

The Forge turns a strategy's **rule chips + tags** + a stock's data into a
0–100 **Strategy Conviction** and an alignment status, then plumbs that
downstream to the Home/Dashboard chips. The long-form framework (six
categories, the weight hierarchy, the normalization algorithm, completeness
rules, cadence) lives in `docs/strategy-forge.md`; this section is the **data
flow**.

### Inputs — behind the `DataSource` seam

Three accessors feed the engine and are swappable for a live provider exactly
like the rest of the seam. A missing metric returns `null` ("no data") — never a
fabricated value.

| Accessor | Returns | Seeded from |
|----------|---------|-------------|
| `getFundamentals(ticker)` | `FundamentalSnapshot` (EPS, growth, margins, valuation, balance sheet, dividend/buyback) | `FUNDAMENTAL_SNAPSHOTS` |
| `getTechnicals(ticker)` | `TechnicalSnapshot` (SMA trend flags, RSI, drawdown, rel. volume, ATR%, beta, liquidity, earnings distance, sector 1M) | `TECHNICAL_SNAPSHOTS` |
| `getMarketContext()` | `MarketContext` (VIX, SPY RSI, SPY vs 200D, SPY 5D, HY credit spread, 10Y 5D change) | `MARKET_CONTEXT` |
| `getBuckets()` | `Bucket[]` (portfolio slices governed by one strategy) | `DEFAULT_BUCKETS` |

Snapshots carry an `asOf` timestamp and `source: "mock"`. They are **researched
real values** (last close + latest reported fundamentals), not random — so the
mock validates like the real thing. Update them only with real, sourced
figures. Each snapshot also carries an optional `sourceNotes` (free text,
human-facing only — the scoring engine never reads it) explaining where its
figures came from and why any given field is `null`; see the per-ticker notes
in `data.ts` for the current sourcing. Refreshed **2026-07-07** for the 10
tickers across the seeded portfolios/watchlists (`NVDA, MSFT, CRM, SOFI, IONQ,
ACHR, CELH, CRWV, ELF, RGTI`) — verified against `scripts/
verify-forge-scoring.ts`, which still passes.

A `null` field means the metric is genuinely unavailable **or** the ratio
itself isn't informative for that ticker (e.g. a margin computed over
near-zero revenue, or a metric distorted by a one-time non-cash gain) — never
"the company performed badly." A real, very negative number (e.g. an
operating margin of -400% for an R&D-heavy pre-scale company) is preferred
over `null` whenever the ratio is genuinely computable and not misleadingly
distorted, since that's a real, informative signal that should legitimately
fail its rule chip — see each ticker's `sourceNotes` for the specific
reasoning. `null` still means "not scored," never "failed" (enforced by
`scoreCategory` in `scoring.ts`, which excludes `"no-data"` chips from both the
numerator and denominator — see §6 below).

### Engine — pure, no I/O (`src/lib/forge/`)

| File | Role |
|------|------|
| `metrics.ts` | The **metric registry** — single source of truth for every data point a chip can test (label + plainLabel, tooltip copy, source snapshot, conditions, date ranges, unit/format). Drives the table-modal dropdowns and tells the engine where to read each value. |
| `scoring.ts` | Pure functions implementing the algorithm in `docs/strategy-forge.md`: resolve active chips (tag lens union, deduped; default = All Active Chips) → pass/fail per chip → **normalize active rule weights to 100% of the category** → `categoryScore × categoryWeight` → summed conviction. Categories with `categoryEnabled[cat] === false` are skipped (see `categoryEnabled.ts`). Also `validateStrategy` (completeness checks that gate "Apply to Portfolio"). No thesis/risk gates or conviction clamps — category weights carry that dominance. |
| `categoryEnabled.ts` | Helpers for which Forge categories contribute to conviction: `isCategoryEnabled`, renormalize weights on disable, `patchCategoryEnabled`. |
| `status.ts` | **Unified status resolver** — Layer 1 conviction band + Layer 2 per-category diagnostic ladders + Layer 3 zone flags (`zoneFlags` / `zoneSurface`) → `ResolvedStatus`. Zone overlays are authored on the strategy and evaluated by `evaluateZoneFlags` (fail → fire); Trim/Add on tickers, Go to Cash on portfolio. Portfolio aggregation MV-weights category scores before resolving. Compass variant (bull/bear/placeholder) derived from primary only. |
| `alignment.ts` | The **bridge**: pulls snapshots through `dataSource`, scores each holding in each bucket (including `holdingDays` from the bucket `entryDate`), and aggregates **market-value-weighted** conviction + resolved status `byTicker` (best-aligned bucket = headline), `byBucket`, and `portfolio`. |
| `scheduler.ts` | Stubbed per-bucket refresh scheduler. No-op against mock; establishes the gated (market-hours / tab-visible / cache-stale) contract for live data. |

To add a metric: add the key to `MetricKey` (`types.ts`), seed it in the
snapshots (`data.ts`), and register it in `metrics.ts`. Nothing else changes.

### Rule chips + tags (per strategy)

- A `RuleChip` = label + metric + date range + condition + value +
  `weightPct` (0–100 within its category) + `enabled` + an optional
  `libraryChipId` (set only when added from a saved custom chip — see "Chip
  library" below).
- A `RuleTag` = label + purpose + member `chipIds` + `weightPct` (0–100 within
  its category's tags) + auto-apply guidance. Each category has a built-in
  `All Active Chips` system tag (`system: true`, weight 100, not deletable).
- Both live on the strategy (`strategy.rules`, `strategy.ruleTags`) and are
  edited through the table modals on the Configure card. Duplicating a strategy
  deep-copies both; new blank strategies seed empty categories with default
  category weights and the system tags.
- `strategy.categoryWeights` + optional `strategy.categoryEnabled` set each
  category's share of conviction and whether it contributes at all. Edited on
  Description → Conviction Scores (and per-category weight chips). Disabling a
  category parks its weight exactly (still shown, disabled) and scales the
  other enabled categories up to 100%; turning it back on restores that parked
  weight and scales the others down to `(100 − parked)`. Omitted
  `categoryEnabled` keys default to on. For `isDefault` strategies these two
  fields are apply-overlay prefs (like `tickerExclusions`) — seed still owns
  rules/tags.
- **Layer 3 zone overlays** (`trimZoneRules`/`trimZoneTags`,
  `addZoneRules`/`addZoneTags`, `goToCashRules`/`goToCashTags`) are authored
  under Trade Management → Trim Zone / Add Zone / Go to Cash - SICADFU. These are
  independent copies — never read by `scoreStock` / `validateStrategy` for
  conviction. `evaluateZoneFlags` fires a zone when any active chip fails;
  Trim/Add attach to ticker `ResolvedStatus`, Go to Cash to portfolio only.
- `strategy.appliedPortfolioIds` records which portfolios/watchlists the
  strategy is applied to. It's edited via the "Applied Portfolios" multi-select
  on the Configure card. Blank/duplicated strategies start unapplied (`[]`).
  Default strategy seeds derive this list via
  `portfolioIdsReferencingStrategy(PORTFOLIOS, strategyId)` — never
  hand-seed only `["deric"]`. Demo localStorage backfills the same coverage
  for `isDefault` strategies on load (seed wins; Demo Captain is ephemeral).
  **Invariant:** for every portfolio `P` and holding `H`, every
  `strategyId` in `H.strategyIds` must satisfy `P.id ∈ strategy.appliedPortfolioIds`
  (`assertAppliedPortfoliosCoverHoldings`). Enabling a ticker for a strategy
  via `setTickerEnabledForStrategy` also ensures the source is on the apply
  list. New empty Create sources stay unapplied until Forge Apply.
  **Scoring respects `appliedPortfolioIds`:** a bucket only contributes when
  its strategy lists the bucket's portfolio; tickers in an applied portfolio
  with no bucket row for that strategy are scored via an **applied-portfolio
  fallback** slice (full holding shares). Custom/duplicated strategies therefore
  work immediately once applied — no bucket row required. The Configure card's
  read-only **"Tickers In Applied Portfolios"** box lists every ticker held in
  the currently-applied portfolios. The **Tickers** tab lists every holding in
  each applied portfolio; tap a ticker to include or exclude it from this
  strategy. Default strategies honor seed `holding.strategyIds`; custom copies
  include all tickers until excluded via `strategy.tickerExclusions`.

### Seed data — one strategy per ticker

Demo portfolios assign each ticker to **exactly one** default strategy via
`holdings[].strategyIds` (by company type: AI/quantum/speculative → Aggressive
AI; compounders/consumer/fintech → VGD). A ticker may still appear in
**multiple bucket slices** (e.g. SOFI 57 sh + 10 sh with different entry dates),
but every slice uses the **same** `strategyId`.

**Runtime wiring:** `holding.strategyIds` is the per-ticker assignment for
default strategies. Custom strategies track exclusions in
`strategy.tickerExclusions[portfolioId]`. Both are edited live in AppState via
the Configure **Tickers** tab (`setTickerEnabledForStrategy`). Scoring
(`computePortfolioAlignment`), Watch summary strategy chips
(`getAppliedStrategiesForTicker`), and Forge ticker toggles all respect
`shouldScoreTickerWithStrategy()` — NVDA scores Aggressive only, CRM VGD only,
within each applied source. When a
holding lists **multiple** `strategyIds`, headline conviction merges both
strategies via `mergeStrategiesForScoring()` (chip + category weights
renormalized, then one `scoreStock` pass — not a conviction average or
max-slice pick).

### Buckets — independent cadence per strategy

A portfolio is split into **buckets**; each bucket is governed by one strategy
(which carries its own `checkInterval` + `technicalsInterval`) and holds a share
allocation of one or more tickers. A ticker may live in **several** slices within
the same strategy (different share counts / entry dates). Modeled + seeded now;
the bucket/share-allocation **authoring UI is a later dashboard pass**.

### The Helm — derived progress metrics

`HelmMetrics` (`src/components/helm/HelmMetrics.tsx`) live tiles are a **pure
read** of alignment + holdings (no scoring changes). The **portfolio** mirrors
the Current Watch selection via one shared **UI** selection value in `AppState`
(`selectedPortfolioId`, set from `WatchlistWidget`; the forge Watch Preview
instance never writes it). **Strategy scope** is also shared Home UI state
(`watchStrategyScopeId`, null = All strategies) — Helm Progress and Current
Watch filtering stay in sync; Forge Watch Preview keeps a local scope and does
not write the shared marker. Neither selection is persisted to `user_state`.
Metrics reduce an existing `PortfolioAlignment` (all-strategy memoized
`getPortfolioAlignment`, or scoped to `[focusedStrategy]` via
`computePortfolioAlignment` when one strategy is picked) through the pure
`src/lib/forge/helmMetrics.ts` (`computeHelmMetrics`): MV-weighted conviction,
aggregate open P&L (open P&L / cost basis via `portfolioRunningTotals`), strategy
coverage, status mix (by `STATUS_TONE`, shown as Plan Alignment chips), and
composition by headline bucket/lens (rendered as its own Progress-style section
of metric cards — placeholder `held/held` until Forge position-holdings rules
supply a target). When a single strategy is picked, every Progress metric —
**including Open P&L** — reduces only over holdings enabled for that strategy
(`shouldScoreTickerWithStrategy` / `tickerInScope`, same rule as Current Watch's
strategy filter); "All strategies" uses the whole book.

**Conviction change** (additive): `portfolio_snapshots.metrics.conviction` stores
the MV-weighted book mark on **check days** (America/New_York `as_of`, aligned
with Last Conviction Check). Mid-day refreshes still upsert Open P&L for today
but only stamp `metrics.conviction` when a cadence/immediate check landed that
ET day (or the write itself is check-driven). Helm “today” / “5 sessions”
deltas only render after a **same-day** stamped mark exists — live drift against
a lone older mark is not labeled “today”. Ticker drivers come from
`conviction_snapshots` deltas + live weakest category labels (Thesis Fit /
Technical Setup, etc.). No fabricated history when marks are missing.

**Open P&L history** (additive): daily rows in `portfolio_snapshots` (see below).
Helm fetches the series for the mirrored portfolio + scope and renders a lazy
`SparklineChart` when ≥2 distinct `as_of` days exist. Spark tips/axis are clipped
through the Last Conviction Check ET day so a mid-day refresh cannot show a
calendar day ahead of the toast. No fabricated backfill.

**Shared Helm timeframe** (`src/lib/finance/helmTimeframe.ts`): default `1w`
(indicator only; toggle UI later). Also plumbs `1m` / `1y` / `ytd` plus cadence
floors `1h` / `2h` / `4h` when the focused strategy allows; **All strategies**
uses the coarsest (slowest) floor among applied strategies. Total Conviction,
Open P&L, and Plan Adherence all read the same clamped timeframe.

**Plan Adherence** (below Composition): Notifications (check-event flag counts,
with proxies from `conviction_snapshots` / book `metrics.conviction` check days
when append-only events are not yet present — so a Total Conviction check mark
never implies “No checks in range”), Total Actions (ledger buys/sells/cash +
hold-inaction events; hold proxies fill the same check days when no same-day
qty fill exists), Zone-Followed Impact (MV-weighted forward return after
**zone-matched qty fills only** — Trim/Add/Go to Cash via `zoneHints` or
same-day check flags; Hold counts Total Actions but does not score Impact).
Honest empty states when no check-day marks exist at all.

### Forge check events (`forge_check_events`)

Append-only rows written after a successful strategy check
(`persistForgeCheckEvents`):

- `kind = status` — per in-scope ticker: `primary_status`, `flags` (L2 + L3),
  `conviction`, `checked_at`, ET `as_of`
- `kind = hold` — same grain when no qty buy/sell landed in the cadence bucket
  ending at `checked_at` (promotes hold-from-inaction to shipped)

RLS by `auth.uid()`; insert+select for `authenticated`. Failures surface via
`setMarketError` (not silent-only).

### Daily book + ticker snapshots

Written after live market pull (`persistBookAndConvictionMarks` from
`refreshLiveMarket` and `refreshStrategyTickers`) — **additive marks only**;
Forge conviction / chip / zone math and `portfolioRunningTotals` are unchanged.

- **`portfolio_snapshots`**: one row per `(user, portfolio_id, strategy_id,
  as_of)` where `as_of` is the America/New_York session day of the market
  cycle/quotes (not the writer's UTC wall clock). Non-check refreshes cap
  `as_of` to the latest Last Conviction Check day so Open P&L cannot invent a
  spark day ahead of that toast. Check-driven writes may advance the day.
  `strategy_id = ''` = whole book (all holdings + `cashAvailable`).
  Strategy-scoped rows use holdings enabled for that strategy
  (`shouldScoreTickerWithStrategy`) **plus the same cash**. Core columns mirror
  Current Watch totals: `holdings_market_value`, `cost_basis`, `cash_available`,
  `total_value`, `open_pnl`, `open_pnl_pct`. Forward-compatible `metrics jsonb`
  for future daily book fields — currently includes MV-weighted `conviction`
  (check-day only; see Conviction change above), plus same-day `cashAdded` /
  `cashWithdrawn` from the cash ledger (manual deposits/withdrawals only; do
  not delete core columns into jsonb). Upsert last-write-wins. Skip incomplete
  books rather than fabricate prices.
- **`conviction_snapshots`**: same unique grain; **enrich `payload`** at write
  with per-ticker marks (`portfolioId`, `shares`, `avgPrice`, `lastPrice`,
  `marketValue`, `costBasis`, `openPnl`, `openPnlPct`) — future per-name fields
  land in `payload` the same way. Read helpers: `fetchPortfolioSnapshots`,
  pure `seriesToSparkPoints` (`src/lib/finance/portfolioSnapshotSeries.ts`).

### User persistence (Beta 0 — Supabase)

Invite-only accounts hydrate Home + Forge editable state from Postgres
`user_state` (`src/lib/userStore/`, RLS by `auth.uid()`). Debounced save on
change. **Postgres is source of truth** (not `localStorage`).

- New Beta users start with **empty portfolios/watchlists**; seed `PORTFOLIOS`
  are not hydrated.
- `DEFAULT_STRATEGIES` remain available; bodies always re-seed from
  `src/data.ts` on hydrate; only `appliedPortfolioIds` / `tickerExclusions`
  merge from storage. Defaults reject body patches in `updateStrategy`.
- `conviction_snapshots` upsert on market / cadence refresh with enriched
  position `payload` (charts / marks; scoring unchanged).
- `portfolio_snapshots` upsert on the same refresh paths (whole-book +
  per-applied-strategy; cash always included).
- `ticker_marks` stores each account's latest real quote (`ticker`,
  `last_price`, `as_of`, `source`) under RLS. Auth hydration commits these
  marks to `liveCache` before the first market-cycle read, so local and deployed
  clients show the same last price for the same account. Marks never imply that
  conviction has been checked.
- `user_state.flags` (`UserFlags` in `src/lib/userStore/`) is a small map of
  **one-shot per-user UI markers** — currently:
  - `onboardingSeen` — set when the first-login Onboarding modal
    (`OnboardingModal`) is dismissed (`AppState.needsOnboardingModal` /
    `dismissOnboardingModal`). The modal's last step carries the legal
    disclaimer: Acknowledge clears the per-session legal gate too; closing
    early pops the standalone legal modal instead.
  - `badgeToastsSeen` — onboarding badge IDs that already fired their
    congratulations toast (or were silently backfilled when the milestone was
    already true at hydrate). Earn display still **derives** from live
    portfolios/strategies (+ weather visits) via
    `src/lib/forge/onboardingBadges.ts`; do not persist earn state here.
    Visible starters: First Portfolio / Watchlist / Strategy Applied / Custom
    Strategy / Weather Reader; **Onboarding Complete** (`MapTrifold`) earns
    when all five starters are true. `AppState.markBadgeToastsSeen`.
  - `weatherReaderLayers` — Market Weather layers the Captain has opened in
    detail (card click): `market` / `sector` / `industry` / `stock`. When all
    four are present, the Weather Reader badge earns. Written by
    `AppState.markWeatherReaderLayer` from `MarketFlowWidget` (not from
    dropdown/prev-next alone).
  - `lastDataPullAtByStrategyId` — the last successful real check boundary per
    strategy. It hydrates `liveCache` across local/deployed clients and is the
    persisted readiness stamp behind Score Pending Next Check.
  Flags ride the normal workspace load/save path; they are markers, not
  workspace data — do not stash content there. QA reset:
  `update user_state set flags = '{}'::jsonb where user_id = …` re-triggers
  first-login surfaces for a test account (and can re-fire badge toasts unless
  milestones are silently backfilled again on load).
- Soft caps: `src/lib/forge/budgets.ts` (tickers + active chips); Admin bypass.
- Schema: `supabase/schema.sql`. Auth helpers: `src/lib/auth/`.

Legacy `src/lib/forge/persistence.ts` localStorage helpers remain for fixtures /
offline only — do not use as SoT for Beta accounts.

### Cadence rules

- Data plane: `worker/marketCycle.ts` — one-minute cron shards build a globally
  coalesced hourly cycle from the durable per-user symbol registry. A cycle is
  published only after all ticker batches finish; clients never see partial data.
- Scoring plane: `src/lib/forge/scheduler.ts` — **per-strategy** dues read the
  latest completed cycle and run pure scoring. Notification preferences do not
  gate checks; login/manual refresh only read KV-backed cycle data.
- Setup exception: adding one ticker requests one quote for immediate P&L but
  keeps conviction pending. Apply/update/Forge Preview runs one debounced,
  strategy-scoped first check: prefer a complete published cycle, otherwise use
  the existing quote/fundamental/technical Worker routes only for that
  strategy's tickers. On login, if the published cycle is missing/incomplete,
  book quotes are pulled for P&L and each unstamped applied strategy gets one
  scoped first check (session-gated to avoid Yahoo spam). A successful setup
  check persists ticker marks, the strategy stamp, and the existing
  conviction/book snapshots. It does not restore a full-book upstream fan-out
  on ordinary refresh.
- Steady-state cycle reads also persist `ticker_marks` and
  `flags.lastDataPullAtByStrategyId`; Supabase is the account bridge, not an
  assertion that local Wrangler KV and deployed KV are shared.
- **Pass/fail audit (unchanged cadence):** chips score from the last completed
  Free Tier cycle stamp (Yahoo + FRED + book math) — not wall-clock public
  quotes. `openPnlPct` for scoring is mark × avg at score time. Dynamic
  fundamental sanity rules quarantine absurd free-tier ratios to no-data.
  Incomplete cycles (missing fundamentals or market context) keep Score Pending
  rather than renormalizing as a full check. See `docs/strategy-forge.md`
  “Pass/fail audit contract”.
- Enabled cadences: 1h/2h/4h/Daily/Weekly/Monthly plus any combination of the
  4 intraday session-closes
  (`close-premarket` 09:30 / `close-regular` 16:00 / `close-afterhours` 20:00 /
  `close-overnight` 04:00 ET). **15m/30m are disabled** ("Future Capability");
  both interval clamps and legacy chip migration map sub-hour values → 1h.
- `sessionCloseChecks` is an array so a strategy can select one or many session
  boundaries. Same ticker under two strategies → two independent scoring tracks.
- Cadence prefs (`checkInterval`, `technicalsInterval`, `sessionCloseChecks`,
  `cadenceEnabled`, `cadenceNotify`) are apply-level user prefs. The UI label is
  **Enable Notifications**; email/text/browser remain disabled placeholders.

### Chip library — "Add Rule" (System Defaults / My Chips)

Reusable rule chips live in `AppState.chipLibrary` (seeded from
`CHIP_LIBRARY_SEED`). The library is in-memory app config, **not** behind the
`DataSource` seam.

`RuleChipsTableModal`'s "Add Rule" is a split button (`ActionMenu`):

- **Add new blank chip** — unchanged: appends an empty, fully-editable draft
  row (`addChip`).
- **Select chip from system defaults or custom chips** — opens an inline
  picker with two searchable, metric-grouped `ChipSearchList`s:
  - **System Defaults** — read-only templates read live from every
    `isDefault: true` strategy's `rules` (`systemChipsForCategory`, filtered to
    the open category). Never mutated by the picker; automatically includes
    any future default strategy. Picking one **copies** its fields into a
    brand-new draft row (fresh id, no library link) — editing that row
    afterward never touches the source strategy.
  - **My Chips** — `AppState.chipLibrary`, editable in place. Picking one
    copies it into a new draft row the same way, but also stamps
    `RuleChip.libraryChipId = <library chip id>` on the new row, linking it
    back to its source for the propagation option below.
- Any row (regardless of origin — blank, system-derived, or custom-derived)
  can be bookmarked into the library via the row's **Save to My Chips** action
  (`saveChipToLibrary`) — a one-way snapshot copy with a fresh `lib-` id; it
  does **not** link back to the row that spawned it.

**Editing a library ("My Chips") entry** happens in the picker itself and asks
for a save mode (`AppState.updateChipInLibrary(chipId, patch, propagate)`):

- **Save Default Chip Settings** (`propagate: false`) — updates the library
  template only. Rows already added to any strategy keep their current values;
  only *future* picks of this chip get the new ones.
- **Save and Update Chip Settings Everywhere** (`propagate: true`) — also
  walks every strategy's `rules` and applies the same field patch to every
  chip whose `libraryChipId` matches, **retroactively** changing already-
  configured strategies (their conviction scores can change as a result). The
  UI shows an explicit warning before this is chosen — never apply this patch
  silently or default to it.

`RuleChip.libraryChipId` (optional) is the only schema addition — it exists
solely to support this propagation; it's `undefined` for blank and
system-derived chips.
