# Strategy Forge — Framework

How a user turns a trading plan into **rule chips** and **tags** that score each
holding's **conviction** and **alignment**, and how those scores flow to the
Home and Dashboard widgets. This is the conceptual reference; the data flow and
seam rules live in [`data-architecture.md`](../data-architecture.md).

> All data is static mock today (real values, but a snapshot — not a live feed).
> See `.cursor/rules/security-hardening.mdc` before wiring anything realistic.

Source designs: the Configure card + table modals in Figma
(`Skulls - Trading`, node `168-1323` and the six chip/tag table modals) and the
algorithm board in FigJam (`Skulls and Trading`, node `30-1095`).

**Table modal chrome:** all forge table modals (Rule Chips, Tags, Trim Zone, …)
must use `src/components/forge/ForgeTableModal.tsx` for backdrop, title bar,
intro + add-action row, weight total, caution, and Cancel/Update. Domain
tables and pickers go in slots (`children` / `alternateView` / `titleAccessory`).
Do not fork the shell per modal.

## 1. The model

- A portfolio runs one or many **Strategies**, applied through **Buckets** (a
  strategy governs a bucket; a holding's shares can be split across buckets).
- A **Strategy** is a set of **Rule Chips** organized into six **Categories**,
  plus **Tags** that group chips into reusable lenses.
- A **Rule Chip** is one measurable, pass/fail condition: a custom label, a
  data point (metric), a date range, a condition (e.g. "is at least"), a value,
  and a **Rule Weight** (% importance within its category).
- A **Tag** is a reusable, named group of rule chips within a category (e.g.
  the Thesis tags `Value`, `Growth`, `Dividend`, `Quality`). A tag carries a
  purpose, its member chips, a **Tag Weight**, and suggested auto-apply
  guidance. Tags are the unit a user will later apply to individual stocks.
  Every category has a built-in, non-deletable **"All Active Chips"** tag that
  represents the full chip set (strict full-category scoring).

## 2. The weight hierarchy

| Level | What the weight means |
|-------|----------------------|
| **Category Weight** | The category's share of the total conviction score. All six categories sum to **100**. Example: Technical Setup = 12% of total conviction. |
| **Rule Weight** | Inside a category, how much each chip matters. The category's enabled chips should total **100%**. |
| **Tag Weight** | If multiple tags are applied to a stock, how much each tag matters relative to the others. A category's tags total **100%**. |
| **Normalized Score** | Active tags/rules always **rescale to fill 100%** of their category for that stock. |

## 3. The six categories

Category keys are stable identifiers (`thesis`, `setup`, `risk`, `position`,
`trade`, `timeframe`); labels below are the UI names.

| # | Category | Question it answers | Default weight (Value/Growth/Dividend) |
|---|----------|--------------------|:--:|
| 1 | **Thesis & Fundamentals** (`thesis`) | Does this ticker fit my thesis? | 55 |
| 2 | **Technical Analysis (Setup / Timing)** (`setup`) | Does the current market/chart setup support the strategy? | 12 |
| 3 | **Risk Rules** (`risk`) | Is the position still inside the user's risk limits? | 15 |
| 4 | **Position Size** (`position`) | Is the allocation sized with discipline? | 8 |
| 5 | **Trade Management** (`trade`) | Is the position behaving inside the plan's tolerances? | 6 |
| 6 | **Hold Timeframe** (`timeframe`) | Is the holding being managed on the intended timeline? | 4 |

The Thesis/Technical/Risk weights (55 / 12 / 15) come straight from the design;
Position / Trade / Timeframe split the remaining 18 points (8 / 6 / 4), keeping
the per-stock score dominated by thesis fit and risk control — how an expert
Value/Growth/Dividend investor actually weighs decisions. All six are
per-strategy adjustable and must sum to 100.

**Position / Trade / Timeframe design note:** these categories use the *same*
chip + tag + table pattern as the first three (consistency beats a bespoke UI),
but ship with deliberately small chip sets. Position-level risk-based sizing
against the whole portfolio ("low risk score → smaller suggested size") is a
later pass; today these categories score the per-stock, per-position facts we
have (portfolio weight, open P&L, holding age).

## 4. The scoring algorithm (per stock, per category)

Rule scoring is **pass/fail for MVP** (partial credit can come later).

1. **Resolve active chips.** The chips that score a stock are the union of the
   chips inside the applied tags plus any individually applied chips —
   **deduplicated** (a chip shared by two applied tags counts once). Default =
   the "All Active Chips" tag, i.e. every enabled chip in the category.
2. **Evaluate pass/fail.** Each active chip's condition is tested against the
   stock's data. A metric that is `null` is **"no data"** — the chip is
   excluded from the calculation entirely (numerator and denominator), never
   counted as a fail and never fabricated.
3. **Normalize active rule weights.**
   `normWeight_i = ruleWeight_i / Σ(active scorable ruleWeights)` — active
   rules always rescale to fill 100% of the category for that stock.
4. **Category score.** `categoryScore = Σ(pass_i ? normWeight_i : 0)` → 0–100.
5. **Conviction points.** `categoryPoints = categoryScore × categoryWeight/100`.
6. **Stock conviction.** `conviction = Σ categoryPoints` over all categories
   with at least one scorable chip, renormalized over the participating
   category weights (an unconfigured category doesn't silently drag the score
   to zero — the **completeness warnings** below make the gap visible instead).

Worked example (from the algorithm board): Thesis chips Revenue Growth (33%)
fails, EPS Growth (33%) passes, EBITDA (34%) passes → Thesis score = 67%. With
Thesis = 55% of conviction: `67% × 55 = 36.85` conviction points.

### Status mapping (three layers)

**Layer 1 — conviction band** (unchanged math; display-only):

| Conviction | Status |
|-----------:|--------|
| ≥ 80 | High Alignment |
| 60–79 | Aligned |
| 40–59 | Watch |
| < 40 | Review |

**Layer 2 — category diagnostics** sit on top in `src/lib/forge/status.ts`.
Each scorable category maps its 0–100 category score through its own ladder
(e.g. risk 50–69 → **Review Risk**, thesis 45–59 → **Thesis Check**). The
**primary** headline is the most severe label among Layer 1 and all firing
Layer 2 flags (severity rank in `status.ts`). When multiple categories lag,
**all** diagnostics render as chips (primary + secondary flags). No strategy
assigned → **Thesis Check** regardless of scores.

Portfolio-level Layer 2 uses market-value-weighted category scores across
holdings (`aggregateCategoryScores` in `status.ts`).

**Layer 3 — user-driven zones** (`Trim Zone`, `Add Zone`, `Go to Cash`) are
registered on `StatusType` with tone/icon coverage. Trim Zone authoring lives
on the Configure card under Position Size (`strategy.trimZoneRules` /
`trimZoneTags`) — independent chip/tag copies that do **not** feed
`scoreStock` or conviction. Zone labels are still **not** emitted by
`resolveStatus` until trigger evaluation is wired. Surfaces (when wired):
ticker `watch-align` labels for Trim Zone / Add Zone; portfolio StatusBadge
chip only for Go to Cash (no ticker label).

The old hard **gates** (thesis composite → `Thesis Check`, breached risk chip →
`Risk Check`, with conviction clamps) are **removed**: thesis and risk now
express their dominance through their category weights and Layer 2 ladders. The
`ThesisLogic` AND/OR group builder and the 1–5 chip weight scale are retired
with them. The mock `computeSignal` / `SignalState` path is archived — Dashboard
Strategy Check reads Forge alignment like the watchlist.

## 5. Portfolio conviction

Portfolio conviction is **position-weighted**: it is calculated from the
market-value-weighted scores of the individual stocks (shares × price across
bucket allocations), so a 10-share momentum slice doesn't outweigh a 100-share
core position. A ticker living in several buckets is scored by each; its
headline is its **best-aligned** bucket. Example: two stocks both score 80, but
a 10%-of-book position contributes `10% × 80 = 8.0` while a 2% position
contributes `1.6`.

## 6. Completeness — cautions before a strategy can be applied

A strategy must be **complete** before it can be applied to a portfolio. The
Configure card surfaces a caution banner with the outstanding items, and the
"Apply to Portfolio" button (in the watchlist Preview column) stays disabled
until every check passes:

- Strategy name and thesis description are non-empty.
- Category weights total exactly 100.
- Every category has at least one enabled rule chip.
- Each category's enabled chip weights total 100%.
- Each category's tag weights total 100%.

## 7. Buckets & check cadence (unchanged)

- Each strategy carries its own cadence: `checkInterval` (15m → 1M, **1D
  default**) re-scores the bucket; `technicalsInterval` is the technicals
  candle, clamped **≥ `checkInterval`** and **≥ 15m**. Fundamentals refresh on
  a fixed daily cadence.
- "Notify" (MVP) = the chips/tags on Home and Dashboard re-rendering at the
  check cadence. No push/notification system is built.

## 8. Deferred (later passes)

- Per-stock tag application UI (applying `Growth` to NVDA etc.) — the engine
  already supports scoring through a tag lens; the authoring UI is later.
- Partial (non-binary) rule scoring.
- Risk-score-aware position sizing suggestions.
- Bucket-builder UI, per-bucket share editing, editable trade-entry dates.
