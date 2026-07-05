# Strategy Forge — Framework

How a user turns a trading plan into a set of **rule chips** that score each
holding's **conviction** and **alignment**, and how those scores flow to the
Home and Dashboard widgets. This is the conceptual reference; the data flow and
seam rules live in [`data-architecture.md`](../data-architecture.md).

> All data is static mock today (real values, but a snapshot — not a live feed).
> See `.cursor/rules/security-hardening.mdc` before wiring anything realistic.

## 1. The model

- A portfolio runs one or many **Strategies**, applied through **Buckets** (a
  strategy governs a bucket; a holding's shares can be split across buckets).
- A **Strategy** is a set of **Rule Chips**. Each chip has a custom label, a
  testable condition (metric + operator + value), and a weight. A chip evaluates
  to **pass / fail / no-data** against a stock's data.
- Every chip belongs to one of six **Categories**. Each category produces a
  0–100 sub-score (weighted % of its enabled chips that pass; no-data chips are
  excluded from the denominator).

## 2. The six categories

| Category | Question it answers | Example data |
|----------|--------------------|--------------|
| **Thesis Fit** | Does this name belong? (flagship — a boolean composite) | EPS growth, revenue growth, margins, P/E |
| **Timeframe** | Is it managed on the intended horizon? | Swing / Long / Speculation |
| **Position Size** | Is the allocation inside the target range? | holding weight % vs bounds |
| **Setup / Timing** | Do current technicals support it? | RSI, VWAP, EMAs |
| **Risk Rules** | Still inside risk limits? (guardrails / state) | stop distance, exposure, VIX/SPY |
| **Trade Management** | Acting per plan? (behavior / actions) | add/trim/hold/exit, take-profit vs open P&L |

**Risk vs Trade Management:** Risk = limits that shouldn't be breached;
Trade Management = whether you're *taking the planned action* (take-profit lives
here). Distinct lenses.

## 3. Conviction & alignment

**Strategy Conviction (0–100)** per stock = weighted blend of the six category
sub-scores using the strategy's `categoryWeights`.

Default weights (a "stock-market-wizard" prior — the two existential questions
dominate; per-strategy adjustable, sum to 100):

| Category | Weight | Why |
|----------|:------:|-----|
| Thesis Fit | 30 | Belonging is the foundation (also a gate). |
| Risk Rules | 25 | Capital preservation is paramount (also a gate). |
| Setup / Timing | 15 | Technicals support the hold/entry. |
| Position Size | 12 | Sizing discipline (a miss is correctable). |
| Trade Management | 10 | Acting per plan. |
| Timeframe | 8 | Horizon fit (more a filter than an ongoing driver). |

### Gates (override the blended score)

A single fatal flaw can't be averaged away by a high score elsewhere:

- Thesis composite evaluates **false** → status forced to `Thesis Check`.
- Any enabled **Risk** chip fails → status forced to `Risk Check`.

### Status mapping (after gates)

| Conviction | Status |
|-----------:|--------|
| ≥ 80 | High Alignment |
| 60–79 | Aligned |
| 40–59 | Watch |
| < 40 | Review |

(All values are existing `StatusType`s, so downstream widgets need no changes.)

## 4. The quantitative Thesis builder

The Thesis Fit category is a **boolean composite** of fundamental (and optional
technical) chips:

- **AND within a group, OR across groups** — deliberately simple, no nested
  expression trees. Example:
  `(EPS Growth ≥ 20 AND Rev Growth ≥ 25) OR (Gross Margin ≥ 65 AND Debt/Equity < 0.5)`.
- Output per stock: `thesisPass` (boolean, drives the gate) **and** a Thesis Fit
  sub-score (weighted % of passing thesis chips, feeds conviction).
- Chips are reusable: add / edit / delete / **save to a chip library** to drop
  into other strategies.

## 5. Buckets & check cadence

- A portfolio splits into **Buckets**; each bucket is governed by one strategy
  and holds a **share allocation** of one or more tickers. A ticker can live in
  multiple buckets (e.g. 100 sh long in "Core Growth", 10 sh in a 15m
  "Momentum" bucket); it is scored by each, and the headline shows its
  **best-aligned** bucket.
- Each strategy carries its own cadence:
  - `checkInterval` (15m, 30m, 1h, 4h, **1D default**, 1W, 1M) — re-scores the
    bucket and is the only thing that "notifies". Upper bound on fetch frequency.
  - `technicalsInterval` — candle size + refresh for technicals; defaults to
    `checkInterval`, clamped to **≥ `checkInterval`** and **≥ 15m**.
  - Fundamentals refresh on a fixed daily cadence (quarterly data).
- **Portfolio alignment** = market-value-weighted average across bucket
  allocations (shares × price), so a 10-share momentum slice doesn't outweigh a
  100-share core position.
- "Notify" (MVP) = the chips/tags on Home and Dashboard re-rendering at the
  check cadence. No push/notification system is built.

## 6. Deferred (later dashboard pass)

Bucket-builder UI, per-bucket share-count editing, and editable trade-entry
dates are authored on the **dashboard** later. This pass only models the data
(`Bucket` / `BucketHolding`) and plumbs computed alignment downstream.
