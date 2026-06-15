# Command Deck UI — Skulls and Trading Design System

Command Deck UI is the design system for Skulls and Trading: a dark, cinematic,
pirate-themed strategy command center for investors and traders. It is a premium,
game-inspired **discipline system** — not a generic stock dashboard, not a casino.

This document is the shared source of truth for Figma and code. The implementation
source of truth for tokens is [`src/index.css`](src/index.css). Do not redesign the
app from scratch — evolve tone, hierarchy, and component consistency within these
constraints.

> Product thesis: **Skulls and Trading rewards discipline, not gambling.** The app
> does not reward users for trading more. It rewards them for following their own
> strategy. The product voice + compliance rules live in
> [`product-voice.md`](product-voice.md).

## Design pillars

1. **Discipline over dopamine** — reward following the plan, never activity.
2. **Strategy before action** — rules are forged before emotion gets the wheel.
3. **Progress over profit-chasing** — discipline is more prominent than raw P/L.
4. **Pirate theme as structure, not decoration** — theme organizes meaning; it
   never becomes childish, noisy, or over-textured.
5. **Game polish without casino mechanics** — rarity, badges, and progression are
   for behavior, never for investment recommendations or trade pressure.
6. **Dark premium dashboard usability** — readable at dashboard density.
7. **Small-screen readability** — every module is a scannable card on mobile.
8. **Compliance-safe language** — the UI checks the user's own rules; it never
   tells them what to buy or sell.

## Brand identity

Inspired by the logo: dark treasure chest, simple skull emblem, green bullish
candles, one red bearish candle, a red dripping wax/blood accent, black/navy
surfaces, gold trim, neon-green trading energy, red danger accent. The UI stays
clean and modern — the brand supports the system without visual noise.

## Color system (the "true range")

Every hue is a full `50 → 900` ramp in [`src/index.css`](src/index.css), so designers
and engineers pick from a real range instead of one-off hex values. The previous
single-value tokens are aliased to specific ramp steps, so the ramps introduced no
visual change.

Ramps:

- **Ink / navy** — `--ink-50 … --ink-900`. Dark end carries app surfaces
  (`--ink-900` = `#05070d` deep, `--ink-800` = `#080b14` base).
- **Gold (brand)** — `--gold-50 … --gold-900`. `--gold-400` = `#f1b24a` brand,
  `--gold-300` = `#ffce71` highlight.
- **Green (positive / discipline)** — `--green-50 … --green-900`. `--green-400` = `#3ed598`.
- **Red (risk / bearish / rule break)** — `--red-50 … --red-900`. `--red-400` = `#ff6b6b`.
- **Amber (caution / review)** — `--amber-50 … --amber-900`. `--amber-400` = `#f4c04e`.
- **Blue (neutral / watch)** — `--blue-50 … --blue-900`. `--blue-400` = `#56b6f0`.
- **Violet (review / epic)** — `--violet-300/400/500`.

### Brand semantic tokens

- `--brand-gold`, `--brand-gold-strong` — brand + highlight (gold ramp).
- `--brand-green` — bullish / discipline energy.
- `--brand-red` — danger / bearish / rule break.
- `--brand-ember` / `--brand-ember-soft` — the dripping wax/ember accent. Use sparingly.
- `--brand-shadow-green` / `--brand-shadow-red` — soft glows for positive / risk emphasis.
- `--brand-metal` — dark metal (badge bases, chest fittings).
- `--brand-bone` — skull bone tone.
- `--brand-wood` — treasure-chest wood tone.
- `--brand-ink` — deepest background ink.

### Score semantic tokens

Each discipline score reads as its own color. Discipline is weighted highest.

- `--score-discipline` (gold) — most prominent.
- `--score-risk` (amber) — sizing / exposure / drawdown behavior.
- `--score-research` (blue) — thesis / catalyst / reasoning documented.
- `--score-review` (violet) — post-outcome review.
- `--score-progress` (muted green) — portfolio progress, intentionally less prominent.

### Rarity tokens (badges / progression ONLY)

`--rarity-common` (slate), `--rarity-uncommon` (green), `--rarity-rare` (blue),
`--rarity-epic` (violet), `--rarity-legendary` (gold).

Rarity applies to badges, achievements, and progression — **never** to investment
signals or recommendations.

### Surfaces, borders, text

- Surfaces: `--surface-1` (primary panels), `--surface-2` (nested cards), `--surface-3`
  (inputs / deepest cards). Backgrounds `--bg-deep` / `--bg-base`.
- Borders: `--border-soft`, `--border-strong`.
- Text: `--text-strong`, `--text-base`, `--text-muted`, `--text-faint`.

### Market / state accents (aliases)

`--accent` / `--accent-strong` / `--accent-soft` (gold), `--positive` (green),
`--negative` (red), `--warning` (amber), `--info` (blue).

## Visual hierarchy rules

- **Gold** = primary brand, selected states, and major CTAs.
- **Neon green** = positive market movement, discipline progress, successful rule
  adherence.
- **Red** = risk, bearish moves, rule breaks, invalidation, correction. Use sparingly
  so it stays powerful.
- **Amber** = caution / review.
- **Blue** = neutral / watch.
- Never use green/red in a way that pressures a trade. The palette communicates state,
  not advice.

## Designing for a gamified, agentic-AI environment

Skulls and Trading layers light game mechanics and (later) AI assistance over a
serious finance tool. To keep it premium, disciplined, and compliance-safe:

- **AI is a reviewer, not an advisor.** AI surfaces (e.g. Strategy Check, future
  Captain's Log summaries) must frame output as checking the user's own rules —
  "your plan requires confirmation", "this position may exceed your stated risk
  rule" — never "buy", "sell", or "we recommend".
- **Confidence is a context cue, not a promise.** Show confidence (e.g. 72%) with a
  neutral/positive/amber tone, never as a guarantee or a prompt to act.
- **Rule-check tones map to the palette.** Aligned → green, Watch → blue, Review/
  Caution → amber, Rule Break / Risk Exceeded → red (sparingly).
- **Reward behavior, not activity.** Badges, scores, and rarity celebrate plan
  adherence, journaling, risk discipline, and review cadence — never trade frequency,
  size, leverage, or beating friends.
- **"Coming soon" is first-class.** Mock/AI-future features use the `.chip--soon`
  treatment and muted styling so they read as credible roadmap, not broken UI.
- **Progression is calm.** Animations are subtle (`translateY(-1px/-2px)`), honoring
  `prefers-reduced-motion`; no casino-style flashing, confetti spam, or loss-pressure.

## Radius, shadow, spacing

- Radius: `--radius-sm: 0.55rem`, `--radius-md: 0.9rem`, `--radius-lg: 1.4rem`.
- Shadow: `--shadow-card: 0 18px 48px rgb(2 6 18 / 0.5)`, `--shadow-glow: 0 0 40px rgb(241 178 74 / 0.12)`.
- Spacing scale (4pt-aligned): `--space-1: 0.4rem`, `--space-2: 0.75rem`, `--space-3: 1.1rem`, `--space-4: 1.6rem`, `--space-5: 2.4rem`.

Prefer these tokens (or multiples that stay on the 4pt grid) over ad-hoc pixel values.

## Typography

- Font family: Inter, system-ui fallbacks. Line height ~1.55.
- Headings use `--text-strong`; body uses `--text-base` / `--text-muted`.
- Eyebrows and labels: uppercase, letter-spaced, small, often `--accent-strong` or `--text-faint`.
- Numeric values use `font-variant-numeric: tabular-nums`.

## Core component patterns (class names in `src/index.css`)

- `.panel` — rounded dark card: `--surface-1`, `--border-soft`, `--radius-lg`, `--shadow-card`.
- `.panel-head` / `.panel-tag` / `.panel-intro` — card header row, small uppercase tag, intro text.
- `.btn` with `.btn--primary` (gold gradient), `.btn--ghost` (subtle outline), `.btn--small`.
- `.chip` — pill badge. Status tones: `.status--positive`, `.status--negative`, `.status--warning`, `.status--neutral`. `.chip--soon` for "coming soon".
- `.watch-item` / `.watch-item--active` — watchlist cards; active state uses gold border + `--shadow-glow`.
- `.conviction` — track + gold fill bar.
- `.mini-card`, `.lens-card`, `.edu-card` — nested content cards.
- `.flow-step` / `.flow-index` — top-down market flow steps.
- `.chart-frame`, `.chart-line`, `.chart-volume`, `.indicator-tags` — chart placeholder + indicator chips.
- `.config-chip` / `.strategy-card` — Strategy Forge controls and list cards.

## Interaction + motion

- Hover lifts cards/buttons slightly (`translateY(-1px/-2px)`); honors `prefers-reduced-motion`.
- Focus-visible uses a 2px `--accent-strong` outline.

## Layout grid (12 columns, responsive, mobile-first)

- Content spans the full viewport width on desktop (`--content-max: 100%`) with only
  fluid edge padding `--content-pad: clamp(1rem, 2.5vw, 2.5rem)` — no centered gutter.
  The header, main content, and footer all share this width so left/right edges align.
- **Page top spacing rule (applies to every page):** the gap between the sticky header
  and the first row of content is a single shared token `--page-gap: 2rem` (32px,
  4pt-aligned), applied once on `.app-main`. Do **not** add per-page or per-widget top
  margins to create this space. This keeps the top edges of all top-row widgets aligned
  on every page.
- **Top-row widget alignment:** top-row grids use `align-items: start` so columns share
  the same top edge. Any new page or top-row widget must rely on `--page-gap` for its
  spacing from the header rather than its own top margin.
- Reusable utilities: `.grid-12` container and `.col-3 / .col-4 / .col-6 / .col-8 /
  .col-9 / .col-12` spans.
- Mobile-first: by default every grid is a single stacked column; the 12-column layout
  applies at `min-width: 1024px`.
- Size widgets by content priority, not fixed pixel widths. Reference proportions:
  - Home: Market Weather `col-3` (left) · Hero `col-6` (center) · Watchlist `col-3` (right).
  - Dashboard: Market Weather bar spans 12 on top · Watchlist `3` left · Strategy Check +
    Chart `6` center · Stock Summary / Captain's Log / Strategy Assignment `3` right.
  - Strategy Forge: its own `.forge-grid` — education columns, strategy list, config panel;
    four columns at `>= 1280px`, two at `768–1279px`, stacked on mobile.

## Responsiveness

- Desktop grids activate at `>= 1024px`; below that, layouts stack to a single column.
- The header stacks at `<= 640px`.
- On mobile, each major widget remains a clearly separated card so the page does not
  become one long unstructured scroll.

## Navigation model

- Authenticated top navigation has exactly five tabs: **Home, Dashboard, Strategy Forge,
  Ships, Captain Profile**.
- Login / Onboarding lives **outside** the authenticated app shell.
- Watchlist, Captain's Log, Strategy Check, Market Weather, Treasure Ledger, Scores,
  Badges, and Strategy Assignment are **widgets/modules**, never top-level tabs.
