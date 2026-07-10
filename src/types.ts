export type PageId =
  | "home"
  | "dashboard"
  | "strategy-forge"
  | "ships"
  | "captain-profile";

// ---- Scores (discipline-first) ----
export type ScoreKey =
  | "discipline"
  | "risk"
  | "research"
  | "review"
  | "progress";

export interface ScoreMetric {
  key: ScoreKey;
  label: string;
  value: number;
  max: number;
  tagline: string;
  trend: SignalTone;
  trendLabel: string;
}

// ---- Badges / progression (behavior only, never investment signals) ----
export type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary";
export type BadgeState = "locked" | "in-progress" | "earned";

export interface Badge {
  id: string;
  name: string;
  description: string;
  rarity: Rarity;
  state: BadgeState;
  progress?: number;
}

// ---- Captain profile ----
export type TradingStyle =
  | "Long-Term Investor"
  | "Swing Trader"
  | "Day Trader"
  | "Mixed";
export type RiskProfile = "Conservative" | "Balanced" | "Aggressive";
export type TimeHorizon = "Days" | "Weeks" | "Months" | "Years";
export type PrivacyMode = "Private" | "Ghost" | "Crew" | "Full Transparency";
export type PortfolioLinkStatus =
  | "Manual"
  | "CSV (soon)"
  | "Brokerage (soon)"
  | "Connected"
  | "Needs Review";

export interface CaptainProfile {
  handle: string;
  tagline: string;
  style: TradingStyle;
  risk: RiskProfile;
  horizon: TimeHorizon;
  focus: string[];
  privacy: PrivacyMode;
  portfolioLink: PortfolioLinkStatus;
}

export interface ShipMembership {
  id: string;
  name: string;
  role: "Captain" | "First Mate" | "Crew";
  members: number;
  blurb: string;
}

// ---- Treasure Ledger (portfolio tracker, discipline weighted over P/L) ----
export interface PortfolioMetric {
  key: string;
  label: string;
  value: string;
  tagline: string;
  tone: SignalTone;
  emphasis?: boolean;
}

export interface Position {
  ticker: string;
  name: string;
  weightPct: number;
  changePct: number;
  planLabel: StatusType;
  note: string;
}

export interface Allocation {
  label: string;
  pct: number;
  tone: SignalTone;
}

export interface RiskRule {
  label: string;
  detail: string;
  status: SignalTone;
}

// ---- Ships (crews) ----
export interface Ship {
  id: string;
  name: string;
  blurb: string;
  members: number;
  privacy: "Open" | "Invite Only" | "Private";
  focus: string;
}

export interface ShipMember {
  id: string;
  name: string;
  role: "Captain" | "First Mate" | "Crew";
  disciplineScore: number;
  streakDays: number;
}

export interface ShipLeaderboardRow {
  id: string;
  category: string;
  leader: string;
  detail: string;
}

export interface WeeklyReviewItem {
  id: string;
  prompt: string;
  status: "Open" | "Submitted";
}

export interface SharedLog {
  id: string;
  author: string;
  ship: string;
  note: string;
  timestamp: string;
}

export type SignalTone = "positive" | "neutral" | "warning" | "negative";

// Watchlist / portfolio alignment statuses (per product-voice.md). They describe how a
// name lines up with the selected portfolio's assigned strategy — never a buy/sell
// recommendation.
export type StatusType =
  | "High Alignment"
  | "Aligned"
  | "Watch"
  | "Review"
  | "Watch Setup"
  | "Hold Plan"
  | "Trim Review"
  | "Exit Review"
  | "Review Risk"
  | "Risk Drift"
  | "Risk Check"
  | "Thesis Check"
  | "Rule Conflict"
  | "Rule Break"
  | "Concentration Review"
  | "Patience Review"
  // Layer 3 — user-driven zone overlays (registered; not emitted by resolveStatus yet)
  | "Trim Zone"
  | "Add Zone"
  | "Go to Cash";

/** Forge status: Layer 1 conviction band + Layer 2 category diagnostics.
 *  Layer 3 zone overlays (Trim Zone / Add Zone / Go to Cash) are in StatusType
 *  for tone/icon coverage but are not resolved or displayed until wired. */
export interface ResolvedStatus {
  primary: StatusType;
  categoryFlags: StatusType[];
  baseBand: StatusType;
  conviction: number;
}

// Market Weather statuses (plan-safe market mood, used in the Market Weather widget).
export type MarketWeatherStatus =
  | "Calm Waters"
  | "Storm Watch"
  | "Risk-On Tide"
  | "Choppy Seas"
  | "Rotation Current"
  | "Breakout Wind"
  | "Defensive Harbor";

export interface WatchlistItem {
  ticker: string;
  name: string;
  price: number; // last price
  changePct: number; // open P&L % (positive → green, negative → red)
  status: StatusType;
  conviction: number;
  resolved?: ResolvedStatus;
  shares: number; // mock share count (0 for watch-only names)
  avgPrice: number; // DCA / average cost (0 for watch-only names)
  reason: string; // why this name carries its current alignment status
}

export interface SignalChip {
  label: string;
  tone: SignalTone;
}

export interface TickerAnalysis {
  setupSummary: string;
  thesis: string;
  risk: string;
  catalyst: string;
  signals: SignalChip[];
  investorView: string;
  traderView: string;
}

export interface LogEntry {
  id: string;
  title: string;
  note: string;
  strategy?: string;
  timestamp: string;
}

// ---- Ticker / portfolio mock data (single source of truth) ----
// Company-level facts that are the same regardless of who holds the name.
export interface TickerInfo {
  company: string; // "Nvidia"
  category: string; // "AI Infrastructure"
  sector: string; // Market Weather parent sector, e.g. "Technology"
  industry: string; // Market Weather peer group, e.g. "Semiconductors"
  lastPrice: number;
  analysis: TickerAnalysis;
  logs: LogEntry[];
}

// Holding-level facts that belong to a specific portfolio (cost basis, size, and
// how the name aligns with THAT portfolio's assigned strategy).
export interface PortfolioHolding {
  ticker: string;
  shares: number;
  avgPrice: number; // DCA / average cost
  openPnlPct: number; // open profit/loss vs. avg price
  conviction: number;
  status: StatusType; // alignment with the portfolio's assigned strategy
  reason: string;
  strategyIds: string[]; // drives the dashboard Strategy Check signal
}

export interface Portfolio {
  id: string;
  label: string;
  // A "portfolio" is a (future) live-connected brokerage account; a "watchlist" is
  // user-curated and can add tickers manually.
  type: "portfolio" | "watchlist";
  strategyId?: string; // the strategy this portfolio is run against
  holdings: PortfolioHolding[];
}

export type Timeframe = "Swing" | "Long Term" | "Speculation";

export type DecisionSignal = "Thesis" | "Volume" | "Catalyst" | "Risk / Reward";

export type ExitRule = "Break Thesis" | "Lose Trend" | "Hit Target" | "Macro Changes";

export interface Strategy {
  id: string;
  name: string;
  description: string;
  isDefault: boolean;
  enabled: boolean;
  timeframe: Timeframe[];
  tags: string[];
  decisionSignals: DecisionSignal[];
  exitLogic: ExitRule[];
  // ---- Strategy Forge rule-chip engine ----
  // Optional until a strategy is "forged" with rule chips; the scoring engine
  // falls back to sensible defaults when these are absent.
  thesisDescription?: string; // the written thesis the rule chips quantify
  rules?: RuleChip[];
  ruleTags?: RuleTag[]; // reusable chip groups ("lenses") per category
  categoryWeights?: CategoryWeights; // each category's share of conviction; sums to 100
  /**
   * Layer 3 zone overlays — independent chip/tag copies used only to decide
   * when Trim Zone / Add Zone / Go to Cash labels fire. Never read by
   * scoreStock / validateStrategy / conviction math.
   */
  trimZoneRules?: RuleChip[];
  trimZoneTags?: RuleTag[];
  addZoneRules?: RuleChip[];
  addZoneTags?: RuleTag[];
  goToCashRules?: RuleChip[];
  goToCashTags?: RuleTag[];
  appliedPortfolioIds?: string[]; // portfolios/watchlists this strategy is applied to
  /** Custom strategies: tickers turned off per portfolio (defaults use strategyIds on holdings). */
  tickerExclusions?: Partial<Record<string, string[]>>;
  checkInterval?: CheckInterval; // re-score + notify cadence; default "1D"
  technicalsInterval?: CheckInterval; // candle size; >= checkInterval and >= 15m
}

export type StrategyAssignments = Record<string, string[]>;

// ---- Strategy Forge: rule-chip engine ----
// The six rule categories (see docs/strategy-forge.md). Keys are stable ids;
// UI labels live in CATEGORY_META (src/lib/forge/metrics.ts):
// thesis = "Thesis & Fundamentals", setup = "Technical Analysis (Setup /
// Timing)", risk = "Risk Rules", position = "Position Size",
// timeframe = "Hold Timeframe", trade = "Trade Management" (last in UI —
// Layer 3 zone overlays live here). UI order is CATEGORY_ORDER in metrics.ts.
export type RuleCategory =
  | "thesis"
  | "timeframe"
  | "position"
  | "setup"
  | "risk"
  | "trade";

export type RuleOperator = ">" | ">=" | "<" | "<=" | "between" | "is";

// The date range a chip's data point reflects — display metadata carried on
// the chip (the mock snapshots already embody these ranges).
export type DateRange =
  | "TTM / Latest FY"
  | "Most Recent Quarter"
  | "Current"
  | "Current / TTM"
  | "5Y"
  | "1Y"
  | "3M"
  | "1M"
  | "200D"
  | "20D"
  | "14D"
  | "5D";

// Keys into the metric registry (src/lib/forge/metrics.ts). Kept as a string
// union so the registry, the table modals, and the snapshots stay in sync.
export type MetricKey =
  // Fundamentals — growth & profitability
  | "epsTtm"
  | "epsGrowthPct"
  | "revenueGrowthPct"
  | "grossMarginPct"
  | "netMarginPct"
  | "netIncome"
  | "operatingCashFlow"
  | "returnOnEquityPct"
  | "operatingMarginPct"
  | "fcfMarginPct"
  // Fundamentals — valuation
  | "peRatio"
  | "forwardPE"
  | "priceToSales"
  | "evToEbitda"
  // Fundamentals — balance sheet
  | "debtToEquity"
  | "interestCoverage"
  | "currentRatio"
  // Fundamentals — shareholder returns
  | "dividendYieldPct"
  | "payoutRatioPct"
  | "dividendGrowth5yPct"
  | "buybackYieldPct"
  // Technicals — trend / momentum / setup
  | "priceAbove200dSma"
  | "priceAbove50dSma"
  | "priceAbove20dSma"
  | "rsi14"
  | "weeklyRsi"
  | "drawdownFrom52wHighPct"
  | "priceChange3mPct"
  | "relativeVolume"
  | "priceVsVwapPct"
  | "priceVs10EmaPct"
  | "priceVs20EmaPct"
  | "priceVs50EmaPct"
  | "daysUntilEarnings"
  // Stock risk
  | "atrPct14d"
  | "beta1y"
  | "avgDollarVolume20d"
  | "sectorEtf1mChangePct"
  // Market context
  | "vix"
  | "spyRsi"
  | "spyAbove200dSma"
  | "spy5dChangePct"
  | "highYieldSpreadPct"
  | "treasury10y5dChangePct"
  // Position / holding
  | "weightPct"
  | "openPnlPct"
  | "holdingDays"
  // Qualitative (string "is" match), e.g. intended timeframe
  | "timeframe";

export interface RuleChip {
  id: string;
  label: string; // user-defined, e.g. "Revenue Growth"
  category: RuleCategory;
  metric: MetricKey; // the data point being tested
  dateRange: DateRange; // the range the data point reflects
  operator: RuleOperator; // rendered as "is at least", "is below", …
  value: number | [number, number] | string;
  weightPct: number; // Rule Weight — % importance within its category (chips sum to 100)
  enabled: boolean;
  // Captain's written response when this rule breaks / triggers a status.
  // Seeded defaults may start with "Example: " (muted in UI); the first edit
  // drops that prefix and uses normal filled-input styling.
  myPlan?: string;
  // Set only when this chip was added to a strategy FROM a saved custom chip
  // (AppState.chipLibrary) via the Add Rule picker — links this row back to
  // its library source so editing that library chip can optionally propagate
  // the change here too ("Save and Update Chip Settings Everywhere"). Never
  // set for chips copied from a system-default strategy (those are read-only
  // templates, not editable/propagatable) or for blank/from-scratch chips.
  libraryChipId?: string;
}

// A Tag is a reusable, named group of rule chips within one category — the
// "lens" a user can later apply to individual stocks. Each category carries a
// built-in "All Active Chips" system tag (the full chip set, not deletable).
export interface RuleTag {
  id: string;
  label: string; // e.g. "Quality", "Trend Health", "Market Regime Risk"
  category: RuleCategory;
  purpose: string; // what this tag confirms
  chipIds: string[]; // member rule chips (empty for the system tag = all chips)
  weightPct: number; // Tag Weight — % importance among the category's tags
  autoApply: string; // suggested auto-apply guidance copy
  // Same contract as RuleChip.myPlan — response when this tag's rules break.
  myPlan?: string;
  system?: boolean; // true for the built-in "All Active Chips" tag
}

export type CategoryWeights = Record<RuleCategory, number>;

// Cadence options ("normal trading range"). Fundamentals refresh on a fixed
// daily cadence and are intentionally NOT selectable here.
export type CheckInterval = "15m" | "30m" | "1h" | "4h" | "1D" | "1W" | "1M";

// ---- Buckets ----
// A portfolio is split into Buckets; each bucket is governed by one strategy and
// holds a share allocation of one or more tickers. A ticker may live in several
// buckets (e.g. 100 sh long in "Core Growth", 10 sh in a 15m "Momentum" bucket).
// The authoring UI is a later dashboard pass; modeled + seeded from mock now.
export interface BucketHolding {
  ticker: string;
  shares: number;
  entryDate?: string; // ISO date; editable on the dashboard later
}

export interface Bucket {
  id: string;
  name: string;
  portfolioId: string;
  strategyId: string; // the governing strategy carries the cadence + rule chips
  holdings: BucketHolding[];
}

// ---- Market data snapshots (behind the DataSource seam) ----
// Normalized + source-agnostic. Real values today (a researched snapshot), but
// swappable for a live feed without touching the scoring engine or UI.
export type MarketDataSource = "mock" | "live";

// A metric that is genuinely unavailable for a name (e.g. gross margin for a
// bank) is `null` → scored as "no data", never a silent fail.
export type MetricValue = number | null;

export interface FundamentalSnapshot {
  // Growth & profitability
  epsTtm: MetricValue;
  epsGrowthPct: MetricValue;
  revenueGrowthPct: MetricValue;
  grossMarginPct: MetricValue;
  netMarginPct: MetricValue;
  netIncome: MetricValue; // $B, TTM
  operatingCashFlow: MetricValue; // $B, TTM
  returnOnEquityPct: MetricValue;
  operatingMarginPct: MetricValue;
  fcfMarginPct: MetricValue;
  // Valuation
  peRatio: MetricValue;
  forwardPE: MetricValue;
  priceToSales: MetricValue;
  evToEbitda: MetricValue;
  // Balance sheet
  debtToEquity: MetricValue;
  interestCoverage: MetricValue; // x
  currentRatio: MetricValue;
  // Shareholder returns
  dividendYieldPct: MetricValue;
  payoutRatioPct: MetricValue;
  dividendGrowth5yPct: MetricValue;
  buybackYieldPct: MetricValue;
  asOf: string; // ISO date the snapshot reflects
  source: MarketDataSource;
  // Where this snapshot's figures came from and any per-field caveats (e.g.
  // "null because X is not meaningful for this business model"). Optional,
  // free-text, for humans reviewing/refreshing the mock data — not read by
  // the scoring engine.
  sourceNotes?: string;
}

export interface TechnicalSnapshot {
  // Trend flags (1 = true, 0 = false, null = no data)
  priceAbove200dSma: MetricValue;
  priceAbove50dSma: MetricValue;
  priceAbove20dSma: MetricValue;
  // Momentum / setup
  rsi14: MetricValue;
  weeklyRsi: MetricValue;
  drawdownFrom52wHighPct: MetricValue;
  priceChange3mPct: MetricValue;
  relativeVolume: MetricValue; // x vs 20D average
  priceVsVwapPct: MetricValue;
  priceVs10EmaPct: MetricValue;
  priceVs20EmaPct: MetricValue;
  priceVs50EmaPct: MetricValue;
  daysUntilEarnings: MetricValue;
  // Stock risk
  atrPct14d: MetricValue; // ATR as % of price
  beta1y: MetricValue;
  avgDollarVolume20d: MetricValue; // $M per day
  sectorEtf1mChangePct: MetricValue; // this name's sector ETF, 1M change
  asOf: string;
  source: MarketDataSource;
  sourceNotes?: string; // see FundamentalSnapshot.sourceNotes
}

export interface MarketContext {
  vix: MetricValue;
  spyRsi: MetricValue;
  spyAbove200dSma: MetricValue; // 1 = true, 0 = false
  spy5dChangePct: MetricValue;
  highYieldSpreadPct: MetricValue;
  treasury10y5dChangePct: MetricValue; // percentage-point change
  asOf: string;
  source: MarketDataSource;
  sourceNotes?: string; // see FundamentalSnapshot.sourceNotes
}

export interface MarketFlowStep {
  key: "market" | "sector" | "industry" | "stock";
  label: string;
  detail: string;
  tone: SignalTone;
  summary: string;
}

export interface EducationCard {
  title: string;
  body: string;
}
