import type {
  Allocation,
  Badge,
  Bucket,
  CaptainProfile,
  CategoryWeights,
  DecisionSignal,
  EducationCard,
  ExitRule,
  FundamentalSnapshot,
  LogEntry,
  MarketContext,
  MarketFlowStep,
  PortfolioMetric,
  Position,
  PrivacyMode,
  RiskProfile,
  RiskRule,
  RuleChip,
  ScoreMetric,
  SharedLog,
  Ship,
  ShipLeaderboardRow,
  ShipMember,
  ShipMembership,
  Portfolio,
  Strategy,
  StrategyAssignments,
  TechnicalSnapshot,
  TickerAnalysis,
  TickerInfo,
  TimeHorizon,
  Timeframe,
  TradingStyle,
  WatchlistItem,
  WeeklyReviewItem,
} from "./types";

// ---------------------------------------------------------------------------
// Ticker & portfolio mock data — SINGLE SOURCE OF TRUTH.
//
// Edit a name's company-level facts in TICKERS (company/category/price/analysis/
// logs) and its holding-level facts in a portfolio's `holdings` (shares/DCA/P&L/
// conviction/alignment). Everything downstream — the Current Watch widget, the
// dashboard Stock Summary, Captain's Log, the Strategy Check signal, and the
// Treasure Ledger — is DERIVED from the two structures below, so one edit
// updates every surface that shows the ticker. Static mock only: no APIs,
// brokerage sync, or live market data.
// ---------------------------------------------------------------------------

export const TICKERS: Record<string, TickerInfo> = {
  ACHR: {
    company: "Archer Aviation",
    category: "eVTOL / Aviation",
    sector: "Industrials",
    industry: "Aerospace & eVTOL",
    lastPrice: 4.79,
    analysis: {
      setupSummary:
        "Pulled back below recent highs; the trend is fragile while the market waits on certification progress.",
      thesis:
        "An eVTOL contender racing toward FAA certification and early commercial air-taxi routes — a bet on a new category of urban air mobility.",
      risk: "Pre-revenue with certification timing and cash burn as existential variables. High beta and headline-driven.",
      catalyst: "FAA certification milestones and order/route conversions.",
      signals: [
        { label: "Pullback", tone: "negative" },
        { label: "Pre-revenue", tone: "negative" },
        { label: "High beta", tone: "neutral" },
      ],
      investorView:
        "A long-duration bet on a category that does not exist at scale yet. The reward is large, but so is the execution and funding risk.",
      traderView:
        "Respect the pullback. Constructive only if support holds and buyers return on volume; size for the volatility.",
    },
    logs: [
      {
        id: "achr-1",
        title: "Why I'm holding",
        note: "High-beta growth sleeve. Open P&L is red and it sits outside the core AI/quantum thesis — keep size small and review against the plan.",
        strategy: "Speculative Runner",
        timestamp: "Today · 12:20",
      },
    ],
  },
  CELH: {
    company: "Celsius Holdings",
    category: "Consumer / Energy Drinks",
    sector: "Consumer Staples",
    industry: "Beverages",
    lastPrice: 28.37,
    analysis: {
      setupSummary:
        "Stabilizing after a volatile stretch; trying to build a base as growth expectations reset.",
      thesis:
        "A fast-growth energy-drink brand taking shelf share, with distribution gains and international expansion as the growth engine.",
      risk: "Consumer-discretionary cyclicality and decelerating growth could compress the multiple.",
      catalyst: "Quarterly sell-through data and distribution expansion.",
      signals: [
        { label: "Basing", tone: "neutral" },
        { label: "Positive P&L", tone: "positive" },
        { label: "Off-thesis", tone: "neutral" },
      ],
      investorView:
        "A consumer growth story riding a brand and distribution flywheel. Durability of growth is the key question.",
      traderView:
        "No edge until it clears resistance with volume; mid-base is a wait.",
    },
    logs: [
      {
        id: "celh-1",
        title: "Off-core but green",
        note: "Consumer name outside the AI/high-beta core. Open P&L is positive — let it work, but don't add beyond plan.",
        strategy: "Breakout Watch",
        timestamp: "Today · 10:48",
      },
    ],
  },
  CRM: {
    company: "Salesforce",
    category: "Software / AI CRM",
    sector: "Technology",
    industry: "Software / Cloud",
    lastPrice: 150.19,
    analysis: {
      setupSummary:
        "In a downtrend with a large open loss; the original reason to own needs a fresh look.",
      thesis:
        "Enterprise-software leader layering AI agents onto the CRM suite to defend and expand seat economics.",
      risk: "The large open loss signals the entry thesis may be broken. Seat growth and AI monetization are still-unproven catalysts.",
      catalyst: "AI product adoption metrics and guidance on seat/usage growth.",
      signals: [
        { label: "Downtrend", tone: "negative" },
        { label: "Large open loss", tone: "negative" },
        { label: "Thesis at risk", tone: "negative" },
      ],
      investorView:
        "A durable franchise, but the position is deep in the red. The question is whether the original reason to own still holds.",
      traderView:
        "No trend support. Decide whether this is a thesis break or a hold-and-review before doing anything.",
    },
    logs: [
      {
        id: "crm-1",
        title: "Thesis under review",
        note: "Down ~27% from cost. Software/AI fit is only partial, and the loss is large enough to re-check the original thesis against the plan.",
        strategy: "Broken Thesis / Exit Watch",
        timestamp: "Today · 09:31",
      },
    ],
  },
  CRWV: {
    company: "CoreWeave",
    category: "AI Infrastructure",
    sector: "Technology",
    industry: "AI Infrastructure / Cloud",
    lastPrice: 99.0,
    analysis: {
      setupSummary:
        "Volatile post-IPO name pulling back; strong narrative but the trend is unsettled.",
      thesis:
        "A pure-play AI cloud provider renting GPU capacity into a supply-constrained market.",
      risk: "Customer concentration, capital intensity, and post-IPO volatility. Open P&L is red.",
      catalyst: "Capacity expansion and new hyperscaler/enterprise contracts.",
      signals: [
        { label: "AI infra fit", tone: "positive" },
        { label: "Negative P&L", tone: "negative" },
        { label: "High volatility", tone: "neutral" },
      ],
      investorView:
        "A leveraged way to play AI compute demand. The thesis fits the strategy; the entry is currently underwater.",
      traderView:
        "Treat the pullback with respect; it needs to base and reclaim trend before it earns adds.",
    },
    logs: [
      {
        id: "crwv-1",
        title: "Core fit, red entry",
        note: "AI infrastructure is core to the strategy, but open P&L is negative — review the entry and support before adding.",
        strategy: "AI Infrastructure",
        timestamp: "Today · 11:12",
      },
    ],
  },
  ELF: {
    company: "e.l.f. Beauty",
    category: "Consumer / Beauty",
    sector: "Consumer Discretionary",
    industry: "Beauty / Personal Care",
    lastPrice: 67.16,
    analysis: {
      setupSummary:
        "Holding up well with a healthy open gain; constructive, but outside the core thesis.",
      thesis:
        "A share-gaining mass-beauty brand with a fast product engine and strong e-commerce and social presence.",
      risk: "Consumer-discretionary exposure and growth deceleration; valuation is sensitive to any guide-down.",
      catalyst: "Sell-through trends, new category expansion, and retail shelf gains.",
      signals: [
        { label: "Positive P&L", tone: "positive" },
        { label: "Trend intact", tone: "positive" },
        { label: "Off-core", tone: "neutral" },
      ],
      investorView:
        "A well-run consumer compounder. Strong, but not what the AI / high-beta strategy is built around.",
      traderView:
        "Constructive while the uptrend holds; let the winner run within plan, no chasing.",
    },
    logs: [
      {
        id: "elf-1",
        title: "Green but off-core",
        note: "Beauty/consumer name with a solid open gain. Outside the AI/high-beta focus — keep it as a watch and respect position size.",
        strategy: "Pullback Entry",
        timestamp: "Today · 13:05",
      },
    ],
  },
  IONQ: {
    company: "IonQ",
    category: "Quantum Computing",
    sector: "Technology",
    industry: "Quantum Computing",
    lastPrice: 50.56,
    analysis: {
      setupSummary:
        "Pressing higher on speculative momentum; quantum exposure fits the high-beta growth tilt.",
      thesis:
        "A pure-play bet on commercial quantum computing reaching useful scale.",
      risk: "Pre-commercial economics; the story trades on narrative and roadmap, not earnings. High beta.",
      catalyst: "Hardware roadmap milestones and enterprise pilots.",
      signals: [
        { label: "Momentum", tone: "positive" },
        { label: "Speculative", tone: "negative" },
        { label: "High beta", tone: "neutral" },
      ],
      investorView:
        "A long-duration moonshot sized for the strategy's speculative sleeve. Position sizing matters more than entry.",
      traderView:
        "Tradeable volatility for those who respect risk. Define invalidation before entry and keep size small.",
    },
    logs: [
      {
        id: "ionq-1",
        title: "Quantum sleeve working",
        note: "Fits the high-beta / quantum tilt and open P&L is green. Watch daily volatility; keep it sized as speculation.",
        strategy: "Speculative Runner",
        timestamp: "Today · 11:48",
      },
    ],
  },
  MSFT: {
    company: "Microsoft",
    category: "Mega-Cap AI / Cloud",
    sector: "Technology",
    industry: "Software / Cloud",
    lastPrice: 352.83,
    analysis: {
      setupSummary:
        "Consolidating with a modest open loss; a lower-beta anchor relative to the rest of the book.",
      thesis:
        "A mega-cap compounder monetizing AI across cloud, productivity, and developer tools.",
      risk: "Lower beta than the strategy targets; AI capex and cloud growth are watched closely. Open P&L is slightly red.",
      catalyst: "Azure growth, Copilot adoption, and capex commentary.",
      signals: [
        { label: "AI/cloud fit", tone: "positive" },
        { label: "Mega-cap anchor", tone: "neutral" },
        { label: "Negative P&L", tone: "negative" },
      ],
      investorView:
        "The steadiest name in the book — a quality AI/cloud compounder that lowers overall volatility.",
      traderView:
        "Range-bound; no urgency. A break back above the range re-engages the trend.",
    },
    logs: [
      {
        id: "msft-1",
        title: "Lower-beta anchor",
        note: "Strong AI/cloud name, but lower-beta than the strategy targets and open P&L is red. Hold as ballast and watch the range.",
        strategy: "Long-Term Compounder",
        timestamp: "Today · 09:58",
      },
    ],
  },
  NVDA: {
    company: "Nvidia",
    category: "AI Infrastructure",
    sector: "Technology",
    industry: "Semiconductors",
    lastPrice: 195.74,
    analysis: {
      setupSummary:
        "Trending above all key moving averages with volume confirming each push higher.",
      thesis:
        "Sits at the center of the AI build-out cycle. Data-center demand keeps pricing power high while software widens the moat.",
      risk: "Expectations are rich. A single soft data-center guide could trigger a fast multiple reset.",
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
    logs: [
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
        strategy: "Aggressive AI / High-Beta Growth",
        timestamp: "Today · 09:44",
      },
    ],
  },
  RGTI: {
    company: "Rigetti Computing",
    category: "Quantum Computing",
    sector: "Technology",
    industry: "Quantum Computing",
    lastPrice: 18.41,
    analysis: {
      setupSummary:
        "High-volatility quantum name under pressure; the open loss and sharp swings warrant a risk check.",
      thesis:
        "An early quantum hardware and cloud player betting on superconducting-qubit scaling.",
      risk: "Pre-commercial, dilution-prone, and highly volatile. Open P&L is red and drawdowns are sharp.",
      catalyst: "Roadmap milestones, qubit/fidelity progress, and partnerships.",
      signals: [
        { label: "Quantum fit", tone: "positive" },
        { label: "Negative P&L", tone: "negative" },
        { label: "High volatility", tone: "negative" },
      ],
      investorView:
        "A speculative quantum lottery ticket. It fits the tilt, but the risk profile demands tight sizing.",
      traderView:
        "Volatile and headline-driven; only constructive with strict risk control and a defined invalidation.",
    },
    logs: [
      {
        id: "rgti-1",
        title: "Risk check",
        note: "Quantum exposure fits, but open P&L is red and volatility is high — confirm it's within the risk rule and sized for speculation.",
        strategy: "Speculative Runner",
        timestamp: "Today · 12:41",
      },
    ],
  },
  SOFI: {
    company: "SoFi Technologies",
    category: "Fintech",
    sector: "Financials",
    industry: "Fintech",
    lastPrice: 17.31,
    analysis: {
      setupSummary:
        "Trending constructively as the profitability story plays out; fintech growth fits the strategy.",
      thesis:
        "A digital-first bank compounding members and cross-selling products, with a profitability inflection underway.",
      risk: "Rate sensitivity and credit normalization could pressure results; watch daily weakness.",
      catalyst: "Member growth and net-interest-margin trajectory.",
      signals: [
        { label: "Uptrend", tone: "positive" },
        { label: "Positive P&L", tone: "positive" },
        { label: "Watch daily", tone: "neutral" },
      ],
      investorView:
        "A growth-stage fintech turning member growth into durable earnings. Credit quality is the thing to watch alongside growth.",
      traderView:
        "Constructive while it holds trend; manage adds around support and resistance.",
    },
    logs: [
      {
        id: "sofi-1",
        title: "Fintech growth fit",
        note: "Largest position and green. Fits the fintech-growth sleeve — watch daily weakness and keep it within the position cap.",
        strategy: "Pullback Entry",
        timestamp: "Today · 11:03",
      },
    ],
  },
};

function tickerName(ticker: string): string {
  const info = TICKERS[ticker];
  return info ? `${info.company} · ${info.category}` : ticker;
}

// Portfolios / watchlists. A portfolio is a (future) live-connected brokerage
// account; a watchlist is user-curated. Only Deric's portfolio is fully populated
// for now — Jeff's portfolio and Watchlist One are placeholders for future
// account connections and CRUD, and will carry their own strategies and holdings.
export const PORTFOLIOS: Portfolio[] = [
  {
    id: "deric",
    label: "Deric\u2019s Webull Portfolio",
    type: "portfolio",
    strategyId: "aggressive-ai-high-beta",
    // Display order: strongest strategy alignment first.
    holdings: [
      {
        ticker: "NVDA",
        shares: 3,
        avgPrice: 184.33,
        openPnlPct: 6.19,
        conviction: 88,
        status: "High Alignment",
        reason:
          "AI infrastructure leader, positive open P&L, and a strong fit with the strategy.",
        strategyIds: ["aggressive-ai-high-beta", "ai-infrastructure", "trend-rider"],
      },
      {
        ticker: "IONQ",
        shares: 2,
        avgPrice: 56.36,
        openPnlPct: -10.29,
        conviction: 71,
        status: "Aligned",
        reason:
          "Quantum exposure fits the high-beta growth strategy and open P&L is positive.",
        strategyIds: ["aggressive-ai-high-beta", "speculative-runner"],
      },
      {
        ticker: "SOFI",
        shares: 67,
        avgPrice: 16.18,
        openPnlPct: 6.98,
        conviction: 70,
        status: "Aligned",
        reason:
          "Fintech-growth exposure fits the strategy, but daily weakness should be watched.",
        strategyIds: ["aggressive-ai-high-beta", "pullback-entry"],
      },
      {
        ticker: "MSFT",
        shares: 1,
        avgPrice: 393.17,
        openPnlPct: -10.26,
        conviction: 62,
        status: "Watch",
        reason:
          "Strong AI/cloud name, but lower-beta mega-cap and open P&L is currently negative.",
        strategyIds: ["ai-infrastructure", "long-term-compounder"],
      },
      {
        ticker: "ELF",
        shares: 14,
        avgPrice: 55.05,
        openPnlPct: 22.0,
        conviction: 60,
        status: "Watch",
        reason:
          "Positive P&L, but consumer/beauty is less aligned with the AI / high-beta strategy.",
        strategyIds: ["pullback-entry"],
      },
      {
        ticker: "CELH",
        shares: 14,
        avgPrice: 28.2,
        openPnlPct: 0.6,
        conviction: 56,
        status: "Watch",
        reason: "Positive P&L, but consumer exposure is outside the core strategy.",
        strategyIds: ["breakout-watch"],
      },
      {
        ticker: "CRWV",
        shares: 2,
        avgPrice: 115.5,
        openPnlPct: -14.29,
        conviction: 54,
        status: "Review",
        reason:
          "AI infrastructure fit is strong, but open P&L is negative and weakness needs review.",
        strategyIds: ["aggressive-ai-high-beta", "ai-infrastructure"],
      },
      {
        ticker: "ACHR",
        shares: 75,
        avgPrice: 5.59,
        openPnlPct: -14.31,
        conviction: 46,
        status: "Review",
        reason:
          "High-beta growth exposure, but not core AI/quantum/fintech and open P&L is negative.",
        strategyIds: ["speculative-runner", "risk-off"],
      },
      {
        ticker: "RGTI",
        shares: 3,
        avgPrice: 25.75,
        openPnlPct: -28.5,
        conviction: 42,
        status: "Risk Check",
        reason:
          "Quantum fits the strategy, but open P&L is negative and volatility is high.",
        strategyIds: ["speculative-runner", "risk-off"],
      },
      {
        ticker: "CRM",
        shares: 2,
        avgPrice: 204.67,
        openPnlPct: -26.62,
        conviction: 48,
        status: "Thesis Check",
        reason:
          "Software/AI CRM exposure may fit partially, but the large open loss means the thesis should be reviewed.",
        strategyIds: ["broken-thesis", "long-term-compounder"],
      },
    ],
  },
  {
    id: "jeff",
    label: "Jeff\u2019s Webull Portfolio",
    type: "portfolio",
    strategyId: "long-term-compounder",
    holdings: [
      {
        ticker: "MSFT",
        shares: 12,
        avgPrice: 360.0,
        openPnlPct: -1.99,
        conviction: 84,
        status: "High Alignment",
        reason:
          "Durable AI/cloud compounder held for the long term — squarely on strategy.",
        strategyIds: ["long-term-compounder", "ai-infrastructure"],
      },
      {
        ticker: "NVDA",
        shares: 5,
        avgPrice: 150.2,
        openPnlPct: 30.32,
        conviction: 80,
        status: "Aligned",
        reason:
          "Long-held AI leader with strong open P&L; trend still supports the thesis.",
        strategyIds: ["long-term-compounder", "trend-rider"],
      },
      {
        ticker: "CRM",
        shares: 8,
        avgPrice: 230.0,
        openPnlPct: -34.7,
        conviction: 64,
        status: "Watch",
        reason:
          "Quality software compounder, but open P&L is negative and momentum is soft.",
        strategyIds: ["long-term-compounder"],
      },
      {
        ticker: "SOFI",
        shares: 120,
        avgPrice: 14.5,
        openPnlPct: 19.38,
        conviction: 58,
        status: "Watch",
        reason:
          "Profitable position, but higher-beta fintech runs hotter than a compounder book.",
        strategyIds: ["pullback-entry"],
      },
      {
        ticker: "CELH",
        shares: 30,
        avgPrice: 32.1,
        openPnlPct: -11.62,
        conviction: 44,
        status: "Review",
        reason:
          "Consumer growth name with a negative open P&L — review whether it still fits.",
        strategyIds: ["breakout-watch"],
      },
    ],
  },
  {
    id: "watchlist-one",
    label: "Watchlist One",
    type: "watchlist",
    // User-curated watch-only list (no shares held yet — stalking entries).
    holdings: [
      {
        ticker: "RGTI",
        shares: 0,
        avgPrice: 0,
        openPnlPct: 0,
        conviction: 52,
        status: "Watch",
        reason: "Stalking a quantum breakout — waiting for volume to confirm a base.",
        strategyIds: ["breakout-watch", "speculative-runner"],
      },
      {
        ticker: "IONQ",
        shares: 0,
        avgPrice: 0,
        openPnlPct: 0,
        conviction: 49,
        status: "Watch",
        reason: "On watch for a pullback into support before starting a position.",
        strategyIds: ["pullback-entry"],
      },
      {
        ticker: "ACHR",
        shares: 0,
        avgPrice: 0,
        openPnlPct: 0,
        conviction: 38,
        status: "Thesis Check",
        reason: "Speculative idea — thesis not yet written; needs a catalyst to act on.",
        strategyIds: ["speculative-runner"],
      },
      {
        ticker: "ELF",
        shares: 0,
        avgPrice: 0,
        openPnlPct: 0,
        conviction: 45,
        status: "Watch",
        reason: "Watching for a base to form after the recent pullback.",
        strategyIds: ["breakout-watch"],
      },
    ],
  },
];

// The default (selected) portfolio seeds the app's initial state.
const DEFAULT_PORTFOLIO = PORTFOLIOS[0];

// Maps a portfolio/watchlist's holdings into the WatchlistItem shape the
// Current Watch widget renders. Used both to seed app state and to switch the
// displayed list when the user picks a different source in the widget.
export function watchlistFromHoldings(
  holdings: Portfolio["holdings"],
): WatchlistItem[] {
  return holdings.map((holding) => ({
    ticker: holding.ticker,
    name: tickerName(holding.ticker),
    price: TICKERS[holding.ticker]?.lastPrice ?? 0,
    changePct: holding.openPnlPct,
    status: holding.status,
    conviction: holding.conviction,
    shares: holding.shares,
    avgPrice: holding.avgPrice,
    reason: holding.reason,
  }));
}

export const INITIAL_WATCHLIST: WatchlistItem[] = watchlistFromHoldings(
  DEFAULT_PORTFOLIO.holdings,
);

// Per-ticker analysis and Captain's Log are derived straight from the TICKERS
// registry above so every surface reads the same source of truth.
export const TICKER_ANALYSIS: Record<string, TickerAnalysis> = Object.fromEntries(
  Object.entries(TICKERS).map(([ticker, info]) => [ticker, info.analysis]),
);

export const LOG_ENTRIES: Record<string, LogEntry[]> = Object.fromEntries(
  Object.entries(TICKERS).map(([ticker, info]) => [ticker, info.logs]),
);

export const DEFAULT_STRATEGIES: Strategy[] = [
  {
    id: "aggressive-ai-high-beta",
    name: "Aggressive AI / High-Beta Growth",
    description:
      "Concentrate in AI infrastructure, semiconductors, quantum, fintech growth, and high-beta leaders. Favor catalyst-driven setups with thesis alignment, position discipline, and constant risk awareness.",
    isDefault: true,
    enabled: true,
    timeframe: ["Swing", "Long Term", "Speculation"],
    tags: ["AI Infrastructure", "Aggressive Growth", "Momentum"],
    decisionSignals: ["Thesis", "Catalyst", "Risk / Reward"],
    exitLogic: ["Break Thesis", "Lose Trend", "Macro Changes"],
    rules: [
      { id: "aih-t1", label: "Sales growing", category: "thesis", metric: "revenueGrowthPct", operator: ">=", value: 15, weight: 3, enabled: true },
      { id: "aih-t2", label: "Healthy gross margin", category: "thesis", metric: "grossMarginPct", operator: ">=", value: 50, weight: 2, enabled: true },
      { id: "aih-t3", label: "Profitable", category: "thesis", metric: "netMarginPct", operator: ">=", value: 10, weight: 2, enabled: true },
      { id: "aih-s1", label: "Above mid-term trend", category: "setup", metric: "priceVs20EmaPct", operator: ">=", value: 0, weight: 2, enabled: true },
      { id: "aih-s2", label: "Momentum healthy", category: "setup", metric: "weeklyRsi", operator: "between", value: [45, 72], weight: 2, enabled: true },
      { id: "aih-r1", label: "Not overbought", category: "risk", metric: "weeklyRsi", operator: "<=", value: 80, weight: 2, enabled: true },
      { id: "aih-r2", label: "Calm-ish market", category: "risk", metric: "vix", operator: "<=", value: 25, weight: 1, enabled: true },
      { id: "aih-r3", label: "Manageable leverage", category: "risk", metric: "debtToEquity", operator: "<=", value: 2, weight: 2, enabled: true },
      { id: "aih-p1", label: "Within position cap", category: "position", metric: "weightPct", operator: "<=", value: 30, weight: 2, enabled: true },
      { id: "aih-tr1", label: "P&L not breaking down", category: "trade", metric: "openPnlPct", operator: ">=", value: -15, weight: 2, enabled: true },
    ],
    thesis: { groups: [["aih-t1", "aih-t3"], ["aih-t1", "aih-t2"]] },
    checkInterval: "1D",
    technicalsInterval: "1D",
  },
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
    rules: [
      { id: "mo-s1", label: "Above short trend (10 EMA)", category: "setup", metric: "priceVs10EmaPct", operator: ">=", value: 0, weight: 3, enabled: true },
      { id: "mo-s2", label: "Strong momentum (RSI \u2265 55)", category: "setup", metric: "weeklyRsi", operator: ">=", value: 55, weight: 2, enabled: true },
      { id: "mo-s3", label: "Above VWAP", category: "setup", metric: "priceVsVwapPct", operator: ">=", value: 0, weight: 2, enabled: true },
      { id: "mo-r1", label: "Not parabolic (RSI \u2264 80)", category: "risk", metric: "weeklyRsi", operator: "<=", value: 80, weight: 2, enabled: true },
      { id: "mo-r2", label: "Market not in panic", category: "risk", metric: "vix", operator: "<=", value: 28, weight: 1, enabled: true },
      { id: "mo-tr1", label: "Cut losers fast (P&L \u2265 -8)", category: "trade", metric: "openPnlPct", operator: ">=", value: -8, weight: 3, enabled: true },
      { id: "mo-t1", label: "Has a growth story", category: "thesis", metric: "revenueGrowthPct", operator: ">=", value: 10, weight: 1, enabled: true },
      { id: "mo-p1", label: "Small momentum slice", category: "position", metric: "weightPct", operator: "<=", value: 15, weight: 2, enabled: true },
    ],
    thesis: { groups: [["mo-t1"]] },
    categoryWeights: { thesis: 10, timeframe: 5, position: 10, setup: 35, risk: 25, trade: 15 },
    checkInterval: "15m",
    technicalsInterval: "15m",
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
    rules: [
      { id: "pb-t1", label: "Sales growing", category: "thesis", metric: "revenueGrowthPct", operator: ">=", value: 15, weight: 3, enabled: true },
      { id: "pb-t2", label: "Profitable", category: "thesis", metric: "netMarginPct", operator: ">=", value: 5, weight: 2, enabled: true },
      { id: "pb-s1", label: "Pulled back (RSI \u2264 55)", category: "setup", metric: "weeklyRsi", operator: "<=", value: 55, weight: 2, enabled: true },
      { id: "pb-s2", label: "Trend intact (above 50 EMA)", category: "setup", metric: "priceVs50EmaPct", operator: ">=", value: 0, weight: 2, enabled: true },
      { id: "pb-r1", label: "Calm-ish market", category: "risk", metric: "vix", operator: "<=", value: 25, weight: 1, enabled: true },
      { id: "pb-r2", label: "Not oversold-broken", category: "risk", metric: "weeklyRsi", operator: ">=", value: 30, weight: 2, enabled: true },
      { id: "pb-p1", label: "Within position cap", category: "position", metric: "weightPct", operator: "<=", value: 35, weight: 2, enabled: true },
      { id: "pb-tr1", label: "P&L within tolerance", category: "trade", metric: "openPnlPct", operator: ">=", value: -20, weight: 2, enabled: true },
    ],
    thesis: { groups: [["pb-t1", "pb-t2"]] },
    checkInterval: "1D",
    technicalsInterval: "1D",
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
    rules: [
      { id: "sp-t1", label: "Has a growth story", category: "thesis", metric: "revenueGrowthPct", operator: ">=", value: 20, weight: 1, enabled: true },
      { id: "sp-s1", label: "Not in free-fall (above 50 EMA \u221215%)", category: "setup", metric: "priceVs50EmaPct", operator: ">=", value: -15, weight: 2, enabled: true },
      { id: "sp-r1", label: "Market not in panic", category: "risk", metric: "vix", operator: "<=", value: 28, weight: 1, enabled: true },
      { id: "sp-r2", label: "Not oversold-broken", category: "risk", metric: "weeklyRsi", operator: ">=", value: 25, weight: 2, enabled: true },
      { id: "sp-p1", label: "Speculative size cap", category: "position", metric: "weightPct", operator: "<=", value: 12, weight: 3, enabled: true },
      { id: "sp-tr1", label: "Risk-defined loss (P&L \u2265 -25)", category: "trade", metric: "openPnlPct", operator: ">=", value: -25, weight: 2, enabled: true },
    ],
    thesis: { groups: [["sp-t1"]] },
    categoryWeights: { thesis: 15, timeframe: 0, position: 20, setup: 20, risk: 30, trade: 15 },
    checkInterval: "1D",
    technicalsInterval: "1D",
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
    rules: [
      { id: "bt-t1", label: "Sales still growing", category: "thesis", metric: "revenueGrowthPct", operator: ">=", value: 12, weight: 3, enabled: true },
      { id: "bt-t2", label: "Still profitable", category: "thesis", metric: "netMarginPct", operator: ">=", value: 10, weight: 2, enabled: true },
      { id: "bt-s1", label: "Trend intact (above 50 EMA)", category: "setup", metric: "priceVs50EmaPct", operator: ">=", value: 0, weight: 2, enabled: true },
      { id: "bt-r1", label: "Manageable leverage", category: "risk", metric: "debtToEquity", operator: "<=", value: 2, weight: 2, enabled: true },
      { id: "bt-p1", label: "Within position cap", category: "position", metric: "weightPct", operator: "<=", value: 25, weight: 2, enabled: true },
      { id: "bt-tr1", label: "Loss within tolerance (P&L \u2265 -20)", category: "trade", metric: "openPnlPct", operator: ">=", value: -20, weight: 3, enabled: true },
    ],
    thesis: { groups: [["bt-t1", "bt-t2"]] },
    checkInterval: "1W",
    technicalsInterval: "1W",
  },
];

// Strategy assignments that drive the dashboard Strategy Check are derived from
// the default portfolio's holdings, so a holding's strategy edits flow through.
export const DEFAULT_ASSIGNMENTS: StrategyAssignments = Object.fromEntries(
  DEFAULT_PORTFOLIO.holdings.map((holding) => [holding.ticker, holding.strategyIds]),
);

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

// Treasure Ledger positions are derived from the default portfolio's holdings:
// weight is each holding's share of the invested book; P&L and plan label come
// straight from the holding (single source of truth).
const DEFAULT_BOOK_VALUE = DEFAULT_PORTFOLIO.holdings.reduce(
  (total, holding) =>
    total + holding.shares * (TICKERS[holding.ticker]?.lastPrice ?? 0),
  0,
);

export const POSITIONS: Position[] = DEFAULT_PORTFOLIO.holdings.map((holding) => {
  const info = TICKERS[holding.ticker];
  const value = holding.shares * (info?.lastPrice ?? 0);
  return {
    ticker: holding.ticker,
    name: info?.company ?? holding.ticker,
    weightPct:
      DEFAULT_BOOK_VALUE > 0 ? Math.round((value / DEFAULT_BOOK_VALUE) * 100) : 0,
    changePct: holding.openPnlPct,
    planLabel: holding.status,
    note: holding.reason,
  };
});

export const ALLOCATIONS: Allocation[] = [
  { label: "AI Infrastructure", pct: 42, tone: "positive" },
  { label: "Fintech", pct: 18, tone: "neutral" },
  { label: "Speculative", pct: 12, tone: "warning" },
  { label: "Cash", pct: 28, tone: "neutral" },
];

export const RISK_RULES: RiskRule[] = [
  {
    label: "Max single position",
    detail: "SOFI at 25% — right at your 25% cap; trim if it runs.",
    status: "warning",
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

// ---------------------------------------------------------------------------
// Strategy Forge data: market-data snapshots, buckets, and category weights.
//
// IMPORTANT (see .cursor/rules/data-architecture.mdc + data-architecture.md):
// The snapshots below are REAL researched values as of MARKET_ASOF — a static
// snapshot, NOT a live feed. They are consumed exclusively through the
// `dataSource` seam (src/lib/datasource), so swapping in a live provider later
// requires no changes to the scoring engine or UI. A genuinely-unavailable
// metric is `null` ("no data") — never a fabricated value or a silent fail.
// ---------------------------------------------------------------------------

// The market date these snapshots reflect (most-recent close at authoring time).
export const MARKET_ASOF = "2026-06-25";

// Latest reported fundamentals per ticker (TTM/most-recent quarter). `null` =
// metric is not meaningful/available for that name (e.g. margins for a bank, or
// a P/E for an unprofitable company), so the scoring engine scores it "no data".
export const FUNDAMENTAL_SNAPSHOTS: Record<string, FundamentalSnapshot> = {
  NVDA: {
    epsTtm: 6.53,
    epsGrowthPct: 66.7,
    revenueGrowthPct: 65.5,
    grossMarginPct: 74.15,
    netMarginPct: 62.97,
    peRatio: 29.98,
    debtToEquity: 0.07,
    fcfMarginPct: 46.97,
    asOf: MARKET_ASOF,
    source: "mock",
  },
  MSFT: {
    epsTtm: 16.79,
    epsGrowthPct: 29.64,
    revenueGrowthPct: 17.87,
    grossMarginPct: 68.31,
    netMarginPct: 39.34,
    peRatio: 21.01,
    debtToEquity: 0.2,
    fcfMarginPct: 22.0,
    asOf: MARKET_ASOF,
    source: "mock",
  },
  CRM: {
    epsTtm: 8.64,
    epsGrowthPct: 22.6,
    revenueGrowthPct: 9.58,
    grossMarginPct: 77.64,
    netMarginPct: 18.73,
    peRatio: 17.39,
    debtToEquity: 0.19,
    fcfMarginPct: 30.0,
    asOf: MARKET_ASOF,
    source: "mock",
  },
  // Bank/fintech: gross margin, FCF margin, and a comparable debt/equity are not
  // meaningful, so they are "no data" rather than misleading numbers.
  SOFI: {
    epsTtm: 0.45,
    epsGrowthPct: 50.0,
    revenueGrowthPct: 42.6,
    grossMarginPct: null,
    netMarginPct: 14.7,
    peRatio: 38.0,
    debtToEquity: null,
    fcfMarginPct: null,
    asOf: MARKET_ASOF,
    source: "mock",
  },
  // Pre-commercial: GAAP EPS/net margin are distorted by warrant remeasurement,
  // so the distorted figures are left as "no data".
  IONQ: {
    epsTtm: 0.92,
    epsGrowthPct: null,
    revenueGrowthPct: 104.0,
    grossMarginPct: 36.1,
    netMarginPct: null,
    peRatio: null,
    debtToEquity: 0.0,
    fcfMarginPct: null,
    asOf: MARKET_ASOF,
    source: "mock",
  },
  // Pre-revenue eVTOL: almost everything fundamental is "no data" by nature.
  ACHR: {
    epsTtm: -1.09,
    epsGrowthPct: null,
    revenueGrowthPct: null,
    grossMarginPct: null,
    netMarginPct: null,
    peRatio: null,
    debtToEquity: 0.05,
    fcfMarginPct: null,
    asOf: MARKET_ASOF,
    source: "mock",
  },
  CELH: {
    epsTtm: 0.44,
    epsGrowthPct: 20.0,
    revenueGrowthPct: 138.0,
    grossMarginPct: 50.35,
    netMarginPct: 5.85,
    peRatio: 64.39,
    debtToEquity: 0.1,
    fcfMarginPct: 9.86,
    asOf: MARKET_ASOF,
    source: "mock",
  },
  CRWV: {
    epsTtm: -2.72,
    epsGrowthPct: null,
    revenueGrowthPct: 167.0,
    grossMarginPct: 69.4,
    netMarginPct: -25.5,
    peRatio: null,
    debtToEquity: 8.0,
    fcfMarginPct: null,
    asOf: MARKET_ASOF,
    source: "mock",
  },
  ELF: {
    epsTtm: 0.44,
    epsGrowthPct: -77.1,
    revenueGrowthPct: 24.6,
    grossMarginPct: 71.0,
    netMarginPct: 1.6,
    peRatio: 150.5,
    debtToEquity: 0.3,
    fcfMarginPct: 8.0,
    asOf: MARKET_ASOF,
    source: "mock",
  },
  RGTI: {
    epsTtm: -0.89,
    epsGrowthPct: null,
    revenueGrowthPct: 135.0,
    grossMarginPct: 31.3,
    netMarginPct: null,
    peRatio: null,
    debtToEquity: 0.0,
    fcfMarginPct: null,
    asOf: MARKET_ASOF,
    source: "mock",
  },
};

// Technicals are approximate snapshots derived from recent price action as of
// MARKET_ASOF (weekly RSI; price distance % vs VWAP and the 10/20/50 EMAs).
export const TECHNICAL_SNAPSHOTS: Record<string, TechnicalSnapshot> = {
  NVDA: { weeklyRsi: 48, priceVsVwapPct: -1.0, priceVs10EmaPct: -2.0, priceVs20EmaPct: -1.5, priceVs50EmaPct: 0.5, asOf: MARKET_ASOF, source: "mock" },
  MSFT: { weeklyRsi: 40, priceVsVwapPct: -1.5, priceVs10EmaPct: -3.0, priceVs20EmaPct: -4.0, priceVs50EmaPct: -5.0, asOf: MARKET_ASOF, source: "mock" },
  CRM: { weeklyRsi: 38, priceVsVwapPct: -1.0, priceVs10EmaPct: -2.0, priceVs20EmaPct: -3.0, priceVs50EmaPct: -6.0, asOf: MARKET_ASOF, source: "mock" },
  SOFI: { weeklyRsi: 43, priceVsVwapPct: -0.5, priceVs10EmaPct: -1.0, priceVs20EmaPct: -2.0, priceVs50EmaPct: -4.0, asOf: MARKET_ASOF, source: "mock" },
  IONQ: { weeklyRsi: 60, priceVsVwapPct: 0.5, priceVs10EmaPct: -3.0, priceVs20EmaPct: 4.0, priceVs50EmaPct: 18.0, asOf: MARKET_ASOF, source: "mock" },
  ACHR: { weeklyRsi: 32, priceVsVwapPct: -1.0, priceVs10EmaPct: -3.0, priceVs20EmaPct: -5.0, priceVs50EmaPct: -10.0, asOf: MARKET_ASOF, source: "mock" },
  CELH: { weeklyRsi: 45, priceVsVwapPct: 0.0, priceVs10EmaPct: -1.0, priceVs20EmaPct: 1.0, priceVs50EmaPct: -3.0, asOf: MARKET_ASOF, source: "mock" },
  CRWV: { weeklyRsi: 45, priceVsVwapPct: -2.0, priceVs10EmaPct: -5.0, priceVs20EmaPct: -7.0, priceVs50EmaPct: -3.0, asOf: MARKET_ASOF, source: "mock" },
  ELF: { weeklyRsi: 52, priceVsVwapPct: 1.0, priceVs10EmaPct: 2.0, priceVs20EmaPct: 3.0, priceVs50EmaPct: 4.0, asOf: MARKET_ASOF, source: "mock" },
  RGTI: { weeklyRsi: 38, priceVsVwapPct: -2.0, priceVs10EmaPct: -5.0, priceVs20EmaPct: -8.0, priceVs50EmaPct: -12.0, asOf: MARKET_ASOF, source: "mock" },
};

// Plan-safe market mood. VIX and the SPY 14-day RSI as of MARKET_ASOF.
export const MARKET_CONTEXT: MarketContext = {
  vix: 18.89,
  spyRsi: 46.49,
  asOf: MARKET_ASOF,
  source: "mock",
};

// Reusable starter chips for the Forge chip library (save-to-library lets the
// user grow this). Plain, label-first conditions a beginner can drop into any
// strategy; ids are namespaced `lib-` so they never collide with strategy chips.
export const CHIP_LIBRARY_SEED: RuleChip[] = [
  { id: "lib-rev20", label: "Sales growing 20%+", category: "thesis", metric: "revenueGrowthPct", operator: ">=", value: 20, weight: 3, enabled: true },
  { id: "lib-profitable", label: "Profitable (net margin 10%+)", category: "thesis", metric: "netMarginPct", operator: ">=", value: 10, weight: 2, enabled: true },
  { id: "lib-grossmargin", label: "High gross margin (60%+)", category: "thesis", metric: "grossMarginPct", operator: ">=", value: 60, weight: 2, enabled: true },
  { id: "lib-uptrend", label: "Above 50-day trend", category: "setup", metric: "priceVs50EmaPct", operator: ">=", value: 0, weight: 2, enabled: true },
  { id: "lib-rsiband", label: "Healthy momentum (RSI 45–70)", category: "setup", metric: "weeklyRsi", operator: "between", value: [45, 70], weight: 2, enabled: true },
  { id: "lib-lowdebt", label: "Low leverage (D/E ≤ 1)", category: "risk", metric: "debtToEquity", operator: "<=", value: 1, weight: 2, enabled: true },
  { id: "lib-calmvix", label: "Calm market (VIX ≤ 25)", category: "risk", metric: "vix", operator: "<=", value: 25, weight: 1, enabled: true },
  { id: "lib-poscap", label: "Position cap 25%", category: "position", metric: "weightPct", operator: "<=", value: 25, weight: 2, enabled: true },
  { id: "lib-stoploss", label: "Stop-loss line (P&L ≥ -15)", category: "trade", metric: "openPnlPct", operator: ">=", value: -15, weight: 2, enabled: true },
];

// Default "stock-market-wizard" category blend (sums to 100). Thesis and Risk —
// the two existential questions — dominate; see docs/strategy-forge.md.
export const DEFAULT_CATEGORY_WEIGHTS: CategoryWeights = {
  thesis: 30,
  risk: 25,
  setup: 15,
  position: 12,
  trade: 10,
  timeframe: 8,
};

// Default buckets seeded for the active portfolio. A bucket is governed by one
// strategy (which carries the cadence + rule chips) and holds a share allocation
// of one or more tickers. SOFI intentionally lives in TWO buckets (57 sh in a
// daily "Fintech & Consumer" bucket + 10 sh in a 15m "Momentum" bucket) to
// exercise multi-bucket membership + per-bucket share allocation. Bucket
// authoring + share/entry editing is a later dashboard pass.
export const DEFAULT_BUCKETS: Bucket[] = [
  {
    id: "bkt-core-ai",
    name: "Core AI Growth",
    portfolioId: "deric",
    strategyId: "aggressive-ai-high-beta",
    holdings: [
      { ticker: "NVDA", shares: 3, entryDate: "2026-02-12" },
      { ticker: "MSFT", shares: 1, entryDate: "2026-01-08" },
      { ticker: "CRWV", shares: 2, entryDate: "2026-04-03" },
      { ticker: "IONQ", shares: 2, entryDate: "2026-03-19" },
    ],
  },
  {
    id: "bkt-fintech-consumer",
    name: "Fintech & Consumer",
    portfolioId: "deric",
    strategyId: "pullback-entry",
    holdings: [
      { ticker: "SOFI", shares: 57, entryDate: "2026-01-22" },
      { ticker: "ELF", shares: 14, entryDate: "2026-02-28" },
      { ticker: "CELH", shares: 14, entryDate: "2026-03-05" },
    ],
  },
  {
    id: "bkt-momentum",
    name: "Momentum (Intraday)",
    portfolioId: "deric",
    strategyId: "momentum",
    holdings: [
      { ticker: "SOFI", shares: 10, entryDate: "2026-06-24" },
      { ticker: "RGTI", shares: 3, entryDate: "2026-06-23" },
    ],
  },
  {
    id: "bkt-spec",
    name: "Speculative Runners",
    portfolioId: "deric",
    strategyId: "speculative-runner",
    holdings: [{ ticker: "ACHR", shares: 75, entryDate: "2026-05-14" }],
  },
  {
    id: "bkt-review",
    name: "Thesis Review",
    portfolioId: "deric",
    strategyId: "broken-thesis",
    holdings: [{ ticker: "CRM", shares: 2, entryDate: "2025-11-10" }],
  },
];
