import type { SignalResult, SignalState, SignalTone, Strategy } from "../types";

const STATE_TONE: Record<SignalState, SignalTone> = {
  "Strong Buy": "positive",
  Buy: "positive",
  Watch: "neutral",
  Hold: "neutral",
  Trim: "negative",
  Sell: "negative",
  Avoid: "negative",
};

// Believable placeholder weighting. This is intentionally simple mock logic
// (no real market data) so assigning/removing strategies visibly moves the signal.
const STRATEGY_WEIGHT: Record<string, number> = {
  "aggressive-growth": 2,
  momentum: 2,
  "breakout-watch": 1,
  "pullback-entry": 1,
  "trend-rider": 2,
  "volume-confirmation": 1,
  "long-term-compounder": 1,
  "ai-infrastructure": 1,
  "speculative-runner": 1,
  "risk-off": -3,
  "broken-thesis": -4,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function stateForScore(score: number): SignalState {
  if (score >= 5) return "Strong Buy";
  if (score >= 3) return "Buy";
  if (score >= 1) return "Watch";
  if (score === 0) return "Hold";
  if (score >= -2) return "Trim";
  if (score >= -4) return "Sell";
  return "Avoid";
}

function has(ids: string[], id: string): boolean {
  return ids.includes(id);
}

export function computeSignal(
  strategyIds: string[],
  strategies: Strategy[],
): SignalResult {
  const active = strategies.filter(
    (strategy) => strategyIds.includes(strategy.id) && strategy.enabled,
  );
  const stack = active.map((strategy) => strategy.name);

  if (active.length === 0) {
    return {
      state: "Hold",
      tone: "neutral",
      confidence: 50,
      strategyStack: [],
      reason: "No strategy assigned yet. Assign strategies to generate a signal.",
      invalidation: "Not applicable until a strategy is assigned.",
      nextLevel: "Assign at least one strategy from Strategy Forge.",
    };
  }

  const activeIds = active.map((strategy) => strategy.id);
  const score = activeIds.reduce(
    (total, id) => total + (STRATEGY_WEIGHT[id] ?? 0),
    0,
  );

  // Defensive / broken-thesis combination takes priority for exits.
  if (has(activeIds, "broken-thesis") && has(activeIds, "risk-off")) {
    return {
      state: "Trim",
      tone: "negative",
      confidence: 68,
      strategyStack: stack,
      reason:
        "Thesis is breaking down and macro is risk-off. Reduce exposure and protect capital.",
      invalidation: "A reclaim of the prior range with the thesis intact.",
      nextLevel: "Trim into strength; avoid adding until the trend repairs.",
    };
  }

  // Aggressive growth + momentum + volume confirmation reads as a breakout watch.
  if (
    has(activeIds, "aggressive-growth") &&
    has(activeIds, "momentum") &&
    has(activeIds, "volume-confirmation")
  ) {
    return {
      state: "Watch",
      tone: "neutral",
      confidence: 72,
      strategyStack: stack,
      reason:
        "Price trend is improving, volume is supportive, and the thesis remains intact.",
      invalidation: "A break below key support on rising volume.",
      nextLevel: "Watch for a breakout above near-term resistance.",
    };
  }

  const state = stateForScore(score);
  const confidence = clamp(54 + Math.abs(score) * 6, 50, 90);

  const reason =
    score > 0
      ? "Assigned strategies lean constructive; trend and participation are supportive."
      : score < 0
        ? "Assigned strategies lean defensive; risk controls take priority."
        : "Mixed signals from the assigned strategies. No decisive edge right now.";

  const invalidation =
    score >= 0
      ? "A loss of trend or a break below key support."
      : "A reclaim of trend with the thesis re-validated.";

  const nextLevel =
    score >= 0
      ? "Watch the next resistance level for continuation."
      : "Watch support; reassess if it fails to hold.";

  return {
    state,
    tone: STATE_TONE[state],
    confidence,
    strategyStack: stack,
    reason,
    invalidation,
    nextLevel,
  };
}
