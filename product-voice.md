# Skulls and Trading — Product Voice & Compliance-Safe UX Writing

Companion to [`design-system.md`](design-system.md). This is the source of truth for
tone, vocabulary, and the action-state labels used across Phases 3–8. When in doubt
about copy, this file wins.

> Core thesis: **reward discipline, not gambling.** The app helps users review whether
> an action aligns with their own rules. It never tells them what to buy or sell.

## Voice

Confident, sharp, strategic, slightly pirate-flavored — never cheesy.

Sound like:

- A disciplined trading captain
- A tactical coach
- A strategy-game command system
- A calm advisor under pressure

Do **not** sound like:

- "Buy now", "Get rich", "Crush the market"
- "Trade to keep your streak", "Beat your friends"
- "This stock is perfect", "Hot pick", "YOLO", "Don't miss out"

## Vocabulary

Use: plan, thesis, rules, discipline, conviction, risk, review, position, strategy,
log, crew, ship, storm, treasure, map, command, forge, signal, alignment,
invalidation, exposure, allocation.

Avoid: gamble, casino, bet big, guaranteed, trade now, get rich, copy, hype, moonshot
(as a reward), leaderboard dominance, FOMO (as encouragement), YOLO, "unlock by trading".

Thematic terms to keep premium (use): Captain Profile, Ships, Crew, Command Deck,
Captain's Log, Treasure Ledger, Strategy Forge, Market Weather, Discipline Score,
Badge Shelf, Crew Review, Weekly Review, Privacy Mode.

Thematic terms to avoid: clan, guild, casino, wager, bet, raid-for-profit,
loot-as-profit, crush friends, beat the market, "trade more to level up".

## Core UX language rule

Do not tell the user what to buy or sell. Frame the app as helping the user review
whether an action aligns with **their own** rules.

Safer examples:

- "Review your plan" · "Check alignment" · "Log your thesis" · "Define your invalidation"
- "This position may exceed your stated risk rule"
- "Your cash allocation differs from your plan"
- "You have not reviewed your last closed trade"
- "This entry appears to be missing a catalyst"
- "Discipline score improved" · "Plan followed" · "Rule break detected" · "Thesis logged"

Avoid:

- "Buy this" · "Sell this" · "We recommend this trade"
- "This stock is perfect for you" · "Top users are buying"
- "Trade now to keep your streak" · "You're falling behind" · "Beat your crew"

## Action-state mapping (canonical)

Wherever the app would otherwise show a buy/sell recommendation, use the user-plan
state instead. This is the authoritative label set for the Strategy Check widget,
watchlist mini-states, and any signal surface.

| Old (advice-like) | Command Deck label  | Tone (token)        |
| ----------------- | ------------------- | ------------------- |
| Strong Buy        | High Alignment      | positive (green)    |
| Buy               | Entry Aligned       | positive (green)    |
| Hold              | Hold Plan           | neutral (blue)      |
| Watch             | Watch Setup         | neutral (blue)      |
| Trim              | Trim Review         | warning (amber)     |
| Sell              | Exit Review         | warning (amber)     |
| Avoid             | Rule Conflict       | negative (red)      |
| —                 | Review Risk         | warning (amber)     |
| —                 | Rule Break          | negative (red)      |
| —                 | Thesis Missing      | warning (amber)     |
| —                 | Risk Exceeded       | negative (red)      |

Watchlist / portfolio alignment states (`StatusType`): High Alignment, Aligned, Watch,
Review, Risk Check, Thesis Check. These describe how a holding lines up with the
portfolio's assigned strategy — never a buy/sell call. Tone mapping lives in
`src/lib/status.ts` (`STATUS_TONE`) so the chip and inline "Strategy Check · <status>"
label always agree.

Market Weather statuses: Calm Waters, Storm Watch, Risk-On Tide, Choppy Seas,
Rotation Current, Breakout Wind, Defensive Harbor.

## Scoring & badge language

Score card taglines: Discipline → "Plan followed"; Risk → "Exposure checked";
Research → "Thesis documented"; Review → "Lessons captured"; Progress → "Portfolio
tracked". Discipline is conceptually and visually more important than raw profit.

Badges reward behavior (e.g. Iron Hands, No FOMO Streak, Risk Captain, Journal Streak,
Cutlass Discipline, Treasure Map, Storm Survivor, Quartermaster, Kraken Slayer,
Rulekeeper, Steady Helm). Never create badges for most trades, biggest YOLO, highest
risk, most leverage, biggest one-day gain, beating friends, activity streaks, or copying.

## Privacy language

Default is **Private**. Modes: Private (only you), Ghost (friends see %s, badges,
discipline score, general style — no dollar values/holdings/cost basis/broker/size),
Crew (selected trades/notes/stats/holdings), Full Transparency (opt-in only).

Reminder copy: "Your treasure stays buried unless you choose to share it." and
"You control what your crew can see. Portfolio values, holdings, broker data, and
trade size stay private unless you choose to share them."

## Safety microcopy

"Skulls and Trading does not place trades or provide personalized financial advice.
It helps you track your own strategy and discipline."

## Compliance checklist (quick gate for any new copy)

- [ ] Does it avoid telling the user to buy/sell/hold a specific security?
- [ ] Is any action framed as a check against the user's own stated rules?
- [ ] Does it avoid guarantees, hype, and FOMO?
- [ ] Does it reward discipline/behavior, not trade frequency or size?
- [ ] Are dollar values / holdings gated behind the user's privacy choice?
