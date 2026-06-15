import type { SignalResult, SignalState, SignalTone, Strategy } from "../types";

const STATE_TONE: Record<SignalState, SignalTone> = {
  "High Alignment": "positive",
  "Entry Aligned": "positive",
  "Watch Setup": "neutral",
  "Hold Plan": "neutral",
  "Trim Review": "warning",
  "Exit Review": "warning",
  "Review Risk": "warning",
  "Rule Conflict": "negative",
  "Rule Break": "negative",
  "Thesis Missing": "warning",
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
  if (score >= 5) return "High Alignment";
  if (score >= 3) return "Entry Aligned";
  if (score >= 1) return "Watch Setup";
  if (score === 0) return "Hold Plan";
  if (score >= -2) return "Trim Review";
  if (score >= -4) return "Exit Review";
  return "Rule Conflict";
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
      state: "Thesis Missing",
      tone: "warning",
      confidence: 50,
      strategyStack: [],
      reason:
        "No strategy assigned yet, so there are no rules to check this name against.",
      invalidation: "Not applicable until you assign a strategy.",
      nextLevel: "Assign at least one strategy from Strategy Forge to start the check.",
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
      state: "Exit Review",
      tone: "warning",
      confidence: 68,
      strategyStack: stack,
      reason:
        "Your thesis and risk-off rules both flag this name. Review whether it still meets your plan.",
      invalidation: "A reclaim of the prior range with the thesis intact.",
      nextLevel: "Check your exit plan before this drifts past your stated risk.",
    };
  }

  // Aggressive growth + momentum + volume confirmation reads as a breakout watch.
  if (
    has(activeIds, "aggressive-growth") &&
    has(activeIds, "momentum") &&
    has(activeIds, "volume-confirmation")
  ) {
    return {
      state: "Watch Setup",
      tone: "neutral",
      confidence: 72,
      strategyStack: stack,
      reason:
        "Trend, volume, and thesis line up with your rules — but the setup hasn't triggered yet.",
      invalidation: "A break below key support on rising volume.",
      nextLevel: "Watch for your breakout trigger above near-term resistance.",
    };
  }

  const state = stateForScore(score);
  const confidence = clamp(54 + Math.abs(score) * 6, 50, 90);

  const reason =
    score > 0
      ? "Your assigned rules line up here; trend and participation support the plan."
      : score < 0
        ? "Your assigned rules lean defensive; risk checks take priority over adding."
        : "Your assigned rules are mixed on this name. No clear alignment right now.";

  const invalidation =
    score >= 0
      ? "A loss of trend or a break below key support would break your plan."
      : "A reclaim of trend with the thesis re-validated.";

  const nextLevel =
    score >= 0
      ? "Watch the next resistance level against your entry rules."
      : "Watch support; review your exit plan if it fails to hold.";

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
