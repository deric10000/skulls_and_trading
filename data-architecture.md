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
  the name: `company`, `category`, `lastPrice`, `analysis`, `logs`.
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
