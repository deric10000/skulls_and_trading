import type {
  DecisionSignal,
  EducationCard,
  ExitRule,
  LogEntry,
  MarketFlowStep,
  Strategy,
  StrategyAssignments,
  TickerAnalysis,
  Timeframe,
  WatchlistItem,
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
  { key: "market", label: "Market", detail: "Risk-On Tide", tone: "positive" },
  {
    key: "sector",
    label: "Sector",
    detail: "Breakout Wind",
    tone: "positive",
  },
  {
    key: "industry",
    label: "Industry",
    detail: "Rotation Current",
    tone: "positive",
  },
  {
    key: "stock",
    label: "Stock",
    detail: "Calm Waters",
    tone: "neutral",
  },
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
