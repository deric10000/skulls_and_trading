export type PageId = "home" | "dashboard" | "strategy-forge";

export type StatusType =
  | "Bullish"
  | "Bearish"
  | "Caution"
  | "Watching"
  | "Breakout"
  | "Pullback";

export type SignalTone = "positive" | "neutral" | "negative";

export type SignalState =
  | "Strong Buy"
  | "Buy"
  | "Watch"
  | "Hold"
  | "Trim"
  | "Sell"
  | "Avoid";

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
