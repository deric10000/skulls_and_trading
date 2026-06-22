import type {
  Allocation,
  Badge,
  CaptainProfile,
  DecisionSignal,
  EducationCard,
  ExitRule,
  LogEntry,
  MarketFlowStep,
  PortfolioMetric,
  Position,
  PrivacyMode,
  RiskProfile,
  RiskRule,
  ScoreMetric,
  SharedLog,
  Ship,
  ShipLeaderboardRow,
  ShipMember,
  ShipMembership,
  Strategy,
  StrategyAssignments,
  TickerAnalysis,
  TimeHorizon,
  Timeframe,
  TradingStyle,
  WatchlistItem,
  WeeklyReviewItem,
} from "./types";

export const INITIAL_WATCHLIST: WatchlistItem[] = [
  {
    ticker: "NVDA",
    name: "Nvidia · AI Infrastructure",
    price: 187.42,
    changePct: 2.31,
    status: "Aligned",
    conviction: 88,
  },
  {
    ticker: "AMD",
    name: "Advanced Micro Devices · Compute",
    price: 164.05,
    changePct: 1.12,
    status: "Watch",
    conviction: 74,
  },
  {
    ticker: "SOFI",
    name: "SoFi Technologies · Fintech",
    price: 14.86,
    changePct: -0.94,
    status: "Review",
    conviction: 52,
  },
  {
    ticker: "IONQ",
    name: "IonQ · Quantum Computing",
    price: 41.73,
    changePct: 4.68,
    status: "Watch",
    conviction: 61,
  },
  {
    ticker: "ACHR",
    name: "Archer Aviation · eVTOL",
    price: 9.21,
    changePct: -2.15,
    status: "Risk Check",
    conviction: 44,
  },
  {
    ticker: "BBAI",
    name: "BigBear.ai · Defense AI",
    price: 6.34,
    changePct: 3.07,
    status: "Thesis Needed",
    conviction: 48,
  },
];

export const TICKER_ANALYSIS: Record<string, TickerAnalysis> = {
  NVDA: {
    setupSummary:
      "Trending above all key moving averages with volume confirming each push higher.",
    thesis:
      "Sits at the center of the AI build-out cycle. Data-center demand keeps pricing power high while software widens the moat.",
    risk:
      "Expectations are rich. A single soft data-center guide could trigger a fast multiple reset.",
    catalyst: "Next earnings print and data-center guidance.",
    signals: [
      { label: "Uptrend", tone: "positive" },
      { label: "Volume confirms", tone: "positive" },
      { label: "Extended", tone: "neutral" },
    ],
    investorView:
      "A category leader monetizing the AI infrastructure wave through chips, networking, and software. The question is durability of demand, not whether demand exists.",
    traderView:
      "Buyers in control above the rising 20 EMA. Watch for continuation on volume; fade only if price loses the prior breakout shelf.",
  },
  AMD: {
    setupSummary:
      "Breaking out of a multi-week base; needs volume to hold the move.",
    thesis:
      "The credible second source in AI compute. Share gains in data-center GPUs and CPUs can re-rate the story.",
    risk: "Execution gap vs. the leader; margins still proving out.",
    catalyst: "Data-center GPU ramp and hyperscaler design wins.",
    signals: [
      { label: "Breakout", tone: "positive" },
      { label: "Base resolved", tone: "positive" },
      { label: "Needs volume", tone: "neutral" },
    ],
    investorView:
      "A challenger with real product momentum. Upside hinges on converting design wins into sustained data-center revenue.",
    traderView:
      "Fresh breakout. Constructive while it holds above the breakout level; failure back inside the base weakens the setup.",
  },
  SOFI: {
    setupSummary:
      "Chopping under resistance; trend is undecided and momentum is cooling.",
    thesis:
      "A digital-first bank compounding members and cross-selling products. Profitability inflection is the story.",
    risk: "Rate sensitivity and credit normalization could pressure results.",
    catalyst: "Member growth and net-interest-margin trajectory.",
    signals: [
      { label: "Range-bound", tone: "neutral" },
      { label: "Momentum cooling", tone: "negative" },
      { label: "At resistance", tone: "neutral" },
    ],
    investorView:
      "A growth-stage fintech proving it can turn member growth into durable earnings. Watch credit quality alongside growth.",
    traderView:
      "No edge mid-range. Wait for a decisive reclaim of resistance or a flush to support before committing.",
  },
  IONQ: {
    setupSummary:
      "High-volatility name pressing higher on speculative momentum.",
    thesis:
      "A pure-play bet on commercial quantum computing reaching useful scale.",
    risk: "Pre-commercial economics; story trades on narrative, not earnings.",
    catalyst: "Hardware roadmap milestones and enterprise pilots.",
    signals: [
      { label: "Momentum", tone: "positive" },
      { label: "Speculative", tone: "negative" },
      { label: "High beta", tone: "neutral" },
    ],
    investorView:
      "A long-duration moonshot. Position sizing matters more than entry; the thesis is measured in years, not quarters.",
    traderView:
      "Tradeable volatility for those who respect risk. Define invalidation before entry and keep size small.",
  },
  ACHR: {
    setupSummary:
      "Pulling back into support after a failed push; trend is fragile.",
    thesis:
      "An eVTOL contender racing toward certification and commercial routes.",
    risk: "Certification timing and cash burn are existential variables.",
    catalyst: "FAA certification progress and order conversions.",
    signals: [
      { label: "Pullback", tone: "negative" },
      { label: "Testing support", tone: "neutral" },
      { label: "Binary risk", tone: "negative" },
    ],
    investorView:
      "A pre-revenue bet on a new category of air mobility. Reward is large, but so is the certification and funding risk.",
    traderView:
      "Respect the pullback. Only constructive if support holds and buyers step back in on volume.",
  },
  BBAI: {
    setupSummary:
      "Attempting to base after a volatile stretch; early and unproven.",
    thesis:
      "Applies AI to defense and intelligence workflows with government exposure.",
    risk: "Lumpy contract revenue and dilution history.",
    catalyst: "New government contract awards.",
    signals: [
      { label: "Basing", tone: "neutral" },
      { label: "Contract-driven", tone: "neutral" },
      { label: "Unproven", tone: "negative" },
    ],
    investorView:
      "A speculative defense-AI play. The thesis lives and dies on winning and renewing government contracts.",
    traderView:
      "Event-driven and thin. Treat as a tactical position around catalysts with tight risk control.",
  },
};

export const LOG_ENTRIES: Record<string, LogEntry[]> = {
  NVDA: [
    {
      id: "nvda-1",
      title: "Why I'm watching",
      note: "Leadership name in the AI cycle and a tell for broad risk appetite.",
      strategy: "Trend Rider",
      timestamp: "Today · 09:42",
    },
    {
      id: "nvda-2",
      title: "Next action",
      note: "Hold core; add only on a controlled pullback to the 20 EMA. Invalidation: a close back below the breakout level on heavy selling.",
      strategy: "Aggressive Growth",
      timestamp: "Today · 09:44",
    },
  ],
  AMD: [
    {
      id: "amd-1",
      title: "Watching breakout setup",
      note: "Second-source AI compute with a fresh base breakout. Cleared multi-week resistance intraday.",
      strategy: "Momentum",
      timestamp: "Today · 10:15",
    },
    {
      id: "amd-2",
      title: "Next action",
      note: "Need confirmation above resistance before adding. Invalidation: loss of the breakout level back into the prior base.",
      strategy: "Volume Confirmation",
      timestamp: "Today · 10:17",
    },
  ],
  SOFI: [
    {
      id: "sofi-1",
      title: "Why I'm watching",
      note: "Profitability inflection in a growing digital bank. Momentum cooled into resistance; no clean trigger yet.",
      strategy: "Pullback Entry",
      timestamp: "Today · 11:03",
    },
  ],
  IONQ: [
    {
      id: "ionq-1",
      title: "Speculative momentum",
      note: "Long-duration quantum optionality with high volatility. Keep size small; let the position prove itself.",
      strategy: "Speculative Runner",
      timestamp: "Today · 11:48",
    },
  ],
  ACHR: [
    {
      id: "achr-1",
      title: "Pulled back into support",
      note: "Certification-stage eVTOL with binary upside. Stand aside until support holds with buyers returning.",
      strategy: "Risk-Off / Defensive",
      timestamp: "Today · 12:20",
    },
  ],
  BBAI: [
    {
      id: "bbai-1",
      title: "Watch only",
      note: "Defense-AI contract optionality. Trying to base after a volatile stretch. Revisit on a confirmed base and catalyst.",
      strategy: "Broken Thesis / Exit Watch",
      timestamp: "Today · 13:05",
    },
  ],
};

export const DEFAULT_STRATEGIES: Strategy[] = [
  {
    id: "aggressive-growth",
    name: "Aggressive Growth",
    description:
      "Lean into high-conviction growth leaders while the trend and thesis are intact.",
    isDefault: true,
    enabled: true,
    timeframe: ["Swing", "Long Term"],
    tags: ["Aggressive Growth"],
    decisionSignals: ["Thesis", "Catalyst"],
    exitLogic: ["Break Thesis", "Macro Changes"],
  },
  {
    id: "momentum",
    name: "Momentum",
    description: "Ride strength while price and volume keep confirming the move.",
    isDefault: true,
    enabled: true,
    timeframe: ["Swing"],
    tags: ["Momentum"],
    decisionSignals: ["Volume", "Risk / Reward"],
    exitLogic: ["Lose Trend", "Hit Target"],
  },
  {
    id: "breakout-watch",
    name: "Breakout Watch",
    description: "Stalk bases and wait for a clean breakout with volume confirmation.",
    isDefault: true,
    enabled: true,
    timeframe: ["Swing"],
    tags: ["Momentum"],
    decisionSignals: ["Volume", "Catalyst"],
    exitLogic: ["Lose Trend", "Hit Target"],
  },
  {
    id: "pullback-entry",
    name: "Pullback Entry",
    description: "Buy controlled pullbacks into support within an established uptrend.",
    isDefault: true,
    enabled: true,
    timeframe: ["Swing"],
    tags: ["Aggressive Growth"],
    decisionSignals: ["Thesis", "Risk / Reward"],
    exitLogic: ["Lose Trend", "Break Thesis"],
  },
  {
    id: "trend-rider",
    name: "Trend Rider",
    description: "Stay with the primary trend until it clearly breaks.",
    isDefault: true,
    enabled: true,
    timeframe: ["Long Term"],
    tags: ["Aggressive Growth"],
    decisionSignals: ["Thesis", "Volume"],
    exitLogic: ["Lose Trend", "Macro Changes"],
  },
  {
    id: "volume-confirmation",
    name: "Volume Confirmation",
    description: "Only trust moves that are backed by real participation.",
    isDefault: true,
    enabled: true,
    timeframe: ["Swing"],
    tags: ["Momentum"],
    decisionSignals: ["Volume"],
    exitLogic: ["Lose Trend"],
  },
  {
    id: "long-term-compounder",
    name: "Long-Term Compounder",
    description: "Hold durable businesses through volatility while the thesis compounds.",
    isDefault: true,
    enabled: true,
    timeframe: ["Long Term"],
    tags: ["Aggressive Growth"],
    decisionSignals: ["Thesis"],
    exitLogic: ["Break Thesis", "Macro Changes"],
  },
  {
    id: "ai-infrastructure",
    name: "AI Infrastructure",
    description: "Concentrate on the picks-and-shovels leaders of the AI build-out.",
    isDefault: true,
    enabled: true,
    timeframe: ["Long Term"],
    tags: ["AI Infrastructure", "Aggressive Growth"],
    decisionSignals: ["Thesis", "Catalyst"],
    exitLogic: ["Break Thesis", "Macro Changes"],
  },
  {
    id: "speculative-runner",
    name: "Speculative Runner",
    description: "Small, high-risk positions in narrative-driven names with defined risk.",
    isDefault: true,
    enabled: true,
    timeframe: ["Speculation"],
    tags: ["Momentum", "Turnaround"],
    decisionSignals: ["Catalyst", "Risk / Reward"],
    exitLogic: ["Hit Target", "Lose Trend"],
  },
  {
    id: "risk-off",
    name: "Risk-Off / Defensive",
    description: "Reduce exposure and protect capital when macro turns hostile.",
    isDefault: true,
    enabled: true,
    timeframe: ["Long Term"],
    tags: ["Turnaround"],
    decisionSignals: ["Risk / Reward"],
    exitLogic: ["Macro Changes", "Lose Trend"],
  },
  {
    id: "broken-thesis",
    name: "Broken Thesis / Exit Watch",
    description: "Flag positions where the original reason to own is no longer valid.",
    isDefault: true,
    enabled: true,
    timeframe: ["Swing", "Long Term"],
    tags: ["Turnaround"],
    decisionSignals: ["Thesis", "Risk / Reward"],
    exitLogic: ["Break Thesis"],
  },
];

export const DEFAULT_ASSIGNMENTS: StrategyAssignments = {
  NVDA: ["aggressive-growth", "trend-rider", "ai-infrastructure"],
  AMD: ["aggressive-growth", "momentum", "volume-confirmation"],
  SOFI: ["pullback-entry"],
  IONQ: ["speculative-runner", "momentum"],
  ACHR: ["risk-off"],
  BBAI: ["broken-thesis", "risk-off"],
};

export const MARKET_FLOW: MarketFlowStep[] = [
  {
    key: "market",
    label: "Market",
    detail: "Risk-On Tide",
    tone: "positive",
    summary:
      "Broad market conditions are leaning constructive after the latest rebound, with growth and small caps catching a bid while major indexes stabilized into the holiday pause. Risk appetite is improving, but the move still depends on rates, Fed tone, and geopolitical calm holding together.",
  },
  {
    key: "sector",
    label: "Sector",
    detail: "Breakout Wind",
    tone: "positive",
    summary:
      "Technology is carrying the strongest wind, but leadership is uneven. Semiconductors are breaking higher on AI infrastructure momentum, while software remains more selective as investors question which companies truly benefit from AI disruption.",
  },
  {
    key: "industry",
    label: "Industry",
    detail: "Rotation Current",
    tone: "positive",
    summary:
      "Capital is rotating toward AI infrastructure, semiconductors, data-center suppliers, and high-beta growth areas. The current is still favorable, but it is not broad enough to ignore risk: weaker software, energy, and defensive groups show traders are choosing winners carefully.",
  },
  {
    key: "stock",
    label: "Stock",
    detail: "Calm Waters",
    tone: "neutral",
    summary:
      "Individual names are entering a more selective zone. Strong setups can still work, but the easy tide has cooled. This is where discipline matters: check the thesis, position size, support levels, and whether the stock is moving with its group or drifting on its own.",
  },
];

// Placeholder portfolio/watchlist switcher options. A "portfolio" is a (future)
// live-connected brokerage account — tickers are driven by the connection, so no
// manual "Add ticker". A "watchlist" is user-curated, so it allows adding tickers.
// Static for now; CRUD + account connections come later.
export const PORTFOLIOS: { id: string; label: string; type: "portfolio" | "watchlist" }[] = [
  { id: "deric", label: "Deric\u2019s Webull Portfolio", type: "portfolio" },
  { id: "jeff", label: "Jeff\u2019s Webull Portfolio", type: "portfolio" },
  { id: "watchlist-one", label: "Watchlist One", type: "watchlist" },
];

export const TIMEFRAME_OPTIONS: Timeframe[] = ["Swing", "Long Term", "Speculation"];

export const TAG_OPTIONS: string[] = [
  "Aggressive Growth",
  "Momentum",
  "Turnaround",
  "AI Infrastructure",
];

export const DECISION_SIGNAL_OPTIONS: DecisionSignal[] = [
  "Thesis",
  "Volume",
  "Catalyst",
  "Risk / Reward",
];

export const EXIT_RULE_OPTIONS: ExitRule[] = [
  "Break Thesis",
  "Lose Trend",
  "Hit Target",
  "Macro Changes",
];

export const FUNDAMENTALS: EducationCard[] = [
  {
    title: "Big picture health",
    body: "A quick read on whether the business is getting stronger, steadier, or shakier.",
  },
  {
    title: "Revenue Growth",
    body: "Whether demand is expanding, slowing, or becoming less predictable.",
  },
  {
    title: "Profitability",
    body: "Whether the company turns growth into earnings or is still burning cash.",
  },
  {
    title: "Competitive Edge",
    body: "What protects the business and whether the moat is widening or eroding.",
  },
  {
    title: "Balance Sheet",
    body: "Cash, debt, and staying power if conditions get harder.",
  },
  {
    title: "Valuation",
    body: "Whether expectations already look priced in.",
  },
  {
    title: "Risk Factors",
    body: "What could break the thesis, from execution to macro pressure.",
  },
];

// Discipline is intentionally first and weighted highest; progress is last.
export const SCORES: ScoreMetric[] = [
  {
    key: "discipline",
    label: "Discipline",
    value: 82,
    max: 100,
    tagline: "Plan followed",
    trend: "positive",
    trendLabel: "+6 this week",
  },
  {
    key: "risk",
    label: "Risk",
    value: 74,
    max: 100,
    tagline: "Exposure checked",
    trend: "positive",
    trendLabel: "+3 this week",
  },
  {
    key: "research",
    label: "Research",
    value: 68,
    max: 100,
    tagline: "Thesis documented",
    trend: "neutral",
    trendLabel: "Holding steady",
  },
  {
    key: "review",
    label: "Review",
    value: 59,
    max: 100,
    tagline: "Lessons captured",
    trend: "warning",
    trendLabel: "2 reviews due",
  },
  {
    key: "progress",
    label: "Progress",
    value: 64,
    max: 100,
    tagline: "Portfolio tracked",
    trend: "neutral",
    trendLabel: "Tracking on plan",
  },
];

export const BADGES: Badge[] = [
  {
    id: "iron-hands",
    name: "Iron Hands",
    description: "Held through a drawdown without breaking your stated plan.",
    rarity: "rare",
    state: "earned",
  },
  {
    id: "no-fomo",
    name: "No-FOMO Streak",
    description: "Passed on 10 setups that didn't match your rules.",
    rarity: "uncommon",
    state: "earned",
  },
  {
    id: "rulekeeper",
    name: "Rulekeeper",
    description: "Logged an invalidation level before every entry this month.",
    rarity: "epic",
    state: "in-progress",
    progress: 70,
  },
  {
    id: "journal-streak",
    name: "Journal Streak",
    description: "Wrote a Captain's Log entry 14 days running.",
    rarity: "common",
    state: "in-progress",
    progress: 45,
  },
  {
    id: "risk-captain",
    name: "Risk Captain",
    description: "Kept every position within your risk rule for a full quarter.",
    rarity: "legendary",
    state: "locked",
  },
  {
    id: "storm-survivor",
    name: "Storm Survivor",
    description: "Followed your defensive plan through a Storm Watch market.",
    rarity: "rare",
    state: "locked",
  },
];

export const FOCUS_OPTIONS: string[] = [
  "AI Infrastructure",
  "Semiconductors",
  "Fintech",
  "Energy",
  "Biotech",
  "Defense",
];

export const STYLE_OPTIONS: TradingStyle[] = [
  "Long-Term Investor",
  "Swing Trader",
  "Day Trader",
  "Mixed",
];

export const RISK_OPTIONS: RiskProfile[] = [
  "Conservative",
  "Balanced",
  "Aggressive",
];

export const HORIZON_OPTIONS: TimeHorizon[] = ["Days", "Weeks", "Months", "Years"];

export const PRIVACY_OPTIONS: PrivacyMode[] = [
  "Private",
  "Ghost",
  "Crew",
  "Full Transparency",
];

export const PRIVACY_NOTES: Record<PrivacyMode, string> = {
  Private: "Only you can see your profile, holdings, and logs.",
  Ghost:
    "Crew sees your badges, discipline score, and general style — never dollar values, holdings, or size.",
  Crew: "Selected trades, notes, and stats are shared with crew you approve.",
  "Full Transparency": "Opt-in: your full activity is visible to your crew.",
};

export const DEFAULT_CAPTAIN: CaptainProfile = {
  handle: "Captain Vega",
  tagline: "Disciplined swing trader. Rules over emotion.",
  style: "Swing Trader",
  risk: "Balanced",
  horizon: "Weeks",
  focus: ["AI Infrastructure", "Semiconductors"],
  privacy: "Private",
  portfolioLink: "Manual",
};

export const SHIP_MEMBERSHIPS: ShipMembership[] = [
  {
    id: "iron-tide",
    name: "Iron Tide",
    role: "First Mate",
    members: 18,
    blurb: "Swing traders keeping each other honest on risk and reviews.",
  },
  {
    id: "long-haul",
    name: "Long Haul Compounders",
    role: "Crew",
    members: 42,
    blurb: "Buy-and-hold crew focused on thesis discipline over noise.",
  },
];

// Discipline-first ordering: plan adherence and risk discipline lead, raw return
// is intentionally last and de-emphasized.
export const PORTFOLIO_METRICS: PortfolioMetric[] = [
  {
    key: "plan-adherence",
    label: "Plan Adherence",
    value: "86%",
    tagline: "Entries that matched a written rule",
    tone: "positive",
    emphasis: true,
  },
  {
    key: "rules-followed",
    label: "Rules Followed",
    value: "12 / 14",
    tagline: "Exits taken at your stated level",
    tone: "positive",
  },
  {
    key: "risk-budget",
    label: "Risk Budget Used",
    value: "61%",
    tagline: "Within your stated risk profile",
    tone: "neutral",
  },
  {
    key: "open-risk",
    label: "Open Risk",
    value: "1.8R",
    tagline: "Total risk across open positions",
    tone: "warning",
  },
  {
    key: "return",
    label: "Return (period)",
    value: "+4.2%",
    tagline: "A by-product of discipline, not the goal",
    tone: "neutral",
  },
];

export const POSITIONS: Position[] = [
  {
    ticker: "NVDA",
    name: "Nvidia",
    weightPct: 22,
    changePct: 2.31,
    planLabel: "Aligned",
    note: "Core position. Trailing your stated invalidation level.",
  },
  {
    ticker: "AMD",
    name: "Advanced Micro Devices",
    weightPct: 14,
    changePct: 1.12,
    planLabel: "Watch",
    note: "Breakout setup; trigger not yet confirmed.",
  },
  {
    ticker: "SOFI",
    name: "SoFi Technologies",
    weightPct: 9,
    changePct: -0.94,
    planLabel: "Review",
    note: "Momentum cooled into resistance. Thesis check due.",
  },
  {
    ticker: "ACHR",
    name: "Archer Aviation",
    weightPct: 6,
    changePct: -2.15,
    planLabel: "Risk Check",
    note: "Speculative size. Confirm it's within your risk rule.",
  },
];

export const ALLOCATIONS: Allocation[] = [
  { label: "AI Infrastructure", pct: 42, tone: "positive" },
  { label: "Fintech", pct: 18, tone: "neutral" },
  { label: "Speculative", pct: 12, tone: "warning" },
  { label: "Cash", pct: 28, tone: "neutral" },
];

export const RISK_RULES: RiskRule[] = [
  {
    label: "Max single position",
    detail: "NVDA at 22% — within your 25% cap.",
    status: "positive",
  },
  {
    label: "Speculative sleeve",
    detail: "12% vs your 15% ceiling.",
    status: "positive",
  },
  {
    label: "Cash floor",
    detail: "28% cash, above your 20% floor.",
    status: "positive",
  },
  {
    label: "Open positions without a logged exit",
    detail: "1 position is missing an invalidation level.",
    status: "warning",
  },
];

// Ships available to discover/join (mock).
export const DISCOVER_SHIPS: Ship[] = [
  {
    id: "deep-current",
    name: "Deep Current",
    blurb: "Patient compounders who pressure-test each other's theses.",
    members: 34,
    privacy: "Invite Only",
    focus: "Long-term investing",
  },
  {
    id: "night-watch",
    name: "Night Watch",
    blurb: "Swing traders comparing risk discipline, not P/L.",
    members: 21,
    privacy: "Open",
    focus: "Swing trading",
  },
  {
    id: "salvage-crew",
    name: "Salvage Crew",
    blurb: "Turnaround hunters keeping each other honest on invalidation.",
    members: 12,
    privacy: "Open",
    focus: "Turnarounds",
  },
];

export const SHIP_MEMBERS: ShipMember[] = [
  {
    id: "vega",
    name: "Captain Vega",
    role: "First Mate",
    disciplineScore: 82,
    streakDays: 14,
  },
  {
    id: "mara",
    name: "Mara Holt",
    role: "Captain",
    disciplineScore: 91,
    streakDays: 38,
  },
  {
    id: "tibor",
    name: "Tibor K.",
    role: "Crew",
    disciplineScore: 76,
    streakDays: 9,
  },
  {
    id: "anya",
    name: "Anya R.",
    role: "Crew",
    disciplineScore: 68,
    streakDays: 21,
  },
];

// Discipline-based categories ONLY — never profit ranking.
export const SHIP_LEADERBOARD: ShipLeaderboardRow[] = [
  {
    id: "rules",
    category: "Most rules followed",
    leader: "Mara Holt",
    detail: "27 of 28 exits taken at plan",
  },
  {
    id: "reviews",
    category: "Best review cadence",
    leader: "Anya R.",
    detail: "21-day review streak",
  },
  {
    id: "risk",
    category: "Steadiest risk",
    leader: "Captain Vega",
    detail: "0 risk-rule breaks this month",
  },
  {
    id: "research",
    category: "Most thesis logged",
    leader: "Tibor K.",
    detail: "Logged a thesis on every entry",
  },
];

export const WEEKLY_REVIEW: WeeklyReviewItem[] = [
  {
    id: "wr-1",
    prompt: "Which trade best followed your plan this week, and why?",
    status: "Submitted",
  },
  {
    id: "wr-2",
    prompt: "Where did emotion almost override a rule?",
    status: "Open",
  },
  {
    id: "wr-3",
    prompt: "One habit to tighten before next week.",
    status: "Open",
  },
];

export const SHARED_LOGS: SharedLog[] = [
  {
    id: "sl-1",
    author: "Mara Holt",
    ship: "Iron Tide",
    note: "Passed on a hot breakout — it didn't match my volume rule. No regrets.",
    timestamp: "Mon · 09:12",
  },
  {
    id: "sl-2",
    author: "Anya R.",
    ship: "Iron Tide",
    note: "Trimmed into strength at my planned level instead of getting greedy.",
    timestamp: "Tue · 14:40",
  },
];

export const SHIP_BADGES: Badge[] = [
  {
    id: "crew-rulekeepers",
    name: "Crew Rulekeepers",
    description: "Every member logged an invalidation before entry this week.",
    rarity: "epic",
    state: "earned",
  },
  {
    id: "review-quorum",
    name: "Review Quorum",
    description: "80% of the crew completed the Weekly Review.",
    rarity: "rare",
    state: "in-progress",
    progress: 60,
  },
  {
    id: "storm-crew",
    name: "Storm Crew",
    description: "Crew held discipline through a Storm Watch market.",
    rarity: "legendary",
    state: "locked",
  },
];

export const TECHNICAL_SIGNALS: EducationCard[] = [
  {
    title: "RSI",
    body: "Measures momentum and whether a stock may be stretched, cooling, or gaining strength.",
  },
  {
    title: "VWAP",
    body: "The average price weighted by volume. Traders use it to judge intraday strength or weakness.",
  },
  {
    title: "Moving Averages",
    body: "Help identify trend direction, support, resistance, and potential momentum shifts.",
  },
  {
    title: "Volume",
    body: "Shows participation. Moves on stronger volume can carry more weight than thin moves.",
  },
];
