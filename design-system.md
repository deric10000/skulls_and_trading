# Skulls and Trading — Design System

This document preserves the existing visual system so refinement work keeps the
look and feel consistent. It is documentation only; the source of truth is
[`src/index.css`](src/index.css). Do not redesign the app — improve layout and
hierarchy within these constraints.

## Principles

- Dark-mode command center for aggressive investors and traders.
- Pirate / trading theme (skull mark, "Captain's Log", gold accents).
- Serious enough to be useful, gamified enough to feel like a command center.
- Rounded dark cards, subtle borders, soft elevation, green/red market indicators.
- Compact dashboard layout. Spacing follows a 4pt-style scale (see tokens).

## Color tokens

Backgrounds and surfaces:

- `--bg-deep: #05070d`
- `--bg-base: #080b14`
- `--surface-1: rgb(17 24 39 / 0.72)` — primary panels
- `--surface-2: rgb(13 19 32 / 0.85)` — nested cards / list items
- `--surface-3: rgb(10 15 26 / 0.92)` — inputs, deepest cards

Borders:

- `--border-soft: rgb(148 163 184 / 0.14)`
- `--border-strong: rgb(148 163 184 / 0.28)`

Text:

- `--text-strong: #f4f7fb`
- `--text-base: #d6deea`
- `--text-muted: #93a0b5`
- `--text-faint: #64748b`

Accent and market state:

- `--accent: #f1b24a` (gold) / `--accent-strong: #ffce71` / `--accent-soft: rgb(241 178 74 / 0.16)`
- `--positive: #3ed598` (green) — up moves, bullish
- `--negative: #ff6b6b` (red) — down moves, bearish/exit
- `--warning: #f4c04e` — caution
- `--info: #56b6f0` — neutral / watching

## Radius, shadow, spacing

- Radius: `--radius-sm: 0.55rem`, `--radius-md: 0.9rem`, `--radius-lg: 1.4rem`
- Shadow: `--shadow-card: 0 18px 48px rgb(2 6 18 / 0.5)`, `--shadow-glow: 0 0 40px rgb(241 178 74 / 0.12)`
- Spacing scale (4pt-aligned): `--space-1: 0.4rem`, `--space-2: 0.75rem`, `--space-3: 1.1rem`, `--space-4: 1.6rem`, `--space-5: 2.4rem`

When adding spacing, prefer these tokens (or multiples that stay on the 4pt grid)
rather than ad-hoc pixel values.

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

## Interaction + motion

- Hover lifts cards/buttons slightly (`translateY(-1px/-2px)`); honors `prefers-reduced-motion`.
- Focus-visible uses a 2px `--accent-strong` outline.

## Layout grid (12 columns, responsive, mobile-first)

- Content spans the full viewport width on desktop (`--content-max: 100%`) with only
  fluid edge padding `--content-pad: clamp(1rem, 2.5vw, 2.5rem)` — no centered gutter.
  The header, main content, and footer all share this width so left/right edges align.
- Every page uses the 12-column grid (Home, Dashboard, and Strategy Forge).
- The desktop layout is a 12-column grid. Reusable utilities in `src/index.css`:
  - `.grid-12` — grid container.
  - `.col-3 / .col-4 / .col-6 / .col-8 / .col-9 / .col-12` — column spans.
- Mobile-first: by default every grid is a single stacked column. The 12-column
  layout (and column spans) only apply at `min-width: 1024px`. Build/adjust mobile
  first, then layer on the desktop grid.
- Size widgets by content priority, not fixed pixel widths. Reference proportions:
  - Home: Market Flow `col-3` (left) · Hero `col-6` (center) · Watchlist `col-3` (right).
  - Dashboard: Market Flow bar spans 12 on top · Watchlist `3` left · Signal + Chart `6`
    center · Stock Summary / Captain's Log / Strategy Assignment `3` right.
  - Strategy Forge: its own `.forge-grid` (not the shared 12-col utilities) —
    Fundamentals + Technical (education) · Strategies list/toolbar · Config panel.
    Four columns at `>= 1280px`, two columns on tablets (`768–1279px`), stacked on
    mobile. DOM order is Strategies → Config → Fundamentals → Technical so the mobile
    stack leads with the editor; desktop column positions are set explicitly.
- Keep spacing on the 4pt-aligned tokens for consistent padding/margins/gaps across
  widgets (grids use `gap: var(--space-4)`; cards use `--space-3`).

## Responsiveness

- Desktop grids activate at `>= 1024px`; below that, layouts stack to a single column.
- The header stacks at `<= 640px`.
- On mobile, each major widget remains a clearly separated section/card so the page
  does not become one long unstructured scroll. Dashboard mobile order is set with
  flex `order`: Market Flow, Watchlist, Signal, Chart, Stock Summary, Strategy
  Assignment, Captain's Log.
