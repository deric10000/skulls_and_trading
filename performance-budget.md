# Skulls and Trading — Performance Budget & Asset Pipeline

Companion to [`design-system.md`](design-system.md) and
[`data-architecture.md`](data-architecture.md). This is the source of truth for
**load performance**: image handling, code splitting, and the budgets every
change must stay inside. Enforced by `npm run check:budgets` (runs before every
deploy) and `.cursor/rules/performance-budget.mdc`.

> Prime directive: **fast AND visually premium.** Byte savings never justify
> pixelated or banded imagery. When a budget and visual quality conflict, raise
> the budget — never ship degraded art.

## Baseline audit (2026-07-18, branch `chore/load-perf-spike`, before optimization)

### First-paint waterfall — signed-out login (measured, production build)

| Resource | Transfer | Notes |
| --- | ---: | --- |
| `st-logo.png` | 1,501 KB | 1024×1024 PNG rendered at ≤160 CSS px |
| `skulls-and-trading-login-background-2.webp` | 288 KB | CSS backdrop |
| `index-*.js` | 237 KB (gzip; 883 KB decoded) | entire app in one chunk |
| `index-*.css` | 21 KB (gzip) | |
| `st-wordmark.svg` | 6 KB | |
| Google Fonts CSS | ~0 KB (cached) | IBM Plex Sans/Mono |
| **Total** | **~2,053 KB** | DOMContentLoaded ~185 ms local |

### First-paint estimate — signed-in home (analytical; same JS/CSS/logo plus)

Hero backdrop (288 KB) + both compass PNGs (245 + 714 KB) + 1–4 weather art
webps (81–390 KB each) → **roughly 3.3–4.5 MB** on a cold cache.

### Asset inventory (before)

| Asset | Dimensions | Bytes | Surfaces | Max rendered CSS px | Problem |
| --- | --- | ---: | --- | --- | --- |
| `st-logo.png` | 1024×1024 | 1,537 KB | TopNav brand, Login masthead | 160×160 (login), ~40–64 (header) | 6.4× oversized + PNG |
| `bear-skull-compass.png` | 905×905 | 714 KB | HeroCard preview, PortfolioCompass | 48–60 | 15× oversized + PNG |
| `bull-skull-compass.png` | 470×470 | 245 KB | HeroCard preview, PortfolioCompass | 48–60 | 7.8× oversized + PNG |
| `skulls-and-trading-login-background-2.webp` | 1672×941 | 295 KB | Login + Home hero backdrop | full-card cover | conservative encode |
| `skulls-and-trading-login-background-mobile.webp` | 471×1024 | 86 KB | Mobile backdrops | full-card cover | acceptable |
| `market-weather-bg-*.webp` ×10 | 1024–1448 w | 81–390 KB each (2,257 KB total) | Weather cards/detail | card width (~300–460) | 4 of 10 over 1024 w |
| `st-wordmark.svg` | vector | 12.7 KB | TopNav, Login masthead | — | fine (SVGO pass optional) |
| **Images total** | | **5,146 KB** | | | |

### JS bundle (before)

One eager chunk: **904 KB raw / 242 KB gzip**. Contains all five pages
(only Home + Strategy Forge are live; Dashboard/Ships/Captain Profile are
Coming-Soon shells), the full forge engine + three large table modals,
`@supabase/supabase-js`, ~47 Phosphor icons, `embla-carousel-react`, and
React 19. The signed-out login screen downloads all of it. No `React.lazy`
or dynamic `import()` anywhere; no vendor chunking configured.

## Image pipeline (the only sanctioned way to add or change imagery)

1. Put the **full-resolution original** in `assets-src/` (never imported by
   the app; it is the archival master).
2. Add/update the asset's entry in the manifest inside
   [`scripts/optimize-images.mjs`](scripts/optimize-images.mjs): target width,
   format, quality.
3. Run `npm run optimize:images` — writes the optimized deliverable to
   `src/assets/`, which is what components import.
4. **Visual quality gate (mandatory):** compare the rendered surface
   before/after at 1× and 2× zoom. Check alpha edges (no halos), gradients (no
   banding), fine linework (no smearing). If it fails, raise the target width
   or quality in the manifest and re-run — do not ship the failure.
5. Never hand-drop a raw export into `src/assets/`, and never import from
   `assets-src/`.

### Per-asset targets (after optimization — measured)

| Asset | Target | Before | After |
| --- | --- | ---: | ---: |
| `st-logo.webp` | 384 px WebP q92 | 1,537 KB | 32 KB |
| `bull-skull-compass.webp` | 256 px WebP q90 | 245 KB | 37 KB |
| `bear-skull-compass.webp` | 256 px WebP q90 | 714 KB | 38 KB |
| `skulls-and-trading-login-background-2.webp` | keep dims, q72 | 295 KB | 136 KB |
| `skulls-and-trading-login-background-mobile.webp` | keep dims, q75 | 86 KB | 40 KB |
| `market-weather-bg-*.webp` ×10 | ≤1024 w, q72 | 2,257 KB | 723 KB |
| `st-wordmark.svg` | vector, pass-through | 12.7 KB | 12.7 KB |
| **Total** | | **5,146 KB** | **1,019 KB (−80%)** |

## Code-splitting rules

- **Pages are lazy by default.** Every page in the `ActivePage` switch in
  `src/App.tsx` loads via `React.lazy` except Home (the default landing).
  New pages must follow suit.
- **The signed-out path stays light.** `LoginScreen` must not pull the
  authenticated shell; the app shell is lazy behind the auth gate.
- **Big secondary UI loads on open.** Modals/panels over ~300 lines that are
  not visible on first render of their page load via `React.lazy` when opened
  (pattern: the three forge table modals).
- **Vendor chunks are configured** in `vite.config.ts` so framework/deps cache
  independently of app code. New heavyweight dependencies (> ~30 KB gzip)
  require a budget check before landing.
- **Never regress:** `npm run check:budgets` fails the deploy if a chunk or
  image blows its budget.

## Budgets (enforced by `scripts/check-budgets.mjs`, runs before every deploy)

Finalized against the measured after-state (headroom ~25–50%). **Fix the
regression rather than raising a number.** Raising a budget requires updating
this file in the same change with the reason.

| Budget | Limit | Measured after-state |
| --- | --- | --- |
| Any single image in `src/assets/` | 200 KB | largest 136 KB (login backdrop) |
| Total `src/assets/` image weight | 1,300 KB | 1,019 KB |
| Entry JS chunk (gzip) | 80 KB | 53 KB |
| Any JS chunk (gzip) | 100 KB | largest 60 KB (react vendor) |

## QA gates for performance work

- `npm run typecheck` and `npm run build` clean.
- Functional smoke after any code-splitting change: all five pages, login +
  sign-up + legal gate, Home tabs/swipe, Current Watch edit + review modal,
  Forge create/edit/apply + all three table modals, Market Weather detail,
  mobile + desktop.
- Locked-surface QA (`.cursor/rules/locked-surface-qa.mdc`) — performance work
  must not change the look of locked surfaces at all.

## Results (after — measured 2026-07-18, production build)

### Signed-out login first paint

| Resource | Transfer |
| --- | ---: |
| Login backdrop webp | 137 KB |
| `react` vendor chunk | 58 KB (gzip) |
| `index` entry chunk | 51 KB (gzip) |
| `supabase` vendor chunk | 51 KB (gzip) |
| `st-logo.webp` | 33 KB |
| `icons` vendor chunk | 29 KB (gzip) |
| CSS + wordmark + runtime | 27 KB |
| **Total** | **~386 KB** (was ~2,053 KB — **−81%**) |

After ~2.5 s idle on the login screen, the authed chunks (~50 KB gzip) prefetch
in the background so sign-in still feels instant.

### Chunk map (gzip)

| Chunk | Size | Loads |
| --- | ---: | --- |
| `index` (entry: login, onboarding, AppState, data layer) | 53 KB | always |
| `react` / `supabase` / `icons` vendors | 60 / 53 / 30 KB | always (cache-stable across app deploys) |
| `AuthedApp` (shell + Home) + `WatchlistWidget` | 16 + 11 KB | after sign-in (or idle prefetch) |
| `StrategyForgePage` | 8 KB | opening Strategy Forge |
| `DashboardPage` / `ShipsPage` / `CaptainProfilePage` | 4 / 3 / 2 KB | opening each page |
| Forge table modals (chips / tags / layer-3) | 4 / 3 / 4 KB | opening each modal |

### What changed (for future reference)

- Images: masters moved to `assets-src/`, deliverables regenerated via
  `scripts/optimize-images.mjs` (sharp). PNGs → WebP; imports updated in
  `TopNav`, `LoginScreen`, `HeroCard`, `PortfolioCompass`.
- `src/App.tsx` keeps only the signed-out surface eager; `src/AuthedApp.tsx`
  (lazy) owns the shell with lazy pages; the three forge table modals are lazy
  inside `StrategyForgePanel`; vendor groups configured in `vite.config.ts`
  (`build.rolldownOptions.output.codeSplitting.groups`).
- `scripts/check-budgets.mjs` gates every deploy via `scripts/deploy.mjs`.
