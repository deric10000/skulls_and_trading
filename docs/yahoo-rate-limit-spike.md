# Spike: Yahoo “nearing limit” on login / refresh

**Branch:** `chore/yahoo-rate-limit-spike`  
**Status:** research only — no production behavior change yet  
**Canvas:** [yahoo-rate-limit-spike.canvas.tsx](/Users/dericalbright/.cursor/projects/Users-dericalbright-OneDrive-Cursor-Skulls-and-Trading-II-The-Application/canvases/yahoo-rate-limit-spike.canvas.tsx)

## Verdict

The toast is almost certainly our **Worker soft budget** (30 Yahoo units / rolling minute), not evidence that Yahoo itself returned 429. A cold login for a small book (~8–10 tickers) already models **well over 30** soft-budget units in one fan-out, so seeing “5 of 30 left” mid-refresh is expected with the current design.

## What the toast measures

| Piece | Reality |
| --- | --- |
| Limit `30` | Hardcoded in `worker/market.ts` `budgets.yahoo` |
| Consume | Each Yahoo chart / quoteSummary / search (quotes use chart under the hood) |
| Scope | **In-memory per Worker isolate** — shared by concurrent traffic on that isolate (“Shared Demo budget”) |
| Cache | In-memory `Map`s only — **lost on isolate recycle / deploy** |
| Toast trigger | `remaining ≤ 5` or `remaining/limit ≤ 0.2` (`MarketBudgetToasts.tsx`) |

Finnhub / FRED / Stooq have separate soft budgets. Quotes prefer Finnhub when `FINNHUB_API_KEY` is set, then Yahoo, then Stooq.

## Login / refresh path

1. Auth → `AppState` effect calls `refreshLiveMarket()`.
2. `refreshLiveMarket` is recreated whenever `portfolios` or `strategies` change → **the effect re-runs on book/strategy identity churn**, not only on first login.
3. `refreshLiveMarketForPortfolios`:
   - `POST /api/market/quotes` (up to 40 symbols)
   - For each ticker (cap 25): fundamentals + technicals (with `neededTimeframesForStrategies`)
   - `GET /api/market/context` (SPY / VIX + optional FRED)

Default strategies include several **1D timeframed** setup chips → `neededTimeframes` always includes at least `1D`.

## Cold-start cost model (Yahoo path, no Finnhub)

Per ticker (cold):

- 1× quote  
- 1× fundamentals (`quoteSummary`)  
- 1× base technicals chart (`1y`/`1d`)  
- 1× **duplicate** `1D` timeframe chart (same `1y`/`1d` again)

Shared / once per isolate:

- SPY daily series (beta)  
- One chart per unique sector ETF  
- Context: SPY quote + **another** SPY `1y`/`1d` chart + VIX quote  

Illustrative totals (1D only, ~4 sector ETFs):

| Tickers | Est. Yahoo soft units | vs 30 |
| --- | ---: | --- |
| 3 | ~18 | under |
| 5 | ~28 | near toast |
| 8 | ~41 | over |
| 10 (seed book) | ~49 | over |

Toast “~3 Yahoo calls per ticker” undercounts once sector ETF, SPY, duplicate 1D, and context are included (**~3–5+** cold).

## Why it feels worse “lately”

Likely stack, not a mysterious Yahoo clamp:

1. **Timeframed technicals** (`byTimeframe`) added a second chart path; default chips keep `1D` hot.  
2. **Market context / Weather** adds SPY/VIX (and can re-fetch SPY chart even if series cache is warm for beta).  
3. **Durable cache never shipped** — every cold isolate = full burn.  
4. **Full re-pull on portfolios/strategies changes** amplifies burns beyond a single login.  
5. Local **React StrictMode** can double-invoke the auth refresh effect in dev.

## Mitigations (recommended order)

1. **Dedupe charts (S, high)** — reuse base technicals for `1D`; share SPY series with context.  
2. **Gate refresh (S, high)** — don’t full-fan-out on every `portfolios`/`strategies` identity change; auth + holdings fingerprint + pull TTL / explicit refresh.  
3. **Durable Worker cache (M, high)** — Cache API or KV for quotes/fundy/tech keyed by symbol + as-of day.  
4. **Stagger pulls (M, med)** — quotes immediately; fundamentals/technicals across the next minute window(s).  
5. **Confirm Finnhub in prod (S, med)** — cuts N Yahoo quote units when the key works.  
6. **Toast honesty (S, med)** — label as Worker soft budget; fix rough guide; only raise `30` after 1–3.

## Out of scope for this spike

- Changing Forge scoring / zone math  
- Raising the soft budget without dedupe + cache  
- Paid market-data vendors (later Pass)

## Next implementation slice (when approved)

Branch stays research-only until you green-light code. First PR candidates: chart dedupe + refresh gating.
