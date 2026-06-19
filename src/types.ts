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

// Watchlist plan labels (per product-voice.md). These describe how a name lines up
// with the user's OWN rules — never a buy/sell recommendation.
export type StatusType =
  | "Aligned"
  | "Watch"
  | "Review"
  | "Rule Check"
  | "Risk Check"
  | "Thesis Needed"
  | "Trim Review"
  | "Exit Review";

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
  price: number;
  changePct: number;
  status: StatusType;
  conviction: number;
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
}

export type StrategyAssignments = Record<string, string[]>;

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
