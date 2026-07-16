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
  ledger later).

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
sector→bucket mapping and a portfolio cash balance (not modeled yet) and would
change the displayed numbers, so it was deliberately left as-is. They are still
served through the data source (below), so they stay swappable later.

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
(`worker/market.ts`), cached in `src/lib/market/liveCache.ts`, and refreshed by
`AppState` (`refreshLiveMarket`, loading/error, strategy pull stamps).

1. **FreeTierDataSource** implements `DataSource` for live fields; portfolios /
   holdings / logs remain mock seeds until brokerage Pass 2+.
2. Loading / error / `lastDataPullAtByStrategyId` live **in `AppState` only**.
3. Holding split: live quote fields (`lastPrice` via `getQuote` /
   `getTickerInfo`) vs app overlay (`conviction`, `status`, `reason`,
   `strategyIds`) — a quote tick never wipes Forge overlay.
4. **Ticker search:** `asyncSearchTickers` → Worker Yahoo search. Never merge
   with quarantined `TOP_SEARCH_TICKERS` (mock-only).
5. **Cadence (Beta 0):** Check / Technicals UI floors to `1D` / `1W` / `1M`;
   load-time clamp + Worker TTL ≥ 1 day. Scheduler in
   `src/lib/forge/scheduler.ts` gates on market hours + tab visibility.
6. **Availability layers:** `liveCoverage.ts` + Forge dropdown prune; null =
   no-data; critical nulls → `NeedsDataReviewFlag`.
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

### User persistence (Beta 0 — Supabase)

Invite-only accounts hydrate Home + Forge editable state from Postgres
`user_state` (`src/lib/userStore/`, RLS by `auth.uid()`). Debounced save on
change. **Postgres is source of truth** (not `localStorage`).

- New Beta users start with **empty portfolios/watchlists**; seed `PORTFOLIOS`
  are not hydrated.
- `DEFAULT_STRATEGIES` remain available; bodies always re-seed from
  `src/data.ts` on hydrate; only `appliedPortfolioIds` / `tickerExclusions`
  merge from storage. Defaults reject body patches in `updateStrategy`.
- `conviction_snapshots` append on per-strategy cadence refresh (charts later).
- Soft caps: `src/lib/forge/budgets.ts` (tickers + active chips); Admin bypass.
- Schema: `supabase/schema.sql`. Auth helpers: `src/lib/auth/`.

Legacy `src/lib/forge/persistence.ts` localStorage helpers remain for fixtures /
offline only — do not use as SoT for Beta accounts.

### Cadence rules (Beta 0)

- Scheduler: `src/lib/forge/scheduler.ts` — **per-strategy** dues for assigned
  tickers; Beta 0 floor `1D` / `1W` / `1M`; daily uses ET regular-session due
  semantics (not a rolling “refresh everything on login” only).
- Same ticker under two strategies → two dues / independent pulls for scoring.
- Sub-daily intervals remain UI-clamped / not enabled for free-tier Beta 0.

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
