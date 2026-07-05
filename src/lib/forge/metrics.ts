import type { MetricKey, RuleCategory, RuleOperator } from "../../types";

// ---------------------------------------------------------------------------
// Metric registry — the single source of truth for every data point a rule chip
// can test. Powers the chip-editor dropdowns (which metrics, which operators,
// what units) and tells the scoring engine where to read each value from.
//
// DUAL TERMINOLOGY (see docs/strategy-forge.md): every metric carries a
// `label` (standard industry term) and a `plainLabel` (beginner-friendly), so
// the UI can speak to both new and experienced investors.
//
// To add a live metric later: add the key to `MetricKey` (types.ts), seed it in
// the snapshots (data.ts) behind the dataSource seam, and register it here.
// ---------------------------------------------------------------------------

export type MetricSource = "fundamental" | "technical" | "position" | "market";
export type MetricFormat = "number" | "percent" | "ratio" | "price" | "text";

export interface MetricMeta {
  key: MetricKey;
  label: string; // standard term, e.g. "EPS Growth (YoY)"
  plainLabel: string; // beginner-friendly, e.g. "Earnings growing"
  hint: string; // one-line explanation for the chip editor
  category: RuleCategory; // the category this metric naturally belongs to
  source: MetricSource; // which snapshot it is read from
  format: MetricFormat;
  unit?: string; // "%", "x", "$"
  operators: RuleOperator[];
  // Whether a higher value is "better" — drives sensible operator defaults and
  // copy. Left undefined for band metrics like RSI where the middle is best.
  higherIsBetter?: boolean;
}

const NUMERIC_OPS: RuleOperator[] = [">", ">=", "<", "<=", "between"];

export const METRICS: Record<MetricKey, MetricMeta> = {
  // ---- Fundamentals (Thesis Fit) ----
  epsTtm: {
    key: "epsTtm",
    label: "EPS (TTM)",
    plainLabel: "Profitable",
    hint: "Trailing 12-month earnings per share. Above 0 means the company makes a profit.",
    category: "thesis",
    source: "fundamental",
    format: "price",
    unit: "$",
    operators: NUMERIC_OPS,
    higherIsBetter: true,
  },
  epsGrowthPct: {
    key: "epsGrowthPct",
    label: "EPS Growth (YoY)",
    plainLabel: "Earnings growing",
    hint: "How fast earnings per share are growing year over year.",
    category: "thesis",
    source: "fundamental",
    format: "percent",
    unit: "%",
    operators: NUMERIC_OPS,
    higherIsBetter: true,
  },
  revenueGrowthPct: {
    key: "revenueGrowthPct",
    label: "Revenue Growth (YoY)",
    plainLabel: "Sales growing",
    hint: "How fast the top line (sales) is growing year over year.",
    category: "thesis",
    source: "fundamental",
    format: "percent",
    unit: "%",
    operators: NUMERIC_OPS,
    higherIsBetter: true,
  },
  grossMarginPct: {
    key: "grossMarginPct",
    label: "Gross Margin",
    plainLabel: "Keeps most of each sale",
    hint: "Share of revenue left after the direct cost of goods. Higher = more pricing power.",
    category: "thesis",
    source: "fundamental",
    format: "percent",
    unit: "%",
    operators: NUMERIC_OPS,
    higherIsBetter: true,
  },
  netMarginPct: {
    key: "netMarginPct",
    label: "Net Margin",
    plainLabel: "Turns sales into profit",
    hint: "Share of revenue that becomes bottom-line profit.",
    category: "thesis",
    source: "fundamental",
    format: "percent",
    unit: "%",
    operators: NUMERIC_OPS,
    higherIsBetter: true,
  },
  peRatio: {
    key: "peRatio",
    label: "P/E Ratio",
    plainLabel: "Price vs earnings",
    hint: "Price relative to earnings. Lower can mean cheaper, but context matters.",
    category: "thesis",
    source: "fundamental",
    format: "ratio",
    unit: "x",
    operators: NUMERIC_OPS,
    higherIsBetter: false,
  },
  debtToEquity: {
    key: "debtToEquity",
    label: "Debt / Equity",
    plainLabel: "Borrowing load",
    hint: "How much debt the company carries vs equity. Lower = safer balance sheet.",
    category: "risk",
    source: "fundamental",
    format: "ratio",
    unit: "x",
    operators: NUMERIC_OPS,
    higherIsBetter: false,
  },
  fcfMarginPct: {
    key: "fcfMarginPct",
    label: "Free Cash Flow Margin",
    plainLabel: "Generates real cash",
    hint: "Share of revenue that becomes free cash flow — the cash a business actually keeps.",
    category: "thesis",
    source: "fundamental",
    format: "percent",
    unit: "%",
    operators: NUMERIC_OPS,
    higherIsBetter: true,
  },

  // ---- Technicals (Setup / Timing) ----
  weeklyRsi: {
    key: "weeklyRsi",
    label: "RSI (Weekly)",
    plainLabel: "Momentum strength",
    hint: "0–100 momentum gauge. ~30 is oversold, ~70 is overbought; the middle band is healthy.",
    category: "setup",
    source: "technical",
    format: "number",
    operators: NUMERIC_OPS,
  },
  priceVsVwapPct: {
    key: "priceVsVwapPct",
    label: "Price vs VWAP",
    plainLabel: "Above average price",
    hint: "How far price is above/below the volume-weighted average price.",
    category: "setup",
    source: "technical",
    format: "percent",
    unit: "%",
    operators: NUMERIC_OPS,
    higherIsBetter: true,
  },
  priceVs10EmaPct: {
    key: "priceVs10EmaPct",
    label: "Price vs 10 EMA",
    plainLabel: "Above short-term trend",
    hint: "How far price is above/below the 10-period moving average.",
    category: "setup",
    source: "technical",
    format: "percent",
    unit: "%",
    operators: NUMERIC_OPS,
    higherIsBetter: true,
  },
  priceVs20EmaPct: {
    key: "priceVs20EmaPct",
    label: "Price vs 20 EMA",
    plainLabel: "Above mid-term trend",
    hint: "How far price is above/below the 20-period moving average.",
    category: "setup",
    source: "technical",
    format: "percent",
    unit: "%",
    operators: NUMERIC_OPS,
    higherIsBetter: true,
  },
  priceVs50EmaPct: {
    key: "priceVs50EmaPct",
    label: "Price vs 50 EMA",
    plainLabel: "Above long-term trend",
    hint: "How far price is above/below the 50-period moving average.",
    category: "setup",
    source: "technical",
    format: "percent",
    unit: "%",
    operators: NUMERIC_OPS,
    higherIsBetter: true,
  },

  // ---- Position / holding ----
  weightPct: {
    key: "weightPct",
    label: "Position Weight",
    plainLabel: "Share of portfolio",
    hint: "How much of the book this name represents. Caps keep any one position in check.",
    category: "position",
    source: "position",
    format: "percent",
    unit: "%",
    operators: NUMERIC_OPS,
    higherIsBetter: false,
  },
  openPnlPct: {
    key: "openPnlPct",
    label: "Open P&L %",
    plainLabel: "Current gain / loss",
    hint: "Unrealized profit or loss vs your average cost.",
    category: "trade",
    source: "position",
    format: "percent",
    unit: "%",
    operators: NUMERIC_OPS,
    higherIsBetter: true,
  },

  // ---- Market context (Risk Rules) ----
  vix: {
    key: "vix",
    label: "VIX",
    plainLabel: "Market fear gauge",
    hint: "Expected market volatility. Higher = more fear/turbulence.",
    category: "risk",
    source: "market",
    format: "number",
    operators: NUMERIC_OPS,
    higherIsBetter: false,
  },
  spyRsi: {
    key: "spyRsi",
    label: "S&P 500 RSI",
    plainLabel: "Market momentum",
    hint: "Momentum of the broad market (SPY). Confirms whether the tide is with you.",
    category: "risk",
    source: "market",
    format: "number",
    operators: NUMERIC_OPS,
  },

  // ---- Qualitative ----
  timeframe: {
    key: "timeframe",
    label: "Intended Timeframe",
    plainLabel: "Holding horizon",
    hint: "Whether the name is managed on the strategy's intended timeline.",
    category: "timeframe",
    source: "position",
    format: "text",
    operators: ["is"],
  },
};

export const ALL_METRICS: MetricMeta[] = Object.values(METRICS);

export function metricsForCategory(category: RuleCategory): MetricMeta[] {
  return ALL_METRICS.filter((metric) => metric.category === category);
}

// Order + human labels for the six categories (used by the registry consumers
// and the Forge UI). Kept here so category metadata has one home.
export const CATEGORY_META: Record<
  RuleCategory,
  { label: string; plainLabel: string; question: string }
> = {
  thesis: {
    label: "Thesis Fit",
    plainLabel: "Does it belong?",
    question: "Does this ticker belong in the strategy?",
  },
  timeframe: {
    label: "Timeframe",
    plainLabel: "Right horizon?",
    question: "Is the holding being managed on the intended timeline?",
  },
  position: {
    label: "Position Size",
    plainLabel: "Right size?",
    question: "Is the allocation inside the intended range?",
  },
  setup: {
    label: "Setup / Timing",
    plainLabel: "Right setup?",
    question: "Does the current market/chart setup support the strategy?",
  },
  risk: {
    label: "Risk Rules",
    plainLabel: "Within limits?",
    question: "Is the position still inside the user's risk limits?",
  },
  trade: {
    label: "Trade Management",
    plainLabel: "Acting on plan?",
    question: "Is the user adding, trimming, holding, or exiting per plan?",
  },
};

export const CATEGORY_ORDER: RuleCategory[] = [
  "thesis",
  "setup",
  "risk",
  "position",
  "trade",
  "timeframe",
];
