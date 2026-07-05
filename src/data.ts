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
  RuleCategory,
  RuleChip,
  RuleTag,
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
        strategyIds: ["aggressive-ai-high-beta"],
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
        strategyIds: ["aggressive-ai-high-beta"],
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
        strategyIds: ["aggressive-ai-high-beta", "value-growth-dividend"],
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
        strategyIds: ["aggressive-ai-high-beta", "value-growth-dividend"],
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
        strategyIds: ["value-growth-dividend"],
      },
      {
        ticker: "CELH",
        shares: 14,
        avgPrice: 28.2,
        openPnlPct: 0.6,
        conviction: 56,
        status: "Watch",
        reason: "Positive P&L, but consumer exposure is outside the core strategy.",
        strategyIds: ["value-growth-dividend"],
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
        strategyIds: ["aggressive-ai-high-beta"],
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
        strategyIds: ["aggressive-ai-high-beta"],
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
        strategyIds: ["aggressive-ai-high-beta"],
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
        strategyIds: ["value-growth-dividend"],
      },
    ],
  },
  {
    id: "jeff",
    label: "Jeff\u2019s Webull Portfolio",
    type: "portfolio",
    strategyId: "value-growth-dividend",
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
        strategyIds: ["value-growth-dividend", "aggressive-ai-high-beta"],
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
        strategyIds: ["value-growth-dividend", "aggressive-ai-high-beta"],
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
        strategyIds: ["value-growth-dividend"],
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
        strategyIds: ["value-growth-dividend"],
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
        strategyIds: ["value-growth-dividend"],
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
        strategyIds: ["aggressive-ai-high-beta"],
      },
      {
        ticker: "IONQ",
        shares: 0,
        avgPrice: 0,
        openPnlPct: 0,
        conviction: 49,
        status: "Watch",
        reason: "On watch for a pullback into support before starting a position.",
        strategyIds: ["value-growth-dividend"],
      },
      {
        ticker: "ACHR",
        shares: 0,
        avgPrice: 0,
        openPnlPct: 0,
        conviction: 38,
        status: "Thesis Check",
        reason: "Speculative idea — thesis not yet written; needs a catalyst to act on.",
        strategyIds: ["aggressive-ai-high-beta"],
      },
      {
        ticker: "ELF",
        shares: 0,
        avgPrice: 0,
        openPnlPct: 0,
        conviction: 45,
        status: "Watch",
        reason: "Watching for a base to form after the recent pullback.",
        strategyIds: ["value-growth-dividend"],
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

// MVP default strategies. Trimmed to the two shown in the Strategy Forge design;
// additional defaults will be re-introduced one at a time. Removing strategies is
// a data-architecture change: bucket + holding strategyId references below are kept
// pointed at one of these two survivors.
export const DEFAULT_STRATEGIES: Strategy[] = [
  {
    id: "value-growth-dividend",
    name: "Value, Growth, Dividend",
    description:
      "Build around fundamentally strong companies with attractive valuations, durable growth, and reliable shareholder returns. Favor balanced upside through capital appreciation, dividend income, cash-flow strength, and long-term portfolio stability.",
    isDefault: true,
    enabled: true,
    timeframe: ["Long Term"],
    tags: ["Value", "Growth", "Dividend"],
    decisionSignals: ["Thesis", "Risk / Reward"],
    exitLogic: ["Break Thesis", "Macro Changes"],
    thesisDescription:
      "Seek companies where the market is underpricing durable business strength. Prioritize stocks with attractive valuation, steady revenue and EPS growth, healthy margins, manageable debt, reliable dividend support, and long-term compounding potential. Favor businesses that can compound through multiple market cycles while remaining resilient during volatility.",
    // Rule chips + tags mirror the Figma table designs exactly (labels, data
    // points, date ranges, conditions, values, weights). Chip weights sum to
    // 100 within each category; tag weights sum to 100 within each category.
    rules: [
      // ---- Thesis & Fundamentals (17 chips, weights sum to 100) ----
      { id: "vgd-f1", label: "Revenue Growth", category: "thesis", metric: "revenueGrowthPct", dateRange: "TTM / Latest FY", operator: ">=", value: 3, weightPct: 6, enabled: true },
      { id: "vgd-f2", label: "EPS Growth", category: "thesis", metric: "epsGrowthPct", dateRange: "TTM / Latest FY", operator: ">=", value: 5, weightPct: 8, enabled: true },
      { id: "vgd-f3", label: "Profitable", category: "thesis", metric: "netIncome", dateRange: "TTM / Latest FY", operator: ">", value: 0, weightPct: 8, enabled: true },
      { id: "vgd-f4", label: "Cash Flow Positive", category: "thesis", metric: "operatingCashFlow", dateRange: "TTM / Latest FY", operator: ">", value: 0, weightPct: 9, enabled: true },
      { id: "vgd-f5", label: "Forward P/E", category: "thesis", metric: "forwardPE", dateRange: "Current", operator: "<", value: 25, weightPct: 7, enabled: true },
      { id: "vgd-f6", label: "Price/Sales", category: "thesis", metric: "priceToSales", dateRange: "Current / TTM", operator: "<", value: 4, weightPct: 5, enabled: true },
      { id: "vgd-f7", label: "EV/EBITDA", category: "thesis", metric: "evToEbitda", dateRange: "Current / TTM", operator: "<", value: 12, weightPct: 6, enabled: true },
      { id: "vgd-f8", label: "Return on Equity", category: "thesis", metric: "returnOnEquityPct", dateRange: "TTM / Latest FY", operator: ">=", value: 10, weightPct: 8, enabled: true },
      { id: "vgd-f9", label: "Operating Margin", category: "thesis", metric: "operatingMarginPct", dateRange: "TTM / Latest FY", operator: ">=", value: 10, weightPct: 6, enabled: true },
      { id: "vgd-f10", label: "Debt/Equity", category: "thesis", metric: "debtToEquity", dateRange: "Most Recent Quarter", operator: "<", value: 1.5, weightPct: 6, enabled: true },
      { id: "vgd-f11", label: "Interest Coverage", category: "thesis", metric: "interestCoverage", dateRange: "TTM / Latest FY", operator: ">=", value: 4, weightPct: 5, enabled: true },
      { id: "vgd-f12", label: "Current Ratio", category: "thesis", metric: "currentRatio", dateRange: "Most Recent Quarter", operator: ">=", value: 1.0, weightPct: 3, enabled: true },
      { id: "vgd-f13", label: "Dividend Yield Floor", category: "thesis", metric: "dividendYieldPct", dateRange: "Current", operator: ">=", value: 1.5, weightPct: 5, enabled: true },
      { id: "vgd-f14", label: "Dividend Yield Ceiling", category: "thesis", metric: "dividendYieldPct", dateRange: "Current", operator: "<", value: 6, weightPct: 4, enabled: true },
      { id: "vgd-f15", label: "Payout Ratio", category: "thesis", metric: "payoutRatioPct", dateRange: "TTM / Latest FY", operator: "<", value: 70, weightPct: 8, enabled: true },
      { id: "vgd-f16", label: "Dividend Growth", category: "thesis", metric: "dividendGrowth5yPct", dateRange: "5Y", operator: ">=", value: 3, weightPct: 5, enabled: true },
      { id: "vgd-f17", label: "Buyback Support", category: "thesis", metric: "buybackYieldPct", dateRange: "TTM / Latest FY", operator: ">=", value: 1, weightPct: 1, enabled: true },
      // ---- Technical Analysis (Setup / Timing) (8 chips) ----
      { id: "vgd-s1", label: "Trend Healthy", category: "setup", metric: "priceAbove200dSma", dateRange: "Current", operator: "is", value: "TRUE", weightPct: 18, enabled: true },
      { id: "vgd-s2", label: "Intermediate Trend Healthy", category: "setup", metric: "priceAbove50dSma", dateRange: "Current", operator: "is", value: "TRUE", weightPct: 16, enabled: true },
      { id: "vgd-s3", label: "Entry Not Overbought", category: "setup", metric: "rsi14", dateRange: "Current", operator: "<", value: 70, weightPct: 13, enabled: true },
      { id: "vgd-s4", label: "Pullback Controlled", category: "setup", metric: "drawdownFrom52wHighPct", dateRange: "Current", operator: "<", value: 25, weightPct: 12, enabled: true },
      { id: "vgd-s5", label: "Relative Strength Positive", category: "setup", metric: "priceChange3mPct", dateRange: "3M", operator: ">", value: 0, weightPct: 14, enabled: true },
      { id: "vgd-s6", label: "Buyers Present", category: "setup", metric: "relativeVolume", dateRange: "Current", operator: ">=", value: 0.8, weightPct: 8, enabled: true },
      { id: "vgd-s7", label: "Price Above Short-Term Trend", category: "setup", metric: "priceAbove20dSma", dateRange: "Current", operator: "is", value: "TRUE", weightPct: 9, enabled: true },
      { id: "vgd-s8", label: "No Earnings Trap", category: "setup", metric: "daysUntilEarnings", dateRange: "Current", operator: ">", value: 7, weightPct: 10, enabled: true },
      // ---- Risk Rules (9 chips) ----
      { id: "vgd-r1", label: "Market Regime Stable", category: "risk", metric: "spyAbove200dSma", dateRange: "Current", operator: "is", value: "TRUE", weightPct: 18, enabled: true },
      { id: "vgd-r2", label: "Market Stress Contained", category: "risk", metric: "vix", dateRange: "Current", operator: "<", value: 35, weightPct: 16, enabled: true },
      { id: "vgd-r3", label: "No Broad Market Shock", category: "risk", metric: "spy5dChangePct", dateRange: "5D", operator: ">", value: -5, weightPct: 12, enabled: true },
      { id: "vgd-r4", label: "Sector Stress Contained", category: "risk", metric: "sectorEtf1mChangePct", dateRange: "1M", operator: ">", value: -10, weightPct: 12, enabled: true },
      { id: "vgd-r5", label: "Credit Stress Contained", category: "risk", metric: "highYieldSpreadPct", dateRange: "Current", operator: "<", value: 6, weightPct: 12, enabled: true },
      { id: "vgd-r6", label: "Rate Shock Controlled", category: "risk", metric: "treasury10y5dChangePct", dateRange: "5D", operator: "<", value: 0.25, weightPct: 10, enabled: true },
      { id: "vgd-r7", label: "Liquidity Risk Acceptable", category: "risk", metric: "avgDollarVolume20d", dateRange: "20D", operator: ">=", value: 10, weightPct: 8, enabled: true },
      { id: "vgd-r8", label: "Stock Volatility Not Extreme", category: "risk", metric: "atrPct14d", dateRange: "14D", operator: "<", value: 8, weightPct: 7, enabled: true },
      { id: "vgd-r9", label: "Beta Risk Acceptable", category: "risk", metric: "beta1y", dateRange: "1Y", operator: "<", value: 2.0, weightPct: 5, enabled: true },
      // ---- Position Size (2 chips) ----
      { id: "vgd-p1", label: "Position Cap Respected", category: "position", metric: "weightPct", dateRange: "Current", operator: "<=", value: 25, weightPct: 60, enabled: true },
      { id: "vgd-p2", label: "Meaningful Allocation", category: "position", metric: "weightPct", dateRange: "Current", operator: ">=", value: 1, weightPct: 40, enabled: true },
      // ---- Trade Management (2 chips) ----
      { id: "vgd-tr1", label: "Loss Within Tolerance", category: "trade", metric: "openPnlPct", dateRange: "Current", operator: ">=", value: -20, weightPct: 60, enabled: true },
      { id: "vgd-tr2", label: "Gain Not Extreme", category: "trade", metric: "openPnlPct", dateRange: "Current", operator: "<", value: 100, weightPct: 40, enabled: true },
      // ---- Hold Timeframe (2 chips) ----
      { id: "vgd-h1", label: "Holding Seasoned", category: "timeframe", metric: "holdingDays", dateRange: "Current", operator: ">=", value: 90, weightPct: 60, enabled: true },
      { id: "vgd-h2", label: "Within Review Window", category: "timeframe", metric: "holdingDays", dateRange: "Current", operator: "<", value: 365, weightPct: 40, enabled: true },
    ],
    ruleTags: [
      ...buildSystemTags("vgd"),
      // ---- Thesis Tags (weights sum to 100) ----
      { id: "vgd-tag-quality", label: "Quality", category: "thesis", purpose: "Confirms the company is profitable, cash-generative, and operationally strong.", chipIds: ["vgd-f3", "vgd-f4", "vgd-f8", "vgd-f9"], weightPct: 31, autoApply: "Apply when the company is growing with positive cash flow and healthy operating metrics." },
      { id: "vgd-tag-dividend", label: "Dividend", category: "thesis", purpose: "Confirms the stock provides sustainable shareholder income.", chipIds: ["vgd-f13", "vgd-f14", "vgd-f15", "vgd-f16", "vgd-f5"], weightPct: 22, autoApply: "Apply when the company pays a stable dividend and has dividend history." },
      { id: "vgd-tag-value", label: "Value", category: "thesis", purpose: "Confirms the stock is reasonably priced.", chipIds: ["vgd-f5", "vgd-f6", "vgd-f7"], weightPct: 18, autoApply: "Apply when valuation is central to the stock's thesis." },
      { id: "vgd-tag-growth", label: "Growth", category: "thesis", purpose: "Confirms the business is expanding.", chipIds: ["vgd-f1", "vgd-f2"], weightPct: 14, autoApply: "Apply when the stock is owned for growth, expansion, earnings growth, or future upside." },
      { id: "vgd-tag-balance", label: "Balance Sheet", category: "thesis", purpose: "Confirms the company has manageable debt and liquidity risk.", chipIds: ["vgd-f10", "vgd-f11", "vgd-f12"], weightPct: 14, autoApply: "Apply to most strategies, especially cyclical, leveraged, dividend, or defensive holdings." },
      { id: "vgd-tag-shreturns", label: "Shareholder Returns", category: "thesis", purpose: "Gives light credit for buyback support.", chipIds: ["vgd-f17"], weightPct: 1, autoApply: "Apply when buybacks are part of the shareholder return thesis." },
      // ---- Technical Setup Tags ----
      { id: "vgd-tag-trend", label: "Trend Health", category: "setup", purpose: "Confirms the stock is trading in a constructive uptrend before buying or adding.", chipIds: ["vgd-s1", "vgd-s2", "vgd-s7"], weightPct: 30, autoApply: "Apply to most stocks. Especially useful for growth, quality, and compounder positions." },
      { id: "vgd-tag-entry", label: "Entry Timing", category: "setup", purpose: "Confirms the entry is not obviously stretched, exhausted, or too close to a risky event.", chipIds: ["vgd-s3", "vgd-s8"], weightPct: 25, autoApply: "Apply before opening or adding to any position." },
      { id: "vgd-tag-pullback", label: "Pullback Quality", category: "setup", purpose: "Confirms weakness looks controlled rather than broken.", chipIds: ["vgd-s4", "vgd-s1", "vgd-s3"], weightPct: 20, autoApply: "Apply when buying dips, value setups, dividend pullbacks, or post-selloff recovery attempts." },
      { id: "vgd-tag-relstrength", label: "Relative Strength", category: "setup", purpose: "Confirms the stock is showing positive price momentum instead of lagging badly.", chipIds: ["vgd-s5", "vgd-s2"], weightPct: 15, autoApply: "Apply when choosing between multiple candidates or prioritizing capital into stronger names." },
      { id: "vgd-tag-buyers", label: "Buyer Confirmation", category: "setup", purpose: "Confirms there is at least enough participation to support the move.", chipIds: ["vgd-s6", "vgd-s7"], weightPct: 10, autoApply: "Apply when timing entries, confirming rebounds, or validating breakout/pullback entries." },
      // ---- Risk Rule Tags ----
      { id: "vgd-tag-regime", label: "Market Regime Risk", category: "risk", purpose: "Confirms the broad market backdrop is not structurally hostile to holding or adding.", chipIds: ["vgd-r1", "vgd-r2", "vgd-r3"], weightPct: 25, autoApply: "Apply to most stocks. Especially growth and high-beta holdings." },
      { id: "vgd-tag-sector", label: "Sector Risk", category: "risk", purpose: "Confirms the stock's sector is not breaking down or under broad pressure.", chipIds: ["vgd-r4"], weightPct: 14, autoApply: "Apply when the stock is sensitive to sector rotation, industry weakness, or theme-based selloffs." },
      { id: "vgd-tag-macro", label: "Macro Shock Risk", category: "risk", purpose: "Confirms rates and credit conditions are not creating major pressure on valuations or risk appetite.", chipIds: ["vgd-r5", "vgd-r6"], weightPct: 20, autoApply: "Apply to growth, tech, financials, and rate-sensitive dividend stocks." },
      { id: "vgd-tag-liquidity", label: "Liquidity Risk", category: "risk", purpose: "Confirms the stock has enough trading volume to enter, add, trim, or exit without excessive slippage.", chipIds: ["vgd-r7"], weightPct: 10, autoApply: "Apply to small caps, speculative names, thinly traded stocks, or any position the user may need to exit quickly." },
      { id: "vgd-tag-volatility", label: "Volatility Risk", category: "risk", purpose: "Confirms normal price movement is not so extreme that it should reduce confidence or require smaller sizing.", chipIds: ["vgd-r8", "vgd-r9"], weightPct: 10, autoApply: "Apply to high-beta growth stocks, short-term turnarounds, or future upside positions." },
      { id: "vgd-tag-defensive", label: "Defensive Holding Risk", category: "risk", purpose: "Confirms income and dividend holdings are not being exposed to meaningful market stress, rates, or structural weakness.", chipIds: ["vgd-r2", "vgd-r6", "vgd-r4", "vgd-r9"], weightPct: 21, autoApply: "Apply to dividend-defensive, utility-heavy, or stable-income-focused portfolios." },
      // ---- Position Size Tags ----
      { id: "vgd-tag-concentration", label: "Concentration Control", category: "position", purpose: "Confirms no single position can sink the portfolio.", chipIds: ["vgd-p1"], weightPct: 60, autoApply: "Apply to concentrated portfolios and high-conviction positions." },
      { id: "vgd-tag-allocation", label: "Meaningful Allocation", category: "position", purpose: "Confirms the position is large enough to matter if the thesis works.", chipIds: ["vgd-p2"], weightPct: 40, autoApply: "Apply when many small positions are diluting the portfolio's focus." },
      // ---- Trade Management Tags ----
      { id: "vgd-tag-drawdown", label: "Drawdown Discipline", category: "trade", purpose: "Confirms an open loss has not blown through the plan's review level.", chipIds: ["vgd-tr1"], weightPct: 60, autoApply: "Apply to every open position; tighten the tolerance for speculative names." },
      { id: "vgd-tag-profit", label: "Profit Discipline", category: "trade", purpose: "Flags outsized gains for a trim-or-rebalance review.", chipIds: ["vgd-tr2"], weightPct: 40, autoApply: "Apply to winners that have grown well past their entry thesis." },
      // ---- Hold Timeframe Tags ----
      { id: "vgd-tag-patience", label: "Patience", category: "timeframe", purpose: "Confirms a long-term thesis has been given time to work.", chipIds: ["vgd-h1"], weightPct: 60, autoApply: "Apply to long-term compounders and dividend holdings." },
      { id: "vgd-tag-review", label: "Review Cadence", category: "timeframe", purpose: "Confirms the holding gets a full thesis review at least annually.", chipIds: ["vgd-h2"], weightPct: 40, autoApply: "Apply to every long-term holding." },
    ],
    categoryWeights: { thesis: 55, setup: 12, risk: 15, position: 8, trade: 6, timeframe: 4 },
    appliedPortfolioIds: ["deric"],
    checkInterval: "1D",
    technicalsInterval: "1D",
  },
  {
    id: "aggressive-ai-high-beta",
    name: "Aggressive AI / High-Beta Growth",
    description:
      "Concentrate in AI infrastructure, semiconductors, quantum, fintech growth, and high-beta leaders. Favor catalyst-driven setups with thesis alignment, position discipline, and constant risk awareness.",
    isDefault: true,
    enabled: true,
    timeframe: ["Swing", "Long Term", "Speculation"],
    tags: ["AI Infrastructure", "Aggressive Growth"],
    decisionSignals: ["Thesis", "Catalyst", "Risk / Reward"],
    exitLogic: ["Break Thesis", "Lose Trend", "Macro Changes"],
    thesisDescription:
      "Own the companies building and monetizing AI infrastructure while the buildout is still underpriced. Prioritize hyper-growth revenue, strong gross margins, improving cash generation, and leadership positions — accepting higher volatility in exchange for asymmetric upside, with strict sizing and risk rules doing the protecting.",
    rules: [
      // ---- Thesis & Fundamentals (5 chips) ----
      { id: "aih-f1", label: "Hyper Growth", category: "thesis", metric: "revenueGrowthPct", dateRange: "TTM / Latest FY", operator: ">=", value: 25, weightPct: 30, enabled: true },
      { id: "aih-f2", label: "Strong Gross Margin", category: "thesis", metric: "grossMarginPct", dateRange: "TTM / Latest FY", operator: ">=", value: 50, weightPct: 20, enabled: true },
      { id: "aih-f3", label: "Profitable or Near", category: "thesis", metric: "netMarginPct", dateRange: "TTM / Latest FY", operator: ">=", value: 0, weightPct: 15, enabled: true },
      { id: "aih-f4", label: "Cash Generative", category: "thesis", metric: "operatingCashFlow", dateRange: "TTM / Latest FY", operator: ">", value: 0, weightPct: 15, enabled: true },
      { id: "aih-f5", label: "Not Absurdly Priced", category: "thesis", metric: "priceToSales", dateRange: "Current / TTM", operator: "<", value: 30, weightPct: 20, enabled: true },
      // ---- Technical Analysis (5 chips) ----
      { id: "aih-s1", label: "Trend Healthy", category: "setup", metric: "priceAbove200dSma", dateRange: "Current", operator: "is", value: "TRUE", weightPct: 25, enabled: true },
      { id: "aih-s2", label: "Intermediate Trend Healthy", category: "setup", metric: "priceAbove50dSma", dateRange: "Current", operator: "is", value: "TRUE", weightPct: 20, enabled: true },
      { id: "aih-s3", label: "Momentum Not Exhausted", category: "setup", metric: "rsi14", dateRange: "Current", operator: "<", value: 75, weightPct: 20, enabled: true },
      { id: "aih-s4", label: "Relative Strength Positive", category: "setup", metric: "priceChange3mPct", dateRange: "3M", operator: ">", value: 0, weightPct: 20, enabled: true },
      { id: "aih-s5", label: "No Earnings Trap", category: "setup", metric: "daysUntilEarnings", dateRange: "Current", operator: ">", value: 5, weightPct: 15, enabled: true },
      // ---- Risk Rules (5 chips) ----
      { id: "aih-r1", label: "Market Regime Stable", category: "risk", metric: "spyAbove200dSma", dateRange: "Current", operator: "is", value: "TRUE", weightPct: 25, enabled: true },
      { id: "aih-r2", label: "Market Stress Contained", category: "risk", metric: "vix", dateRange: "Current", operator: "<", value: 30, weightPct: 20, enabled: true },
      { id: "aih-r3", label: "No Broad Market Shock", category: "risk", metric: "spy5dChangePct", dateRange: "5D", operator: ">", value: -4, weightPct: 20, enabled: true },
      { id: "aih-r4", label: "Volatility Tolerable", category: "risk", metric: "atrPct14d", dateRange: "14D", operator: "<", value: 12, weightPct: 20, enabled: true },
      { id: "aih-r5", label: "Liquidity Risk Acceptable", category: "risk", metric: "avgDollarVolume20d", dateRange: "20D", operator: ">=", value: 25, weightPct: 15, enabled: true },
      // ---- Position Size (2 chips) ----
      { id: "aih-p1", label: "Position Cap Respected", category: "position", metric: "weightPct", dateRange: "Current", operator: "<=", value: 15, weightPct: 60, enabled: true },
      { id: "aih-p2", label: "Meaningful Allocation", category: "position", metric: "weightPct", dateRange: "Current", operator: ">=", value: 2, weightPct: 40, enabled: true },
      // ---- Trade Management (2 chips) ----
      { id: "aih-tr1", label: "Loss Within Tolerance", category: "trade", metric: "openPnlPct", dateRange: "Current", operator: ">=", value: -15, weightPct: 60, enabled: true },
      { id: "aih-tr2", label: "Gain Not Extreme", category: "trade", metric: "openPnlPct", dateRange: "Current", operator: "<", value: 150, weightPct: 40, enabled: true },
      // ---- Hold Timeframe (2 chips) ----
      { id: "aih-h1", label: "Position Seasoned", category: "timeframe", metric: "holdingDays", dateRange: "Current", operator: ">=", value: 30, weightPct: 50, enabled: true },
      { id: "aih-h2", label: "Within Review Window", category: "timeframe", metric: "holdingDays", dateRange: "Current", operator: "<", value: 270, weightPct: 50, enabled: true },
    ],
    ruleTags: [
      ...buildSystemTags("aih"),
      { id: "aih-tag-growth", label: "Growth Engine", category: "thesis", purpose: "Confirms the hyper-growth engine is intact.", chipIds: ["aih-f1", "aih-f2"], weightPct: 40, autoApply: "Apply to every AI infrastructure and high-beta growth name." },
      { id: "aih-tag-quality", label: "Quality Check", category: "thesis", purpose: "Confirms growth is converting into real profits and cash.", chipIds: ["aih-f3", "aih-f4"], weightPct: 35, autoApply: "Apply when a growth story needs proof the model works." },
      { id: "aih-tag-valuation", label: "Valuation Sanity", category: "thesis", purpose: "Confirms the price still leaves room for upside.", chipIds: ["aih-f5"], weightPct: 25, autoApply: "Apply when momentum has pushed the multiple to extremes." },
      { id: "aih-tag-trend", label: "Trend Health", category: "setup", purpose: "Confirms the stock is trading in a constructive uptrend before buying or adding.", chipIds: ["aih-s1", "aih-s2"], weightPct: 40, autoApply: "Apply to most stocks. Especially useful for growth and momentum positions." },
      { id: "aih-tag-entry", label: "Entry Timing", category: "setup", purpose: "Confirms the entry is not obviously stretched or too close to a risky event.", chipIds: ["aih-s3", "aih-s5"], weightPct: 35, autoApply: "Apply before opening or adding to any position." },
      { id: "aih-tag-momentum", label: "Momentum", category: "setup", purpose: "Confirms the stock is showing positive price momentum instead of lagging.", chipIds: ["aih-s4"], weightPct: 25, autoApply: "Apply when prioritizing capital into the strongest names." },
      { id: "aih-tag-regime", label: "Market Regime Risk", category: "risk", purpose: "Confirms the broad market backdrop is not structurally hostile to holding or adding.", chipIds: ["aih-r1", "aih-r2", "aih-r3"], weightPct: 45, autoApply: "Apply to most stocks. Especially growth and high-beta holdings." },
      { id: "aih-tag-volatility", label: "Volatility Risk", category: "risk", purpose: "Confirms price movement is not so extreme that it should force smaller sizing.", chipIds: ["aih-r4"], weightPct: 30, autoApply: "Apply to high-beta growth stocks and speculative positions." },
      { id: "aih-tag-liquidity", label: "Liquidity Risk", category: "risk", purpose: "Confirms the stock has enough trading volume to exit quickly if the thesis breaks.", chipIds: ["aih-r5"], weightPct: 25, autoApply: "Apply to small caps, speculative names, and thinly traded stocks." },
      { id: "aih-tag-concentration", label: "Concentration Control", category: "position", purpose: "Confirms no single high-beta position can sink the portfolio.", chipIds: ["aih-p1"], weightPct: 60, autoApply: "Apply to concentrated portfolios and high-conviction positions." },
      { id: "aih-tag-allocation", label: "Meaningful Allocation", category: "position", purpose: "Confirms the position is large enough to matter if the thesis works.", chipIds: ["aih-p2"], weightPct: 40, autoApply: "Apply when many small positions are diluting the portfolio's focus." },
      { id: "aih-tag-drawdown", label: "Drawdown Discipline", category: "trade", purpose: "Confirms an open loss has not blown through the plan's review level.", chipIds: ["aih-tr1"], weightPct: 60, autoApply: "Apply to every open position; tighten the tolerance for speculative names." },
      { id: "aih-tag-profit", label: "Profit Discipline", category: "trade", purpose: "Flags outsized gains for a trim-or-rebalance review.", chipIds: ["aih-tr2"], weightPct: 40, autoApply: "Apply to winners that have grown well past their entry thesis." },
      { id: "aih-tag-patience", label: "Patience", category: "timeframe", purpose: "Confirms the position has been given time to prove the setup.", chipIds: ["aih-h1"], weightPct: 50, autoApply: "Apply to swing and longer-horizon growth positions." },
      { id: "aih-tag-review", label: "Review Cadence", category: "timeframe", purpose: "Confirms the holding gets a full thesis review on schedule.", chipIds: ["aih-h2"], weightPct: 50, autoApply: "Apply to every open position." },
    ],
    categoryWeights: { thesis: 40, setup: 20, risk: 20, position: 8, trade: 8, timeframe: 4 },
    appliedPortfolioIds: ["deric"],
    checkInterval: "1D",
    technicalsInterval: "1D",
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
// metric is not meaningful/available for that name (e.g. margins for a bank, a
// P/E for an unprofitable company, or a 5Y dividend growth rate for a company
// with no dividend history), so the scoring engine scores it "no data".
// Non-payers report dividendYieldPct/payoutRatioPct/buybackYieldPct of 0 — that
// is real data (a failing floor chip), not missing data.
export const FUNDAMENTAL_SNAPSHOTS: Record<string, FundamentalSnapshot> = {
  NVDA: {
    epsTtm: 6.53,
    epsGrowthPct: 66.7,
    revenueGrowthPct: 65.5,
    grossMarginPct: 74.15,
    netMarginPct: 62.97,
    netIncome: 100.6,
    operatingCashFlow: 105.2,
    returnOnEquityPct: 109.4,
    operatingMarginPct: 62.0,
    fcfMarginPct: 46.97,
    peRatio: 29.98,
    forwardPE: 26.5,
    priceToSales: 19.8,
    evToEbitda: 24.6,
    debtToEquity: 0.07,
    interestCoverage: 260,
    currentRatio: 4.4,
    dividendYieldPct: 0.02,
    payoutRatioPct: 1.1,
    dividendGrowth5yPct: 5.0,
    buybackYieldPct: 1.4,
    asOf: MARKET_ASOF,
    source: "mock",
  },
  MSFT: {
    epsTtm: 16.79,
    epsGrowthPct: 29.64,
    revenueGrowthPct: 17.87,
    grossMarginPct: 68.31,
    netMarginPct: 39.34,
    netIncome: 116.0,
    operatingCashFlow: 148.0,
    returnOnEquityPct: 33.4,
    operatingMarginPct: 45.5,
    fcfMarginPct: 22.0,
    peRatio: 21.01,
    forwardPE: 19.5,
    priceToSales: 8.3,
    evToEbitda: 15.4,
    debtToEquity: 0.2,
    interestCoverage: 42,
    currentRatio: 1.3,
    dividendYieldPct: 0.9,
    payoutRatioPct: 24.6,
    dividendGrowth5yPct: 10.2,
    buybackYieldPct: 0.5,
    asOf: MARKET_ASOF,
    source: "mock",
  },
  CRM: {
    epsTtm: 8.64,
    epsGrowthPct: 22.6,
    revenueGrowthPct: 9.58,
    grossMarginPct: 77.64,
    netMarginPct: 18.73,
    netIncome: 7.1,
    operatingCashFlow: 14.2,
    returnOnEquityPct: 11.6,
    operatingMarginPct: 21.3,
    fcfMarginPct: 30.0,
    peRatio: 17.39,
    forwardPE: 15.2,
    priceToSales: 3.9,
    evToEbitda: 12.8,
    debtToEquity: 0.19,
    interestCoverage: 28,
    currentRatio: 1.1,
    dividendYieldPct: 1.1,
    payoutRatioPct: 18.5,
    dividendGrowth5yPct: null, // dividend initiated 2024 — no 5Y history yet
    buybackYieldPct: 2.1,
    asOf: MARKET_ASOF,
    source: "mock",
  },
  // Bank/fintech: gross margin, FCF margin, EV/EBITDA, coverage/current ratios,
  // and a comparable debt/equity are not meaningful → "no data".
  SOFI: {
    epsTtm: 0.45,
    epsGrowthPct: 50.0,
    revenueGrowthPct: 42.6,
    grossMarginPct: null,
    netMarginPct: 14.7,
    netIncome: 0.55,
    operatingCashFlow: null,
    returnOnEquityPct: 7.8,
    operatingMarginPct: null,
    fcfMarginPct: null,
    peRatio: 38.0,
    forwardPE: 30.0,
    priceToSales: 6.5,
    evToEbitda: null,
    debtToEquity: null,
    interestCoverage: null,
    currentRatio: null,
    dividendYieldPct: 0,
    payoutRatioPct: 0,
    dividendGrowth5yPct: null,
    buybackYieldPct: 0,
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
    netIncome: null,
    operatingCashFlow: -0.15,
    returnOnEquityPct: null,
    operatingMarginPct: null,
    fcfMarginPct: null,
    peRatio: null,
    forwardPE: null,
    priceToSales: 150,
    evToEbitda: null,
    debtToEquity: 0.0,
    interestCoverage: null,
    currentRatio: 7.5,
    dividendYieldPct: 0,
    payoutRatioPct: 0,
    dividendGrowth5yPct: null,
    buybackYieldPct: 0,
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
    netIncome: -0.55,
    operatingCashFlow: -0.45,
    returnOnEquityPct: null,
    operatingMarginPct: null,
    fcfMarginPct: null,
    peRatio: null,
    forwardPE: null,
    priceToSales: null,
    evToEbitda: null,
    debtToEquity: 0.05,
    interestCoverage: null,
    currentRatio: 6.8,
    dividendYieldPct: 0,
    payoutRatioPct: 0,
    dividendGrowth5yPct: null,
    buybackYieldPct: 0,
    asOf: MARKET_ASOF,
    source: "mock",
  },
  CELH: {
    epsTtm: 0.44,
    epsGrowthPct: 20.0,
    revenueGrowthPct: 138.0,
    grossMarginPct: 50.35,
    netMarginPct: 5.85,
    netIncome: 0.09,
    operatingCashFlow: 0.11,
    returnOnEquityPct: 13.5,
    operatingMarginPct: 8.2,
    fcfMarginPct: 9.86,
    peRatio: 64.39,
    forwardPE: 38.0,
    priceToSales: 4.6,
    evToEbitda: 32.0,
    debtToEquity: 0.1,
    interestCoverage: 60,
    currentRatio: 2.6,
    dividendYieldPct: 0,
    payoutRatioPct: 0,
    dividendGrowth5yPct: null,
    buybackYieldPct: 0,
    asOf: MARKET_ASOF,
    source: "mock",
  },
  CRWV: {
    epsTtm: -2.72,
    epsGrowthPct: null,
    revenueGrowthPct: 167.0,
    grossMarginPct: 69.4,
    netMarginPct: -25.5,
    netIncome: -1.1,
    operatingCashFlow: 2.8,
    returnOnEquityPct: null,
    operatingMarginPct: 17.0,
    fcfMarginPct: null,
    peRatio: null,
    forwardPE: null,
    priceToSales: 12.0,
    evToEbitda: 22.0,
    debtToEquity: 8.0,
    interestCoverage: 1.2,
    currentRatio: 0.9,
    dividendYieldPct: 0,
    payoutRatioPct: 0,
    dividendGrowth5yPct: null,
    buybackYieldPct: 0,
    asOf: MARKET_ASOF,
    source: "mock",
  },
  ELF: {
    epsTtm: 0.44,
    epsGrowthPct: -77.1,
    revenueGrowthPct: 24.6,
    grossMarginPct: 71.0,
    netMarginPct: 1.6,
    netIncome: 0.02,
    operatingCashFlow: 0.12,
    returnOnEquityPct: 2.9,
    operatingMarginPct: 5.1,
    fcfMarginPct: 8.0,
    peRatio: 150.5,
    forwardPE: 28.0,
    priceToSales: 2.4,
    evToEbitda: 18.5,
    debtToEquity: 0.3,
    interestCoverage: 6.5,
    currentRatio: 1.8,
    dividendYieldPct: 0,
    payoutRatioPct: 0,
    dividendGrowth5yPct: null,
    buybackYieldPct: 0,
    asOf: MARKET_ASOF,
    source: "mock",
  },
  RGTI: {
    epsTtm: -0.89,
    epsGrowthPct: null,
    revenueGrowthPct: 135.0,
    grossMarginPct: 31.3,
    netMarginPct: null,
    netIncome: -0.2,
    operatingCashFlow: -0.08,
    returnOnEquityPct: null,
    operatingMarginPct: null,
    fcfMarginPct: null,
    peRatio: null,
    forwardPE: null,
    priceToSales: 90,
    evToEbitda: null,
    debtToEquity: 0.0,
    interestCoverage: null,
    currentRatio: 8.2,
    dividendYieldPct: 0,
    payoutRatioPct: 0,
    dividendGrowth5yPct: null,
    buybackYieldPct: 0,
    asOf: MARKET_ASOF,
    source: "mock",
  },
};

// Technicals are approximate snapshots derived from recent price action as of
// MARKET_ASOF. Trend flags are 1 (true) / 0 (false); avgDollarVolume20d is $M
// per day; sectorEtf1mChangePct is the 1M move of that name's sector ETF
// (XLK tech, XLF financials, XLI industrials, XLP staples). CRWV's 200D flag
// and beta are null (IPO'd 2025 — not enough trading history).
export const TECHNICAL_SNAPSHOTS: Record<string, TechnicalSnapshot> = {
  NVDA: { priceAbove200dSma: 1, priceAbove50dSma: 1, priceAbove20dSma: 0, rsi14: 47, weeklyRsi: 48, drawdownFrom52wHighPct: 11, priceChange3mPct: 4, relativeVolume: 0.95, priceVsVwapPct: -1.0, priceVs10EmaPct: -2.0, priceVs20EmaPct: -1.5, priceVs50EmaPct: 0.5, daysUntilEarnings: 55, atrPct14d: 2.8, beta1y: 2.1, avgDollarVolume20d: 28000, sectorEtf1mChangePct: 2.5, asOf: MARKET_ASOF, source: "mock" },
  MSFT: { priceAbove200dSma: 1, priceAbove50dSma: 0, priceAbove20dSma: 0, rsi14: 42, weeklyRsi: 40, drawdownFrom52wHighPct: 9, priceChange3mPct: -2, relativeVolume: 0.9, priceVsVwapPct: -1.5, priceVs10EmaPct: -3.0, priceVs20EmaPct: -4.0, priceVs50EmaPct: -5.0, daysUntilEarnings: 30, atrPct14d: 1.6, beta1y: 0.9, avgDollarVolume20d: 9500, sectorEtf1mChangePct: 2.5, asOf: MARKET_ASOF, source: "mock" },
  CRM: { priceAbove200dSma: 0, priceAbove50dSma: 0, priceAbove20dSma: 0, rsi14: 40, weeklyRsi: 38, drawdownFrom52wHighPct: 22, priceChange3mPct: -8, relativeVolume: 0.85, priceVsVwapPct: -1.0, priceVs10EmaPct: -2.0, priceVs20EmaPct: -3.0, priceVs50EmaPct: -6.0, daysUntilEarnings: 60, atrPct14d: 2.2, beta1y: 1.3, avgDollarVolume20d: 2400, sectorEtf1mChangePct: 2.5, asOf: MARKET_ASOF, source: "mock" },
  SOFI: { priceAbove200dSma: 1, priceAbove50dSma: 0, priceAbove20dSma: 0, rsi14: 44, weeklyRsi: 43, drawdownFrom52wHighPct: 18, priceChange3mPct: 3, relativeVolume: 1.0, priceVsVwapPct: -0.5, priceVs10EmaPct: -1.0, priceVs20EmaPct: -2.0, priceVs50EmaPct: -4.0, daysUntilEarnings: 35, atrPct14d: 4.5, beta1y: 1.9, avgDollarVolume20d: 900, sectorEtf1mChangePct: 1.2, asOf: MARKET_ASOF, source: "mock" },
  IONQ: { priceAbove200dSma: 1, priceAbove50dSma: 1, priceAbove20dSma: 1, rsi14: 58, weeklyRsi: 60, drawdownFrom52wHighPct: 25, priceChange3mPct: 40, relativeVolume: 1.4, priceVsVwapPct: 0.5, priceVs10EmaPct: -3.0, priceVs20EmaPct: 4.0, priceVs50EmaPct: 18.0, daysUntilEarnings: 42, atrPct14d: 7.5, beta1y: 2.6, avgDollarVolume20d: 850, sectorEtf1mChangePct: 2.5, asOf: MARKET_ASOF, source: "mock" },
  ACHR: { priceAbove200dSma: 0, priceAbove50dSma: 0, priceAbove20dSma: 0, rsi14: 35, weeklyRsi: 32, drawdownFrom52wHighPct: 45, priceChange3mPct: -15, relativeVolume: 0.8, priceVsVwapPct: -1.0, priceVs10EmaPct: -3.0, priceVs20EmaPct: -5.0, priceVs50EmaPct: -10.0, daysUntilEarnings: 40, atrPct14d: 6.8, beta1y: 3.1, avgDollarVolume20d: 400, sectorEtf1mChangePct: 0.8, asOf: MARKET_ASOF, source: "mock" },
  CELH: { priceAbove200dSma: 0, priceAbove50dSma: 0, priceAbove20dSma: 1, rsi14: 46, weeklyRsi: 45, drawdownFrom52wHighPct: 38, priceChange3mPct: 6, relativeVolume: 0.9, priceVsVwapPct: 0.0, priceVs10EmaPct: -1.0, priceVs20EmaPct: 1.0, priceVs50EmaPct: -3.0, daysUntilEarnings: 45, atrPct14d: 4.2, beta1y: 1.6, avgDollarVolume20d: 350, sectorEtf1mChangePct: -1.0, asOf: MARKET_ASOF, source: "mock" },
  CRWV: { priceAbove200dSma: null, priceAbove50dSma: 0, priceAbove20dSma: 0, rsi14: 44, weeklyRsi: 45, drawdownFrom52wHighPct: 42, priceChange3mPct: -12, relativeVolume: 1.1, priceVsVwapPct: -2.0, priceVs10EmaPct: -5.0, priceVs20EmaPct: -7.0, priceVs50EmaPct: -3.0, daysUntilEarnings: 38, atrPct14d: 8.5, beta1y: null, avgDollarVolume20d: 1800, sectorEtf1mChangePct: 2.5, asOf: MARKET_ASOF, source: "mock" },
  ELF: { priceAbove200dSma: 1, priceAbove50dSma: 1, priceAbove20dSma: 1, rsi14: 55, weeklyRsi: 52, drawdownFrom52wHighPct: 12, priceChange3mPct: 18, relativeVolume: 1.05, priceVsVwapPct: 1.0, priceVs10EmaPct: 2.0, priceVs20EmaPct: 3.0, priceVs50EmaPct: 4.0, daysUntilEarnings: 50, atrPct14d: 3.4, beta1y: 1.4, avgDollarVolume20d: 320, sectorEtf1mChangePct: -1.0, asOf: MARKET_ASOF, source: "mock" },
  RGTI: { priceAbove200dSma: 0, priceAbove50dSma: 0, priceAbove20dSma: 0, rsi14: 36, weeklyRsi: 38, drawdownFrom52wHighPct: 55, priceChange3mPct: -20, relativeVolume: 0.9, priceVsVwapPct: -2.0, priceVs10EmaPct: -5.0, priceVs20EmaPct: -8.0, priceVs50EmaPct: -12.0, daysUntilEarnings: 40, atrPct14d: 9.2, beta1y: 2.9, avgDollarVolume20d: 280, sectorEtf1mChangePct: 2.5, asOf: MARKET_ASOF, source: "mock" },
};

// Plan-safe market mood as of MARKET_ASOF: VIX, SPY 14-day RSI, the SPY 200D
// regime flag, SPY 5-day change, high-yield credit spread, and the 5-day move
// in the 10-year Treasury yield (percentage points).
export const MARKET_CONTEXT: MarketContext = {
  vix: 18.89,
  spyRsi: 46.49,
  spyAbove200dSma: 1,
  spy5dChangePct: 1.2,
  highYieldSpreadPct: 3.1,
  treasury10y5dChangePct: 0.05,
  asOf: MARKET_ASOF,
  source: "mock",
};

// Reusable starter chips for the Forge chip library (kept for a later pass —
// the table-modal redesign removed the in-card library UI). Ids are namespaced
// `lib-` so they never collide with strategy chips.
export const CHIP_LIBRARY_SEED: RuleChip[] = [
  { id: "lib-rev20", label: "Sales growing 20%+", category: "thesis", metric: "revenueGrowthPct", dateRange: "TTM / Latest FY", operator: ">=", value: 20, weightPct: 20, enabled: true },
  { id: "lib-profitable", label: "Profitable (net margin 10%+)", category: "thesis", metric: "netMarginPct", dateRange: "TTM / Latest FY", operator: ">=", value: 10, weightPct: 15, enabled: true },
  { id: "lib-grossmargin", label: "High gross margin (60%+)", category: "thesis", metric: "grossMarginPct", dateRange: "TTM / Latest FY", operator: ">=", value: 60, weightPct: 15, enabled: true },
  { id: "lib-uptrend", label: "Above 50-day trend", category: "setup", metric: "priceAbove50dSma", dateRange: "Current", operator: "is", value: "TRUE", weightPct: 25, enabled: true },
  { id: "lib-rsiband", label: "Healthy momentum (RSI 45–70)", category: "setup", metric: "rsi14", dateRange: "Current", operator: "between", value: [45, 70], weightPct: 25, enabled: true },
  { id: "lib-lowdebt", label: "Low leverage (D/E ≤ 1)", category: "risk", metric: "debtToEquity", dateRange: "Most Recent Quarter", operator: "<=", value: 1, weightPct: 25, enabled: true },
  { id: "lib-calmvix", label: "Calm market (VIX ≤ 25)", category: "risk", metric: "vix", dateRange: "Current", operator: "<=", value: 25, weightPct: 25, enabled: true },
  { id: "lib-poscap", label: "Position cap 25%", category: "position", metric: "weightPct", dateRange: "Current", operator: "<=", value: 25, weightPct: 50, enabled: true },
  { id: "lib-stoploss", label: "Stop-loss line (P&L ≥ -15)", category: "trade", metric: "openPnlPct", dateRange: "Current", operator: ">=", value: -15, weightPct: 50, enabled: true },
];

// Default category blend (each category's share of total conviction; sums to
// 100). Thesis/Technical/Risk come straight from the Configure-card design
// (55 / 12 / 15); Position, Trade, and Hold Timeframe split the remaining 18
// the way an expert Value/Growth/Dividend investor weighs them. See
// docs/strategy-forge.md.
export const DEFAULT_CATEGORY_WEIGHTS: CategoryWeights = {
  thesis: 55,
  setup: 12,
  risk: 15,
  position: 8,
  trade: 6,
  timeframe: 4,
};

// Every category ships with a built-in "All Active Chips" tag — the full chip
// set, i.e. strict full-category scoring. Not deletable; weight fixed at 100.
export function buildSystemTags(prefix: string): RuleTag[] {
  const copy: Record<RuleCategory, { purpose: string; autoApply: string }> = {
    thesis: {
      purpose: "Scores the stock against the full fundamental rule chip set.",
      autoApply: "Apply when the user wants strict full-strategy scoring instead of tag-based scoring.",
    },
    setup: {
      purpose: "Scores the stock against every active technical rule chip.",
      autoApply: "Apply when the user wants strict full-technical scoring instead of tag-based scoring.",
    },
    risk: {
      purpose: "Scores the stock against every active risk rule chip.",
      autoApply: "Apply when the user wants strict full-risk scoring instead of tag-based scoring.",
    },
    position: {
      purpose: "Scores the stock against every active position sizing rule chip.",
      autoApply: "Apply when the user wants strict full-sizing scoring instead of tag-based scoring.",
    },
    trade: {
      purpose: "Scores the stock against every active trade management rule chip.",
      autoApply: "Apply when the user wants strict full-trade scoring instead of tag-based scoring.",
    },
    timeframe: {
      purpose: "Scores the stock against every active hold-timeframe rule chip.",
      autoApply: "Apply when the user wants strict full-timeframe scoring instead of tag-based scoring.",
    },
  };
  return (Object.keys(copy) as RuleCategory[]).map((category) => ({
    id: `${prefix}-all-${category}`,
    label: "All Active Chips",
    category,
    purpose: copy[category].purpose,
    chipIds: [],
    weightPct: 100,
    autoApply: copy[category].autoApply,
    system: true,
  }));
}

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
    strategyId: "value-growth-dividend",
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
    strategyId: "aggressive-ai-high-beta",
    holdings: [
      { ticker: "SOFI", shares: 10, entryDate: "2026-06-24" },
      { ticker: "RGTI", shares: 3, entryDate: "2026-06-23" },
    ],
  },
  {
    id: "bkt-spec",
    name: "Speculative Runners",
    portfolioId: "deric",
    strategyId: "aggressive-ai-high-beta",
    holdings: [{ ticker: "ACHR", shares: 75, entryDate: "2026-05-14" }],
  },
  {
    id: "bkt-review",
    name: "Thesis Review",
    portfolioId: "deric",
    strategyId: "value-growth-dividend",
    holdings: [{ ticker: "CRM", shares: 2, entryDate: "2025-11-10" }],
  },
];
