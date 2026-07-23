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
  | "No Strategy"
  | "Rule Conflict"
  | "Rule Break"
  | "Concentration Review"
  | "Patience Review"
  // Layer 3 — user-driven zone overlays (Trim/Add on tickers; Go to Cash on portfolio)
  | "Trim Zone"
  | "Add Zone"
  | "Go to Cash";

/** Forge status: Layer 1 conviction band + Layer 2 category diagnostics +
 *  Layer 3 zone overlays when zone chips fail (see evaluateZoneFlags). */
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
  /** GICS sector key, or null when live taxonomy is not mapped yet. */
  sector: string | null;
  /** GICS industry key, or null when live taxonomy is not mapped yet. */
  industry: string | null;
  lastPrice: number;
  /**
   * When `lastPrice` was captured (ISO). MOCK: one-time seed (e.g. 2026-07-14).
   * LIVE: provider quote time / candle close — see DataSource.getQuote().
   */
  priceAsOf: string;
  analysis: TickerAnalysis;
  logs: LogEntry[];
}

/** Quote seam shape — today merged from TICKERS; later a live /quote API. */
export interface TickerQuote {
  ticker: string;
  lastPrice: number;
  asOf: string;
  source: "mock" | "live";
}

export type QtySide = "buy" | "sell";

/**
 * How a ledger event maps to plan intent (Trim / Add / Go to Cash / Hold).
 * Stamped at write time for later adherence analytics — does not change
 * Layer 3 zone scoring math.
 */
export type TransactionActionClass =
  | "trim"
  | "add"
  | "hold"
  | "go_to_cash"
  | "deposit"
  | "withdrawal"
  | "unclassified";

/**
 * Session (later: API) record of a confirmed qty fill. Lives beside portfolios
 * so a live ledger can replace seed without reshaping holdings.
 * Prefer `PortfolioTransaction` for new code; legacy rows omit `kind`.
 */
export interface ShareFillEvent {
  id: string;
  portfolioId: string;
  ticker: string;
  side: QtySide;
  /** Absolute share count bought or sold. */
  deltaShares: number;
  sharesBefore: number;
  sharesAfter: number;
  fillPrice: number;
  /** ISO — floored to 15m candle close (EST) for fill-price proximity. */
  filledAt: string;
  source: "mock" | "live";
  /** Discriminator when stored in the unified ledger (`qty`). */
  kind?: "qty";
  actionClass?: TransactionActionClass;
  strategyIds?: string[];
  /** Layer 3 zone statuses active at fill time (read-only stamp). */
  zoneHints?: StatusType[];
}

/** Cash edit recorded from Current Watch portfolio edit mode. */
export interface CashTransactionEvent {
  id: string;
  kind: "cash";
  portfolioId: string;
  cashBefore: number;
  cashAfter: number;
  deltaCash: number;
  filledAt: string;
  source: "mock" | "live";
  actionClass?: TransactionActionClass;
  strategyIds?: string[];
  zoneHints?: StatusType[];
}

/** Unified portfolio ledger entry (qty fills + cash edits). */
export type PortfolioTransaction =
  | (ShareFillEvent & { kind: "qty" })
  | CashTransactionEvent;

/** Editable review row before committing qty changes from Current Watch edit. */
export interface PendingQtyOrder {
  ticker: string;
  side: QtySide;
  deltaShares: number;
  sharesBefore: number;
  sharesAfter: number;
  fillPrice: number;
  filledAt: string;
}

/** Manual cash bump reviewed before confirm (deposit / withdrawal). */
export interface PendingCashEdit {
  side: "deposit" | "withdrawal";
  cashBefore: number;
  cashAfter: number;
  deltaCash: number;
  filledAt: string;
}

// Holding-level facts that belong to a specific portfolio (cost basis, size, and
// how the name aligns with THAT portfolio's assigned strategy).
export interface PortfolioHolding {
  ticker: string;
  shares: number;
  avgPrice: number; // average cost (DCA); drives Open P&L with last price
  /** Cached open P&L % — prefer recomputing from last vs avg when displaying. */
  openPnlPct: number;
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
  /**
   * Settled cash available to deploy (not invested in holdings). Omitted or 0
   * on watchlists. Included in Current Watch running Total.
   */
  cashAvailable?: number;
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
   * Categories that contribute to conviction. Omitted keys default to enabled.
   * `false` excludes the category from scoring / enabled weight totals; its
   * `categoryWeights` entry is parked (kept for restore) until re-enabled.
   */
  categoryEnabled?: Partial<Record<RuleCategory, boolean>>;
  /**
   * Layer 3 zone overlays — independent chip/tag copies. A zone fires when any
   * active chip fails (`evaluateZoneFlags`); never read for conviction math.
   * Trim/Add → ticker labels; Go to Cash → portfolio badge only.
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
  /** One or more ET session boundaries checked in addition to candle cadence. */
  sessionCloseChecks?: SessionCloseInterval[];
  technicalsInterval?: CheckInterval; // candle size (UI: candle-only); >= 1h
  /**
   * Notification preference master switch. Strategy checks always run on the
   * configured cadence; delivery channels remain future capability.
   */
  cadenceEnabled?: boolean;
  /**
   * Per-notification-type toggles for the cadence feature (all default off).
   * `autoRefresh` is retained only for persisted-workspace compatibility.
   * Email/text/browser remain Future Capability with no delivery backend.
   */
  cadenceNotify?: {
    autoRefresh?: boolean;
    email?: boolean;
    text?: boolean;
    browser?: boolean;
  };
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

// The date range / Time a chip's data point reflects. Fundamentals use fiscal
// labels; timeframed technicals use CandleInterval values in this same field
// (UI column header: "Time").
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
  | "5D"
  // Candle intervals for timeframed technical indicators (chip Time column)
  | "15m"
  | "30m"
  | "1h"
  | "2h"
  | "4h"
  | "1D"
  | "1W";

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
  // Technicals — timeframed (indicator + chip Time = candle size)
  | "rsi"
  | "stochK"
  | "stochD"
  | "stochRsi"
  | "williamsR"
  | "cci"
  | "macdHistogram"
  | "macdLine"
  | "macdSignal"
  | "roc"
  | "priceAboveSma20"
  | "priceAboveSma50"
  | "priceAboveSma200"
  | "priceVsEma10Pct"
  | "priceVsEma20Pct"
  | "priceVsEma50Pct"
  | "adx"
  | "plusDi"
  | "minusDi"
  | "aroonUp"
  | "aroonDown"
  | "aroonOsc"
  | "atrPct"
  | "bollingerPercentB"
  | "bollingerBandwidth"
  | "donchianPosition"
  | "relativeVolume"
  | "priceVsVwapPct"
  | "mfi"
  | "chaikinMoneyFlow"
  | "obvChange20"
  // Technicals — not timeframed (fixed daily / calendar reads)
  | "drawdownFrom52wHighPct"
  | "priceChange3mPct"
  | "daysUntilEarnings"
  // Stock risk (non-timeframed)
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

/** Metric keys that are computed per candle Time (see TimeframedIndicators). */
export type TimeframedMetricKey =
  | "rsi"
  | "stochK"
  | "stochD"
  | "stochRsi"
  | "williamsR"
  | "cci"
  | "macdHistogram"
  | "macdLine"
  | "macdSignal"
  | "roc"
  | "priceAboveSma20"
  | "priceAboveSma50"
  | "priceAboveSma200"
  | "priceVsEma10Pct"
  | "priceVsEma20Pct"
  | "priceVsEma50Pct"
  | "adx"
  | "plusDi"
  | "minusDi"
  | "aroonUp"
  | "aroonDown"
  | "aroonOsc"
  | "atrPct"
  | "bollingerPercentB"
  | "bollingerBandwidth"
  | "donchianPosition"
  | "relativeVolume"
  | "priceVsVwapPct"
  | "mfi"
  | "chaikinMoneyFlow"
  | "obvChange20";

export interface RuleChip {
  id: string;
  label: string; // user-defined, e.g. "Revenue Growth"
  category: RuleCategory;
  metric: MetricKey; // the data point being tested
  /** Fiscal/range label, or candle Time for timeframed technicals. */
  dateRange: DateRange;
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
//
// A candle size (fixed-length bar) — valid for both the check cadence and the
// technicals candle size.
export type CandleInterval =
  | "15m"
  | "30m"
  | "1h"
  | "2h"
  | "4h"
  | "1D"
  | "1W"
  | "1M";
// Intraday session-close triggers — fire once at a specific US session boundary
// (ET), not on a fixed clock interval. Check cadence only (never a candle size).
export type SessionCloseInterval =
  | "close-premarket"
  | "close-regular"
  | "close-afterhours"
  | "close-overnight";
// `checkInterval` may be a candle size OR a session-close event;
// `technicalsInterval` is candle-only (UI-enforced).
export type CheckInterval = CandleInterval | SessionCloseInterval;

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
  /**
   * Next scheduled earnings date (ISO, from Yahoo calendarEvents). Not a chip
   * metric itself — the live refresh derives technicals.daysUntilEarnings from it.
   */
  nextEarningsDate?: string | null;
  /**
   * Raw Yahoo assetProfile strings (same quoteSummary call as fundamentals —
   * no extra Yahoo request). Mapped client-side to GICS via weather/yahooTaxonomy.
   * Not scored by Forge.
   */
  providerSector?: string | null;
  providerIndustry?: string | null;
  asOf: string; // ISO date the snapshot reflects
  source: MarketDataSource;
  // Where this snapshot's figures came from and any per-field caveats (e.g.
  // "null because X is not meaningful for this business model"). Optional,
  // free-text, for humans reviewing/refreshing the mock data — not read by
  // the scoring engine.
  sourceNotes?: string;
}

/**
 * Legacy daily (and weekly RSI) technical snapshot — mock seeds + Worker daily
 * payload still use these field names. Timeframed chip metrics read from
 * `TimeframedIndicators` via `getTechnicalsByTimeframe` instead.
 */
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

/**
 * Per-candle-Time indicator bundle. Keys match MetricKey timeframed entries.
 * Missing lookback → null ("no data"), never fabricated.
 */
export interface TimeframedIndicators {
  rsi: MetricValue;
  stochK: MetricValue;
  stochD: MetricValue;
  stochRsi: MetricValue;
  williamsR: MetricValue;
  cci: MetricValue;
  macdHistogram: MetricValue;
  macdLine: MetricValue;
  macdSignal: MetricValue;
  roc: MetricValue;
  priceAboveSma20: MetricValue;
  priceAboveSma50: MetricValue;
  priceAboveSma200: MetricValue;
  priceVsEma10Pct: MetricValue;
  priceVsEma20Pct: MetricValue;
  priceVsEma50Pct: MetricValue;
  adx: MetricValue;
  plusDi: MetricValue;
  minusDi: MetricValue;
  aroonUp: MetricValue;
  aroonDown: MetricValue;
  aroonOsc: MetricValue;
  atrPct: MetricValue;
  bollingerPercentB: MetricValue;
  bollingerBandwidth: MetricValue;
  donchianPosition: MetricValue;
  relativeVolume: MetricValue;
  priceVsVwapPct: MetricValue;
  mfi: MetricValue;
  chaikinMoneyFlow: MetricValue;
  obvChange20: MetricValue;
  asOf: string;
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
