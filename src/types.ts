export type PageId = "home" | "dashboard" | "strategy-forge";

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
}

export interface EducationCard {
  title: string;
  body: string;
}
