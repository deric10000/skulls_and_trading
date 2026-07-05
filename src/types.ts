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
  | "Risk Check"
  | "Thesis Check";

// Market Weather statuses (plan-safe market mood, used in the Market Weather widget).
export type MarketWeatherStatus =
  | "Calm Waters"
  | "Storm Watch"
  | "Risk-On Tide"
  | "Choppy Seas"
  | "Rotation Current"
  | "Breakout Wind"
  | "Defensive Harbor";

// Strategy Check states (canonical action-state mapping in product-voice.md). These
// reflect alignment with the user's strategy, not investment advice.
export type SignalState =
  | "High Alignment"
  | "Entry Aligned"
  | "Watch Setup"
  | "Hold Plan"
  | "Trim Review"
  | "Exit Review"
  | "Review Risk"
  | "Rule Conflict"
  | "Rule Break"
  | "Thesis Missing";

export interface WatchlistItem {
  ticker: string;
  name: string;
  price: number; // last price
  changePct: number; // open P&L % (positive → green, negative → red)
  status: StatusType;
  conviction: number;
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
  rules?: RuleChip[];
  thesis?: ThesisLogic; // how the Thesis Fit chips combine (AND-groups / OR)
  categoryWeights?: CategoryWeights; // blend weights; defaults are Thesis-heavy
  checkInterval?: CheckInterval; // re-score + notify cadence; default "1D"
  technicalsInterval?: CheckInterval; // candle size; >= checkInterval and >= 15m
}

export type StrategyAssignments = Record<string, string[]>;

// ---- Strategy Forge: rule-chip engine ----
// The six rule categories. Each produces a 0–100 sub-score; conviction is their
// weighted blend (see docs/strategy-forge.md).
export type RuleCategory =
  | "thesis"
  | "timeframe"
  | "position"
  | "setup"
  | "risk"
  | "trade";

export type RuleOperator = ">" | ">=" | "<" | "<=" | "between" | "is";

// Keys into the metric registry (src/lib/forge/metrics.ts). Kept as a string
// union so the registry, chip editor, and snapshots stay in sync.
export type MetricKey =
  // Fundamentals
  | "epsTtm"
  | "epsGrowthPct"
  | "revenueGrowthPct"
  | "grossMarginPct"
  | "netMarginPct"
  | "peRatio"
  | "debtToEquity"
  | "fcfMarginPct"
  // Technicals
  | "weeklyRsi"
  | "priceVsVwapPct"
  | "priceVs10EmaPct"
  | "priceVs20EmaPct"
  | "priceVs50EmaPct"
  // Position / holding
  | "weightPct"
  | "openPnlPct"
  // Market context
  | "vix"
  | "spyRsi"
  // Qualitative (string "is" match), e.g. intended timeframe
  | "timeframe";

export interface RuleChip {
  id: string;
  label: string; // user-defined, e.g. "Strong EPS growth"
  category: RuleCategory;
  metric: MetricKey;
  operator: RuleOperator;
  value: number | [number, number] | string;
  weight: number; // 1..5 contribution within its category
  enabled: boolean;
}

// Thesis = boolean composite: chips AND-ed inside a group, groups OR-ed together.
export interface ThesisLogic {
  groups: string[][]; // arrays of RuleChip ids
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
  epsTtm: MetricValue;
  epsGrowthPct: MetricValue;
  revenueGrowthPct: MetricValue;
  grossMarginPct: MetricValue;
  netMarginPct: MetricValue;
  peRatio: MetricValue;
  debtToEquity: MetricValue;
  fcfMarginPct: MetricValue;
  asOf: string; // ISO date the snapshot reflects
  source: MarketDataSource;
}

export interface TechnicalSnapshot {
  weeklyRsi: MetricValue;
  priceVsVwapPct: MetricValue;
  priceVs10EmaPct: MetricValue;
  priceVs20EmaPct: MetricValue;
  priceVs50EmaPct: MetricValue;
  asOf: string;
  source: MarketDataSource;
}

export interface MarketContext {
  vix: MetricValue;
  spyRsi: MetricValue;
  asOf: string;
  source: MarketDataSource;
}

export interface SignalResult {
  state: SignalState;
  tone: SignalTone;
  confidence: number;
  strategyStack: string[];
  reason: string;
  invalidation: string;
  nextLevel: string;
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
