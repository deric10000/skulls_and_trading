# Market Weather V2 — Scoring & Classification Contract (Phase 1a)

**Status:** **Approved for Phase 1b** (product sign-off 2026-07-29). Implementation may proceed for pure formulas + golden fixtures only. Worker publish / UI / production still need later phase approvals.  
**Branch:** `codex/market-weather`  
**Codex model (confirmed):** `gpt-5.6-sol`.  
**Governs:** `docs/engineering-autopilot.md` Level 3 Market Weather trigger; Weather V2 Architecture plan.  
**Authority:** Changing thresholds after approval requires an explicit product revision of this document in the same change as code.

Do **not** invent thresholds at code time. Phase 1b behavior and golden fixtures must match this contract. Implementation syntax may differ, but observable inputs, rounding, coverage, precedence, and outputs may not.

---

## 1. Pillars (V2 internal — replace v1 Trend/Breadth/RiskAppetite/Rotation mislabels)

All pillars are **0–100 where higher = healthier**, including Risk (higher = calmer / less stress).

| Pillar id | Label (UI / evidence) | Meaning |
|---|---|---|
| `structure` | Structure | Price vs MAs (ATR-normalized), MA stack |
| `participation` | Participation | RSP/IWM/SPDR participation or volume confirmation |
| `risk` | Risk | VIX / credit / ATR stress inverted to “health” |
| `momentum` | Momentum | RSI14 + short horizon return — **not** labeled Trend or Breadth |
| `relativeStrength` | Relative strength | 5d/20d RS vs peers / SPY (Worker-published fields) |

**Weather Index** (Advanced only; hidden on card face) is a weighted blend of available pillars for the layer (see §3). Classification primarily uses pillar states + event signals, not the Index alone.

All formulas calculate at full precision. Round displayed/stored pillar scores and Weather Index half-up to integers only after aggregation. Classification comparisons use the unrounded values; cycle-to-cycle score deltas use the stored integer values so replayed results remain deterministic.

### Market pillar weights (of available pillars; renormalize over present pillars only)

| Pillar | Weight |
|---|---|
| Structure | 0.35 |
| Participation | 0.25 |
| Risk | 0.25 |
| Momentum | 0.15 |

`relativeStrength` is **not** a Market index weight; it appears as evidence / specialty input (Rotation). QQQ never becomes its own Market index weight — see §6.

### Sector / Industry ETF / Stock pillar weights

| Pillar | Sector / Industry ETF | Stock |
|---|---|---|
| Structure | 0.35 | 0.35 |
| Relative strength | 0.25 | 0.25 |
| Risk | 0.25 | 0.20 |
| Momentum | 0.15 | 0.10 |
| Participation (volume) | — | 0.10 |

Missing pillars are **omitted** and weights **renormalize** to sum 1.0 over present pillars. If after omission the layer fails §4 minimum coverage → `insufficient` (no branded weather condition).

---

## 2. ATR-normalized Structure bands

For each relation, calculate a dimensionless distance in ATR units:

\[
d = \frac{(P - MA) / P \times 100}{\mathrm{ATR}\%}
\]

This is equivalent to `(P - MA) / ATR` when ATR is expressed in price units. Never divide a price-unit difference directly by ATR%. If price, MA, or a positive ATR is missing, mark that relation `unavailable`, mark the Structure pillar `partial`, and **do not invent ATR**.

| Band | \(d\) range | Structure contribution (0–100 scale point) |
|---|---|---|
| Clearly above | \(d > 1.0\) | 90 |
| Slightly above | \(0.25 < d \le 1.0\) | 70 |
| Near | \(-0.25 \le d \le 0.25\) | 50 |
| Slightly below | \(-1.0 \le d < -0.25\) | 30 |
| Substantially below | \(d < -1.0\) | 10 |

**Stack relations (Market / Sector / Industry ETF / Stock where MAs exist):**

1. Price vs EMA20 (or SMA20 if EMA missing)  
2. Price vs SMA50  
3. Price vs SMA200 (Market: SPY required for Structure completeness; Stock/Sector when present)  
4. EMA10 > EMA20 binary → 75 if true, 25 if false, omit if either MA missing  

**Structure pillar** = equal-weight mean of available relation scores. Round half-up to integer.

**QQQ 200-day EMA (Market support only):** the Worker must publish QQQ EMA200 and calculate \(d_{\mathrm{QQQ200EMA}}\) with the same ATR-unit formula. This does **not** enter the Market Structure mean. It feeds §6 Headwind/warning contributions only. UI label: **NASDAQ-100** / **large-cap growth** and **200-day EMA** — never “NASDAQ Composite” or “200-day SMA.”

---

## 3. Participation, Risk, Momentum, RS formulas (proposed)

### Market Participation (0–100)

Inputs (Worker / cycle; omit if unavailable):

- `rspMinusSpy5dPct` (RSP 5d − SPY 5d)  
- `iwmMinusSpy5dPct` (optional; first soft-budget cut)  
- `sectorSpdrOutperforming` = fraction of available sector SPDRs whose 5d return is greater than SPY’s 5d return
- `sectorSpdrAboveSma50` = fraction of available sector SPDRs whose price is above SMA50

Map continuous inputs with clamps:

- Equal-weight breadth component from RSP: `clamp(50 + 8 * rspMinusSpy5dPct, 0, 100)`  
- IWM component (if present): `clamp(50 + 8 * iwmMinusSpy5dPct, 0, 100)`  
- SPDR relative-strength breadth: `100 * sectorSpdrOutperforming`
- SPDR structure breadth: `100 * sectorSpdrAboveSma50`

Participation = equal mean of present components. The two SPDR tests remain separate components; an SPDR being above SMA50 must not automatically count as outperforming SPY, or vice versa. Each SPDR component requires at least 6 fresh SPDR observations.

### Market Risk (0–100, higher = healthier)

- VIX level: `clamp(100 - (vix - 12) * 3.5, 0, 100)` (omit if VIX null)  
- VIX Δ vs prior **completed** cycle (if both exist): if ΔVIX > 2 → subtract 10 from VIX component; if ΔVIX < −2 → add 5 (clamp)  
- HY OAS: `clamp(100 - (hy - 3) * 15, 0, 100)` (omit if null; **never** default hy→50)  

Risk = equal mean of present of {VIX component, HY component}.

### Momentum (all layers with RSI / 5d)

- RSI14: use RSI as 0–100 directly when present  
- 5d %: `clamp(50 + 4 * change5dPct, 0, 100)`  

Momentum = equal mean of present.

### Relative strength (Sector / Stock; Worker-published)

Worker must publish bounded fields (no client close arrays):

| Field | Meaning |
|---|---|
| `return5dPct` | 5-session % change |
| `return20dPct` | 20-session % change |
| `rsVsSpy5d` | Subject 5d − SPY 5d (percentage points) |
| `rsVsSpy20d` | Subject 20d − SPY 20d |
| `rsVsSector5d` / `rsVsSector20d` | Stock only vs mapped sector SPDR |

RS pillar (Sector): mean of  
`clamp(50 + 6 * rsVsSpy5d, 0, 100)` and `clamp(50 + 4 * rsVsSpy20d, 0, 100)` when present.

RS pillar (Stock): mean of available clamps vs SPY and vs sector using the same multipliers.

### Instrument Risk (Sector / Industry ETF / Stock)

Static ATR cutoffs are not comparable across low-volatility ETFs and high-volatility stocks. The Worker must therefore publish:

| Field | Meaning |
|---|---|
| `atrPct14d` | Current 14-session ATR as a percentage of price |
| `atrPctBaseline60d` | Median rolling ATR14% over the prior 60 completed sessions |
| `drawdownFrom20dHighPct` | Positive percentage below the prior completed 20-session high |

When the positive baseline exists:

- ATR health = `clamp(75 - 25 * (atrPct14d / atrPctBaseline60d - 1), 0, 100)`
- Drawdown health = `clamp(100 - 8 * drawdownFrom20dHighPct, 0, 100)`
- Instrument Risk = equal mean of the present components.

If the ATR baseline is unavailable, omit ATR health rather than substituting a cross-instrument threshold. A Risk pillar containing only one component is `partial`.

---

## 4. Coverage, freshness, lifecycle

### Freshness windows (ET session calendar)

| State | Rule |
|---|---|
| `fresh` | `asOf` belongs to the latest successfully completed cycle expected for that instrument and session |
| `stale` | A prior completed cycle reading carried forward; it is one or two expected completed cycles old |
| `unavailable` | Missing input or more than two expected completed cycles old — omit from pillar |

Carry-forward of benchmarks: allowed as `stale` only; never silently labeled `fresh`.

An **expected completed cycle** is an hourly cycle the scheduler should have completed during the configured market-week/session policy. Closed-market hours, weekends, and market holidays do not age a reading merely because wall-clock hours pass. The implementation must use the shared ET market calendar/cycle authority; “same ET market date” alone is not sufficient to call an hourly observation fresh.

### Reading coverage

| State | Definition |
|---|---|
| `insufficient` | Layer fails minimum publish set (§4.1) |
| `provisional` | Minimum met with soft-budget / shard **partial** (e.g. <11 SPDRs, IWM missing, QQQ missing) |
| `partial` | Minimum met; ≥1 optional pillar/relation omitted |
| `complete` | Minimum met; all required + preferred inputs fresh for that layer |

### 4.1 Minimum to publish a branded condition

**Market:** SPY Structure has ≥1 of {EMA20/SMA20, SMA50} **and** (VIX **or** HY) **and** ≥1 fresh participation component (RSP **or** either SPDR component with ≥6/11 fresh observations). Else `insufficient`.

**Sector:** Mapped SPDR present with Structure ≥ EMA20/SMA20 or SMA50. Else sector `insufficient` (do not tilt from Market).

**Industry:** Mapped industry ETF with same Structure floor. Else **Independent Industry Weather unavailable** (UI state — not a weather condition id).

**Stock:** Ticker Structure ≥ EMA20/SMA20 or SMA50. Else `insufficient`.

Branded conditions require coverage ∈ {`complete`, `partial`, `provisional`} **except** Insufficient / Unavailable panels.

---

## 5. Classification precedence (Market / Sector / Industry ETF / Stock)

Evaluate **top to bottom**; first match wins. Shared thresholds unless noted.

Inputs renamed from v1: use V2 pillars (`structure`, `participation`, `risk`, `momentum`, plus `relativeStrength` / event flags).  
`weatherIndex` = weighted blend §1.

### 5.1 Layer-specific confirmation

Core regime classification uses a normalized `confirmation` input so a layer is never required to provide a pillar it does not own:

| Layer | `confirmation` |
|---|---|
| Market | `participation` |
| Sector | `relativeStrength` |
| Industry ETF | `relativeStrength` |
| Stock | Equal mean of available `relativeStrength` and volume `participation`; require at least one |

If the applicable confirmation input is missing, conditions that require confirmation cannot fire. Index renormalization never converts a missing condition gate into a passing gate.

`higherLayerIndex` means: none for Market, Market for Sector, Sector for Industry ETF, and Sector for Stock. It is backdrop context only and never enters the child Weather Index.

### Event / specialty (must have honest Free Tier evidence or never fire)

| Priority | Condition | Required evidence (all must hold) | Free Tier source | If missing |
|---|---|---|---|---|
| 1 | **Rogue Wave** | `dailyRangeMultiple > 1.5` **AND** (`absoluteReturnAtrMultiple ≥ 1.0` **OR** `volumeRatio > 2.0`) | Completed daily bar range / ATR, absolute close-to-close return / ATR, and volume / 20-session average for **this layer’s instrument** (SPY / SPDR / ETF / stock) | Required V2 event fields; visible but never fire before all required terms for one valid path ship |
| 2 | **Red Sky Warning** | (`weatherIndexDelta ≤ −12` vs prior fresh cycle **AND** `riskDelta ≤ −8` **AND** `confirmationDelta ≤ −8`) **OR** (`lostSupport` **AND** applicable parent/backdrop Index < 45) **OR** the exact QQQ break escalation in §6 | V2 history + completed-bar MA support-cross flag | Fire only with the complete evidence for one path |
| 3 | **Breakout Wind** | `structure ≥ 70` **AND** `confirmation ≥ 60` **AND** `volumeRatio ≥ 1.2` **AND** `breakingResistance` | Completed daily close above the prior 20-session high by at least `0.25 × ATR`, excluding the current session from the resistance lookback | Required V2 event fields; never fire before they ship |
| 4 | **Rotation Current** | `relativeStrength ≥ 70` **AND** `rsImproving` **AND** `confirmation ≥ 55` | `rsImproving = current rsVsSpy20d - priorFreshCycle rsVsSpy20d ≥ 2.0` percentage points; Sector/Industry ETF only. Stock requires a future separately approved contract | Required V2 RS fields; never infer improvement by subtracting the 5d horizon from the 20d horizon |

### Core regime

| Priority | Condition | Required |
|---|---|---|
| 5 | **Risk-Off Storm** | `weatherIndex ≤ 35` AND `structure ≤ 40` AND `confirmation ≤ 40` AND `risk ≤ 40` |
| 6 | **Risk-On Tide** | `weatherIndex ≥ 65` AND `structure ≥ 60` AND `confirmation ≥ 55` AND `risk ≥ 45` AND `momentum ≥ 55` |
| 7 | **Headwind** | (`weatherIndex < 45` AND (`structure < 45` OR `risk < 45` OR `confirmation < 45`)) **OR** (`higherLayerIndex < 45` AND `weatherIndex < 55` AND (`structure < 52` OR `confirmation < 50`)) **OR** Market-only `qqq200Headwind` path in §6 |
| 8 | **Calm Waters (earned)** | **All** of: `46 ≤ weatherIndex ≤ 60`; pillar spread < 25; `risk ≥ 55`; `|momentum−50| ≤ 12`; no present scored MA relation is “substantially below”; no `lostSupport`; no specialty event flags; for Market only, QQQ \(d_{\mathrm{200EMA}}\) not in “substantially below”; coverage ∈ {`complete`,`partial`} (**not** provisional from failed risk inputs) |
| 9 | **Tailwind** | `55 ≤ weatherIndex < 65` AND `structure ≥ 52` AND `risk ≥ 48` AND `confirmation ≥ 48` AND NOT Market `qqq200Headwind` |
| 10 | **Chop Seas** | (`45 ≤ weatherIndex ≤ 55`) **OR** (max(pillar)−min(pillar) ≥ 35 among present pillars) |
| 11 | **Mixed Signals** | Coverage OK for a branded attempt but **no** prior row matched | Replaces v1 Calm fallback |
| — | **Insufficient** | Below §4.1 | UI limitation — not Calm |

**Never** fall through to Calm.

---

## 6. QQQ / NASDAQ-100 support (not override)

- Benchmark: **QQQ** only. Copy: “NASDAQ-100” / “large-cap growth.”  
- Contribution flags (Market layer only):

| Flag | Trigger | Effect |
|---|---|---|
| `qqq200Near` | \(|d_{\mathrm{QQQ200EMA}}| ≤ 0.25\) | Evidence row and classification-confidence metadata `confidenceAdjustment = -2`; it does **not** alter Weather Index |
| `qqq200Headwind` | \(-1.0 ≤ d_{\mathrm{QQQ200EMA}} < -0.25\) OR (prior fresh cycle \(d > 0.25\), current \(d\) is Near, and current-minus-prior \(d ≤ -0.25\)) | Market **Headwind** when `structure < 55` OR `participation < 50`; it may supersede Tailwind or calm-leaning Chop |
| `qqq200Break` | \(d_{\mathrm{QQQ200EMA}} < -1.0\) on fresh QQQ | Emit **Red Sky Warning** only when `participation ≤ 45`, `risk ≤ 45`, and SPY `structure ≤ 45`. Alone, never forces Red Sky or Risk-Off Storm |

QQQ absence → Market still classifies, but coverage is at most `provisional` because QQQ is a preferred V2 benchmark. Mark evidence “NASDAQ-100 data unavailable” when missing; do not block otherwise-supported Market labels.

---

## 7. Cycle-to-cycle rules

- Comparisons use prior **completed** cycle with `weatherModelVersion: "v2"` only (no silent v1 semantic compare).  
- Red Sky / RS improving require prior fresh v2 snapshot for that layer identity (market / sector key / industry ETF key / ticker).  
- Soft-budget drop of IWM: Participation recomputes without IWM; coverage `provisional` or `partial`, not insufficient if RSP or ≥6 SPDRs remain.
- `lostSupport` requires a completed daily close to cross from at-or-above to below the specified moving average; intraday proximity alone is evidence, not a support-loss event.

---

## 8. Benchmark shard lifecycle (contract pointers)

Implement per Weather V2 Architecture §7c. Summary rules that scoring depends on:

- System symbols: RSP, IWM, 11 SPDRs, QQQ (outside user 40; soft-budget counted).  
- Cut order: IWM → sector optional depth; do not drop QQQ without product re-approval.  
- Partial SPDRs (e.g. 8/11): Participation `partial`; missing sector cards `insufficient`.  
- Incomplete shard: Weather readings `provisional` / `insufficient` — never invent.

---

## 9. Golden examples (must pass as automated fixtures in Phase 1b)

Each example lists **expected** `coverage` + `conditionId` (or Industry unavailable).

| ID | Scenario | Expected |
|---|---|---|
| G1 | Market: Structure 80, Participation 70, Risk 65, Momentum 60; computed Index 71; QQQ above EMA200 | `complete` → **risk-on-tide** |
| G2 | Market: Structure 75, Participation 35, Risk 40, Momentum 50; computed Index 53; no event flags | **chop-seas** because pillar spread is 40 and Headwind does not pass (`weatherIndex` is not <45) |
| G3 | Market: Structure 25, Participation 30, Risk 25, Momentum 30; computed Index 27 | **risk-off-storm** |
| G4 | Market: same pillar values as G1; HY unavailable, VIX supplies Risk 65; computed Index 71 | `partial` → **risk-on-tide** |
| G5 | Market: Structure 25, Participation 30, VIX-only Risk 25, Momentum 30; HY more than two expected cycles old and omitted; computed Index 27 | `partial` → **risk-off-storm**; HY must not become 50 |
| G6 | Stock: Structure 50, RS 48, volume Participation 48, Risk 58, Momentum 56; computed confirmation 48 and Index 52; parent Sector Index 30 | **headwind** through the weak-higher-layer path |
| G7 | Benchmark shard missing RSP and <6 SPDRs | Market **insufficient** |
| G8 | Conflicting pillars: Structure 80, Risk 25, Participation 50, Momentum 50 (spread ≥ 35) | **chop-seas** |
| G9 | Market: Structure 52, Participation 50, Risk 60, Momentum 50; computed Index 53 and pillar spread 10; no events; QQQ not broken | **calm-waters** |
| G10 | Stock: Structure 64, RS 45, volume Participation 45, Risk 65, Momentum 50; computed confirmation 45 and Index 56; one present scored Structure relation is substantially below SMA200; no lostSupport/event flag; parent Sector Index 50 | **mixed-signals** because Calm and Tailwind fail, while Headwind and Chop do not pass |
| G11 | QQQ \(d_{\mathrm{200EMA}}=-0.5\); Market Structure 48, Participation 50, Risk 55, Momentum 55; computed Index 51 | **headwind** through QQQ contribution |
| G12 | QQQ \(d_{\mathrm{200EMA}}=-1.2\), Participation 40, Risk 40, SPY Structure 42 | **red-sky-warning** through the exact QQQ-break path |
| G13 | Industry with no mapped ETF | **Independent Industry Weather unavailable** (not Mixed Signals) |
| G14 | Rogue inputs absent | Must **not** emit rogue-wave |
| G15 | Rogue: `dailyRangeMultiple=1.8`, `absoluteReturnAtrMultiple=1.1`, and completed-bar inputs published | **rogue-wave** |
| G16 | Breakout fields absent | Must **not** emit breakout-wind |
| G17 | Sector: RS/confirmation 75; current `rsVsSpy20d=6.0`, prior fresh-cycle value `3.5`, therefore improvement `2.5`; required coverage present | **rotation-current** |
| G18 | Sector SPDR missing for user’s sector | Sector card **insufficient**; Market still may classify |

---

## 10. Specialty activation summary

| Condition | V2 activation |
|---|---|
| Rogue Wave | **Required V2 capability:** Worker publishes completed-bar range, return, and volume event fields |
| Breakout Wind | **Required V2 capability:** Worker publishes the contract-defined resistance break and volume fields |
| Rotation Current | **Required V2 capability:** Worker publishes RS and prior-cycle improvement fields for Sector / mapped Industry ETF |
| Before required fields land | Remain **visible** in `conditions.ts` / UI glossary; classifier **must not** return them |

Deferring a required specialty condition from the V2 release requires measured provider, performance, or data-integrity evidence and explicit product approval. An implementation agent may not silently defer it.

---

## 11. Approval gate

**Product approval of this document** is required before:

- Phase 1b Codex formula implementation  
- Worker RS/event field publish  
- UI evidence copy that depends on these thresholds  

Edits after approval: amend this file in the same change set as code; do not silently diverge.

**Approved by:** Deric (product) — proceed Phase 1b  
**Date:** 2026-07-29
