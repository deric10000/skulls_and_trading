import type {
  LogEntry,
  TickerAnalysis,
  WatchlistItem,
} from "./types";

export const INITIAL_WATCHLIST: WatchlistItem[] = [
  {
    ticker: "NVDA",
    name: "Nvidia · AI Infrastructure",
    price: 187.42,
    changePct: 2.31,
    status: "Bullish",
    conviction: 88,
  },
  {
    ticker: "AMD",
    name: "Advanced Micro Devices · Compute",
    price: 164.05,
    changePct: 1.12,
    status: "Breakout",
    conviction: 74,
  },
  {
    ticker: "SOFI",
    name: "SoFi Technologies · Fintech",
    price: 14.86,
    changePct: -0.94,
    status: "Caution",
    conviction: 52,
  },
  {
    ticker: "IONQ",
    name: "IonQ · Quantum Computing",
    price: 41.73,
    changePct: 4.68,
    status: "Watching",
    conviction: 61,
  },
  {
    ticker: "ACHR",
    name: "Archer Aviation · eVTOL",
    price: 9.21,
    changePct: -2.15,
    status: "Pullback",
    conviction: 44,
  },
  {
    ticker: "BBAI",
    name: "BigBear.ai · Defense AI",
    price: 6.34,
    changePct: 3.07,
    status: "Watching",
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

export const LOG_ENTRIES: Record<string, LogEntry> = {
  NVDA: {
    whyWatching:
      "Leadership name in the AI cycle and a tell for broad risk appetite.",
    whatChanged: "Reclaimed the prior breakout shelf with expanding volume.",
    invalidation: "A close back below the breakout level on heavy selling.",
    nextAction: "Hold core; add only on a controlled pullback to the 20 EMA.",
    timestamp: "Today · 09:42",
  },
  AMD: {
    whyWatching: "Second-source AI compute with a fresh base breakout.",
    whatChanged: "Cleared multi-week resistance intraday.",
    invalidation: "Loss of the breakout level back into the prior base.",
    nextAction: "Starter position; size up if volume confirms over coming sessions.",
    timestamp: "Today · 10:15",
  },
  SOFI: {
    whyWatching: "Profitability inflection in a growing digital bank.",
    whatChanged: "Momentum cooled into resistance; no clean trigger yet.",
    invalidation: "A breakdown below the recent range support.",
    nextAction: "Wait for a decisive reclaim of resistance before acting.",
    timestamp: "Today · 11:03",
  },
  IONQ: {
    whyWatching: "Long-duration quantum optionality with high volatility.",
    whatChanged: "Speculative momentum picked back up.",
    invalidation: "Failure to hold the most recent higher-low.",
    nextAction: "Keep size small; let the position prove itself.",
    timestamp: "Today · 11:48",
  },
  ACHR: {
    whyWatching: "Certification-stage eVTOL with binary upside.",
    whatChanged: "Pulled back into support after a failed push higher.",
    invalidation: "A daily close below the support zone.",
    nextAction: "Stand aside until support holds with buyers returning.",
    timestamp: "Today · 12:20",
  },
  BBAI: {
    whyWatching: "Defense-AI contract optionality.",
    whatChanged: "Trying to base after a volatile stretch.",
    invalidation: "New lows on contract disappointment.",
    nextAction: "Watch only; revisit on a confirmed base and catalyst.",
    timestamp: "Today · 13:05",
  },
};
