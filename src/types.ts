export type StatusType =
  | "Bullish"
  | "Caution"
  | "Watching"
  | "Breakout"
  | "Pullback";

export type SignalTone = "positive" | "neutral" | "negative";

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
  whyWatching: string;
  whatChanged: string;
  invalidation: string;
  nextAction: string;
  timestamp: string;
}

export type SectionId =
  | "home"
  | "dashboard"
  | "watchlist"
  | "strategy"
  | "log"
  | "signals";
