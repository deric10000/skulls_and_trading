# Skulls and Trading — Product Vision & Core Values

Companion to [`design-system.md`](design-system.md) and
[`product-voice.md`](product-voice.md). This is the source of truth for **why**
the product exists and the values every feature must serve. When a feature,
copy, or design decision conflicts with this file, this file wins.

## Vision

> **Skulls and Trading is a private club for disciplined investors and traders —
> a crew, not a crowd.**
>
> Members forge their own strategies, hold themselves to their own plans, and
> sail with Ships that match how they invest — investors with investors, swing
> traders with swing traders, momentum with momentum. The app is the club's
> flagship: a dark, premium command deck that scores conviction against *your*
> rules and never sells you a trade. The community is the treasure — shared
> strategies, honest reviews, real support, and craft you can hold in your
> hands.

### The club model

Skulls and Trading is the **club**; the app is the main feature you get by
joining — alongside community and support.

| Pillar | What it is |
| --- | --- |
| **The flagship** | The app — Strategy Forge, conviction scoring, Current Watch, Market Weather, Captain's Log. Membership's headline benefit and the club's proving ground. |
| **The crew** | Community + support. Strategies are built as individuals and shared as a club. Ships are style-aligned crews (investing vs trading, long-term vs short-term, swing vs momentum). |
| **The craft** | The club's dark-art heritage made real — member stickers, shirts, hats. Art by the founder's hand (and later, members'), never AI-generated merch. |

### Horizons — club first, monetize after proof

1. **Beta 0 (now, invite-only):** prove the discipline loop end-to-end for real
   members on the live shell.
2. **Closed Beta (the private club):** membership as the product — app +
   community + support. Learn what members actually want, how they use it, and
   what earns trust.
3. **MVP (refined by the crew):** member evidence shapes the paid product.
   Monetize only what Beta already proved valuable. The club stays a club — the
   app never becomes a casino.

## Core values

Derived from the founder's personal values — family first, health & fitness,
purpose, value & usefulness, hobbies & interests, learning & experience,
loyalty, integrity, perseverance, discipline, creativity, kindness — translated
into how the club operates.

1. **Discipline over dopamine** *(discipline, perseverance)* — The club rewards
   following your own plan, never activity, streak-chasing, or the gamble. No
   buy/sell calls, no FOMO mechanics, no activity badges.
2. **Integrity of the deck** *(integrity, value & usefulness)* — Honest data,
   honest states, honest copy. Stale data says stale; missing data says
   missing. Trust is the product; no dark patterns.
3. **Crew before crowd** *(family first, loyalty, kindness)* — Members are
   crewmates, not user counts. Privacy defaults to private; sharing is opt-in
   and generous; reviews are kind and useful. Ships group members by style, not
   status.
4. **The long voyage** *(family first, health & fitness, perseverance)* —
   Trading serves a life, not the other way around. Daily-cadence scoring over
   tick-watching; review rhythms over screen time. The app should lower
   anxiety, not feed it.
5. **Earn the treasure** *(purpose, value & usefulness)* — Value is proven
   before it is charged for. Monetization is an MVP decision driven by member
   evidence, never a launch gate.
6. **Always learning** *(learning & experience, hobbies & interests)* — Log the
   thesis, review the outcome, refine the rules. Experience compounds when it
   is captured — and lessons are shared with the crew.
7. **Craft over content** *(creativity, hobbies & interests)* — The club's look
   is authored, not generated. Dark-art heritage (the 70s–90s illustration era:
   Frank Frazetta through Jim Lee; Boris Vallejo and Julie Bell), drawn by
   hand, worn with pride. Future member artwork is real art by real hands.

## The art thread

The club's aesthetic flows from the founder's life as an artist — a love of
dark art (hence the name) and classic fantasy illustration. Near-term the
Command Deck design system carries that heritage (dark, premium,
hand-authored). Later, the club provides members physical artwork — stickers,
shirts, hats — created by the founder or contributed by members. There may be a
deeper art × trading tie-in the club hasn't named yet: park ideas, don't ship
gimmicks.

## Feature gate — check every build against this file

Before building or materially changing a feature, answer:

- [ ] **Which core value does this serve?** If none, question the feature.
- [ ] **Does it keep the club a club?** (Members and crews, not a crowd or
      a leaderboard.)
- [ ] **Does it reward the plan, not the gamble?** (No advice, no hype, no
      activity rewards — see `product-voice.md` compliance checklist.)
- [ ] **Does it respect the long voyage?** (No mechanics that demand
      screen-watching or punish stepping away.)
- [ ] **Is the craft authored?** (Design within the Command Deck system; no
      generated slop on member-facing art.)
- [ ] **If it monetizes:** has Beta evidence already proven members find it
      valuable?
