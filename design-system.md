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

- Radius (concentric 8/6/4, capped at 8px): `--radius-sm: 0.25rem` (4px, small controls), `--radius-md: 0.375rem` (6px, sub-cards/inner panels & avatar/badge tiles), `--radius-lg: 0.5rem` (8px, card containers). Card containers (`.hero`, `.panel`) use `--radius-lg`; elements nested inside a card must use a radius ≤ 8px (step down so inner corners stay smaller than their container).
  - **Always use the radius tokens — never hardcode a radius value.** Mapping: card/large containers → `--radius-lg`; sub-cards, inner panels, avatar/badge squircles (e.g. `.avatar-mark`, `.badge-medallion`, `.member-avatar`) → `--radius-md`; buttons, chips, tabs (`.tab`), inputs, focus rings → `--radius-sm`.
  - Allowed non-token exceptions only: fully-round pills (`999px`) and circles (`50%`) where that exact shape is intended, and thin data-viz bars (`.chart-bar`, 2px) that are smaller than the scale. Nothing else may exceed 8px.
- Shadow: `--shadow-card: 0 18px 48px rgb(2 6 18 / 0.5)`, `--shadow-glow: 0 0 40px rgb(241 178 74 / 0.12)`.
- Spacing scale (4pt-aligned): `--space-1: 0.4rem`, `--space-2: 0.75rem`, `--space-3: 1.1rem`, `--space-4: 1.6rem`, `--space-5: 2.4rem`.

Prefer these tokens (or multiples that stay on the 4pt grid) over ad-hoc pixel values.

## Typography

- Font family: **IBM Plex Sans** (primary), with `system-ui, -apple-system,
  BlinkMacSystemFont, "Segoe UI", sans-serif` fallbacks. Line height ~1.55. IBM Plex
  Sans is loaded as a web font in [`index.html`](index.html) (weights 400/500/600/700)
  and set on `:root` in [`src/index.css`](src/index.css); its slightly technical,
  engineered character suits the command-deck tone.
- Headings use `--text-strong`; body uses `--text-base` / `--text-muted`.
- Eyebrows and labels: uppercase, letter-spaced, small, often `--accent-strong` or `--text-faint`.
- Numeric values use `font-variant-numeric: tabular-nums`.

## Core component patterns (class names in `src/index.css`)

- `.panel` — rounded dark card: `--surface-1`, `--border-soft`, `--radius-lg`, `--shadow-card`. **16px padding on all sides** (baked into the base rule), so content breathes consistently on every card app-wide; don't re-set card padding per page/breakpoint. `.hero` matches.
- `.panel-head` / `.panel-tag` / `.panel-intro` — card header row, small uppercase tag, intro text.
- **Card scroll standard** — when a region scrolls *inside* a card it gets an **8px bar parked 4px from the card edge with 4px to content** (4 + 8 + 4 = the card's 16px right inset). Desktop effect only (where the region actually scrolls); mobile/tablet scroll at the page level. Appearance is shared once in the "Card scroll standard" block in `src/index.css` (`.hero-body`, `.flow-steps`, `.watchlist-items`, `.strategy-list`); positioning per scrolling region is `overflow: hidden auto; margin-right: -12px; padding-right: 4px; scrollbar-gutter: stable;`. Never scroll the padded card itself — always an inner region. New scrollable card regions join the same group + inset. See `.cursor/rules/components.mdc` for the full contract.
- `.btn` — base style is the **blue secondary** action (used bare for supporting actions like Add / New note / Assign). `.btn--primary` (gold gradient CTA), `.btn--ghost` (neutral outline), `.btn--small` (compact size). Variants fully override surface + color so the same button looks identical on desktop and mobile. Focus ring is keyboard-only (no ring on click); mobile tap-highlight is suppressed.
- `.btn--link` — text-forward link button used for header/account actions like Sign Out. It keeps the same hit area and rounded interaction target as a button, but visually reads as a blue text link with no border or fill.
- `.chip` — **borderless** tinted pill badge; tone is carried by fill + text/icon color, never a border (keeps tags visually distinct from bordered buttons). Status tones: `.status--positive`, `.status--negative`, `.status--warning`, `.status--neutral`. `.chip--soon` for "coming soon". Supports an optional leading status icon (`.chip svg` / `.chip-icon` auto-sizes to `1em`).
- `.tabs` / `.tab` / `.tab--active` (+ `.tabs--fill` for equal-width segments) — the single shared segmented control. Render via the `Tabs` component (`src/components/Tabs.tsx`); never hand-roll a tab strip. States: unselected (muted), hover (subtle surface tint), selected (`.tab--active`, gold gradient matching `.btn--primary`), disabled (dimmed, non-interactive). Focus is keyboard-only — no second border on selection. Used by the home deck and the auth sign-in/create-account switch.
- `.input` — shared form field (text inputs **and** selects): `--surface-3` fill, `--border-strong`, `--radius-sm`, `font: inherit`. `flex: 1` so it stretches inside a flex row (wrap in a flex container to make a standalone control full-width).
- **`select.input` — the one dropdown / droplist affordance app-wide.** A native `<select>` reusing `.input` (so dropdowns match text fields), with the native chevron replaced by a design-system **CaretDown** caret (`appearance: none` + an inline SVG background, filled `--text-muted`) so the affordance looks identical across browsers. Hover lifts the border; keyboard focus is the global gold `:focus-visible` ring. **Every dropdown uses `select.input`** — never hand-roll a custom popover menu. Render via the shared **`Dropdown`** component (`src/components/Dropdown.tsx`), which wraps the labelled `<select>` and exposes two style variants: `default` (the standard surface look) and `on-graphics` (`.input--on-graphics` — dark translucent fill + borderless edge, **used ONLY over imagery** so the affordance stays legible on busy artwork, e.g. the Market Weather condition art; the caret SVG is preserved by overriding `background-color`, not the `background` shorthand). Adopters: portfolio/watchlist switcher (`.portfolio-switcher`, both home + dashboard watchlists — its selection type drives whether the "Add ticker" form shows: portfolios are live-connected so they hide it, watchlists show it), the Market Weather Sector/Industry selectors (`on-graphics`), Strategy Assignment, Create Ship privacy.
- `.watch-item` — watchlist cards; a **selectable card** (`.select-card` + `.is-selected`), so hover/selected match strategy/flow cards (see "Selectable card interaction standard").
- `.conviction` — track + gold fill bar.
- `.mini-card`, `.lens-card`, `.edu-card` — nested content cards.
- `.flow-step` / `.flow-index` / `.flow-select` / `.flow-summary` — top-down market flow steps; each step is a **selectable card** (`.select-card` + `.is-selected` on the li, inner `.flow-select` button) that opens a `.flow-summary` detail view (ship art background + scrim + back breadcrumb), mirroring the read-only watchlist master/detail.
- `.chart-frame`, `.chart-line`, `.chart-volume`, `.indicator-tags` — chart placeholder + indicator chips.
- `.config-chip` / `.strategy-card` — Strategy Forge controls and list cards; `.strategy-card` is a **selectable card** (`.select-card` + `.is-selected`).

## Iconography

- **Set:** [Phosphor Icons](https://phosphoricons.com) (`@phosphor-icons/react`), chosen to pair with IBM Plex Sans — friendly geometric forms with humanist warmth, and a `fill` weight for solid status glyphs.
- **Weight:** `fill` globally, set once via `IconContext.Provider` in `src/main.tsx`. Do not pass `weight` per icon unless intentionally overriding.
- **Single source:** import icons from `src/lib/icons.tsx`, not the package directly, so the curated set stays consistent. New icons get added there.
- **Sizing:** icons inside chips auto-size to `1em` via `.chip svg` / `.chip-icon`. Elsewhere, size relative to adjacent text.
- **Status chip mapping** (`STATUS_ICON` in `src/lib/icons.tsx`): Aligned → `CheckCircle`, Watch → `Eye`, Review/Rule Check/Risk Check/Thesis Needed/Trim Review → `Warning`, Exit Review → `WarningOctagon`. Coming soon → `Clock`, Demo → `Sparkle`. Icon color always inherits the chip tone.
- Icons are decorative when paired with a text label — mark them `aria-hidden`.

## Interaction + motion

- Hover lifts cards/buttons slightly (`translateY(-1px/-2px)`); honors `prefers-reduced-motion`.
- Focus-visible uses a 2px `--accent-strong` outline.
- **Selectable card interaction standard (`.select-card` / `.is-selected`)** —
  every card the user can *pick* shares one rest/hover/selected treatment so the
  set stays consistent. Defined once in the "Selectable card interaction
  standard" block in `src/index.css`; layout/padding/content stay per-component.
  - **Rest:** `1px var(--border-soft)` border on `--surface-2`, `--radius-md`.
  - **Hover:** border → `--border-strong`, `transform: translateY(-1px)`.
  - **Selected:** gold border `rgb(241 178 74 / 0.55)`, background `--surface-1`,
    `box-shadow: var(--shadow-glow)`.
  - **Focus:** the global `:focus-visible` gold ring — never re-styled per card.
  - **How to apply:** add `.select-card` to the interactive element (or the
    wrapper that owns the border) and toggle `.is-selected` when chosen; always
    mirror the state with `aria-pressed` (toggles) or `aria-current` (nav). Never
    hand-roll hover/selected border + glow on a new selectable card — adopt this.
  - **Current adopters:** `.watch-item`, `.strategy-card`, `.flow-step`. See
    `.cursor/rules/components.mdc` for the contract.

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

- Desktop grids activate at `>= 1024px`; below that, layouts stack to a single column. The home page is a special case: below tablet width it becomes a tabbed swipe deck, then becomes a 3-up viewport-height layout at tablet/desktop widths.
- The header stacks at `<= 640px`.
- On mobile, each major widget remains a clearly separated card so the page does not
  become one long unstructured scroll.
- **Scroll model / page layout contract:** `.app-main` is the only scroller on
  desktop/tablet (the document is locked to the viewport); the whole page scrolls on
  mobile. New pages must not add `100vh`/`min-height: 100vh` or a page-level scroller.
  Full contract lives in [`.cursor/rules/components.mdc`](.cursor/rules/components.mdc)
  ("App shell" + "Pages — layout & scroll contract") — don't duplicate it here.

## Navigation model

- Authenticated top navigation has exactly five tabs: **Home, Dashboard, Strategy Forge,
  Ships, Captain Profile**.
- Login / Onboarding lives **outside** the authenticated app shell.
- Watchlist, Captain's Log, Strategy Check, Market Weather, Treasure Ledger, Scores,
  Badges, and Strategy Assignment are **widgets/modules**, never top-level tabs.

## Shipped modules & components (reconciliation)

This section maps the design system to what is implemented in code.

### Auth shell (outside the app shell)

- `LoginScreen` — split brand panel + sign in / create account tabs + Demo card.
- `SignUpForm`, `DemoModeCard` ("Continue as Demo Captain"), `AuthButton`,
  `AuthErrorState`, `LinkButton`, and a 5-step `Onboarding` (profile → style → risk → strategy →
  holdings/demo → first log). All mock; no backend, no brokerage linking. Safety
  microcopy from [`product-voice.md`](product-voice.md).
- Classes: `.auth-screen`, `.auth-shell`, `.auth-brand`, `.auth-panel`,
  `.auth-form`, `.auth-field`, `.auth-error`, `.demo-card`, `.onboarding`. The
  sign-in / create-account switch uses the shared `Tabs` component
  (`.tabs--fill`), not a bespoke tab style.

### Status taxonomy (plan-safe)

- Strategy Check states (`SignalState`): High Alignment, Entry Aligned, Watch Setup,
  Hold Plan, Trim Review, Exit Review, Review Risk, Rule Conflict, Rule Break,
  Thesis Missing. Tones: positive (green), neutral (blue), warning (amber),
  negative (red).
- Watchlist / portfolio alignment labels (`StatusType`): High Alignment, Aligned, Watch,
  Review, Risk Check, Thesis Check. Tone is resolved through `STATUS_TONE`
  (`src/lib/status.ts`) — the single source used by `StatusBadge` and the inline
  "Strategy Check · <status>" label so chip + text never disagree.
- Market Weather statuses (`MarketWeatherStatus`): Calm Waters, Storm Watch,
  Risk-On Tide, Choppy Seas, Rotation Current, Breakout Wind, Defensive Harbor.

### Mock data: single source of truth

- `src/data.ts` defines `TICKERS` (company-level facts: company, category, last price,
  analysis, logs) and `PORTFOLIOS` (a portfolio/watchlist with per-holding cost basis,
  shares, open P&L %, conviction, alignment status, and reason). A **portfolio** is a
  (future) live-connected brokerage account and can't add tickers; a **watchlist** is
  user-curated and can.
- Legacy exports (`INITIAL_WATCHLIST`, `TICKER_ANALYSIS`, `LOG_ENTRIES`,
  `DEFAULT_ASSIGNMENTS`, `POSITIONS`) are **derived** from `DEFAULT_PORTFOLIO` /
  `TICKERS` — update the source registries, not the derived arrays.

### Market Weather (condition cards)

- `MarketFlowWidget` renders four stacked layer cards (Market → Sector → Industry
  → Stock) on the shared `.flow-step.select-card` surface. Each card is a pure
  backdrop: the dynamic per-condition art/gradient fills it and the content
  floats over it in an absolute `.weather-overlay` (top-left, stacked). Cards
  carry `min-height` since they hold no in-flow content.
- The 10 weather conditions are defined ONCE in `src/lib/weather/conditions.ts`
  (label, icon, copy, design-system colors). Each maps to a CSS pair:
  `.weather--<id>` sets `--w-accent` (drives the score bars) and `.weather-bg--<id>`
  is the gradient background (fallback until artwork is wired). Condition tone →
  chip color via `SEVERITY_TONE`.
- All ten conditions ship with art (`src/assets/market-weather-bg-<conditionId>.webp`,
  full-res WebP at q90) via `flow-step-art`; any id without an entry falls back to
  its gradient. Add/replace a condition's art by following that filename convention
  and registering it in `WEATHER_ART` (`lib/weather/graphics.ts`). The card scrim
  (`.flow-step::after`) keeps text legible; backgrounds are decorative (`aria-hidden`).
- Card content is a dark translucent **head pill** (`.weather-headpill`, the
  click target that opens the detail view) holding: the shared numbered badge
  (`.flow-index` — soft-gold disc + `--accent-strong` number), the layer/entity
  label (`.weather-layer`, matches
  `.watch-ticker`), the condition chip (`ConditionChip`), and the confidence chip
  (`ConfidenceChip` — `SealPercent` icon + `NN%`). The card stays minimal — the
  full "why"/sub-scores live in the detail view.
- **Chip coloring (two different rules):**
  - `ConditionChip` is tone-colored by the condition's severity via
    `SEVERITY_TONE` (e.g. positive conditions → green `.status--positive`).
  - `ConfidenceChip` is colored by **range, not condition tone**, via
    `confidenceTone(value)`: `>= 70` → `.status--positive` (high), `40–69` →
    `.status--warning` (medium), `< 40` → `.status--negative` (low). Thresholds
    (`CONFIDENCE_HIGH_MIN` / `CONFIDENCE_MEDIUM_MIN` in `lib/weather`) anchor to
    the Figma examples (90/60/39) and sit just under the session confidence caps.
- Condition icons live in the shared library (`WEATHER_CONDITIONS[id].defaultIcon`):
  Risk-On Tide → `Waves`, Breakout Wind → `Wind`, Rotation Current → `Hurricane`,
  Headwind → `WindReversed` (the `Wind` glyph mirrored on X, so the gust opposes
  Breakout Wind).
- Sector/Industry cards add a selector below the head pill: a full-width
  **droplist** (the shared `Dropdown`, `on-graphics` variant, wrapped in
  `.weather-select`) that steps through the watch's groups alphabetically. The
  Stock card instead gets a compact gold **Previous / Next** toggle
  (`.weather-prevnext`, `--accent-strong` text + bold `CaretLeft`/`CaretRight`)
  that cycles the watch's names. All three selectors are **local to Market
  Weather** — stepping them never changes the Current Watch selection — and they
  re-enable pointer events above the click-through overlay so changing a layer
  doesn't open the detail view. Default selection follows the focused/first watch
  stock; selecting a name in Current Watch still refocuses every layer (and
  resets the local overrides). The droplist is always full card width; the
  Prev/Next toggle hugs the trailing edge. Both get a ~44px tap-target floor
  below 1024px (the wider mobile/tablet, touch contexts) while desktop keeps the
  dense Figma layout.

### Scores (discipline-first)

- `ScoreCard` + `ScoreSummary`. Keys map to `--score-*` tokens; Discipline renders as
  the hero card and Progress is intentionally de-emphasized.
- Classes: `.score-grid`, `.score-card`, `.score-card--hero`, `.score-fill[data-score]`.

### Badges (behavior only)

- `BadgeCard` + `BadgeShowcase`. Rarity drives medallion glow via `--rarity-*`; states
  are `locked` / `in-progress` / `earned`. Never reward trade frequency, size, or P/L.
- Classes: `.badge-grid`, `.badge-card--{state}`, `.badge-medallion[data-rarity]`,
  `.badge-rarity[data-rarity]`, `.badge-state--{state}`.

### Treasure Ledger (portfolio tracker)

- `TreasureLedger` with `PortfolioMetricCard`, `PositionCard`, `AllocationCard`,
  `RiskRuleCard`. Discipline/risk metrics lead; raw return is last and de-emphasized.
  Dollar values are hidden under Private/Ghost privacy modes.
- Classes: `.metric-grid`, `.metric-card--hero`, `.ledger-columns`, `.position-card`,
  `.allocation-bar`, `.risk-rule-list`.

### Captain Profile

- `AvatarCard`, `StyleSelector`, `RiskProfileSelector`, `PrivacyModeSelector`,
  `PortfolioLinkStatusCard`, `ShipMembershipCard`, plus `ScoreSummary` + `BadgeShowcase`.
- Shared `ChoiceGroup` pill selector (`.choice-chip`).

### Ships (crews)

- `ShipCard`, `CreateShipForm`, `JoinShipForm`, `InviteMemberModal`, `MemberCard`,
  `ShipLeaderboardCard`, `WeeklyReviewCard`, `SharedLogCard`, `ShipBadgeCard`,
  `ShipPrivacyNotice`. Leaderboard ranks discipline categories only — never profit.
- Privacy default is Private; values/holdings/size are never shared without opt-in.
- Classes: `.ship-grid`, `.ship-card`, `.member-grid`, `.leaderboard-list`,
  `.weekly-review-list`, `.shared-log-list`, `.modal-backdrop`.

### Component states audited

Default, Hover, Active, Selected, Disabled, Empty, In-progress, Earned/Completed,
Locked, plus tone states (positive/neutral/warning/negative) are represented across
buttons, chips, choice chips, score/badge cards, link options, and the dashboard
empty state. Motion is subtle and honors `prefers-reduced-motion`.
