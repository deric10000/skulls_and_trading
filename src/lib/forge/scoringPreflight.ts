/**
 * Preflight: required tickers must be present in the completed cycle with
 * usable quote + technicals before an authoritative check may complete.
 */

export interface CycleCoverageInput {
  symbols?: string[];
  quotes?: Record<string, unknown>;
  technicals?: Record<string, unknown>;
  fundamentals?: Record<string, unknown>;
  context?: unknown;
}

export function missingCycleSymbols(
  requiredTickers: readonly string[],
  cycle: CycleCoverageInput,
): string[] {
  const required = [
    ...new Set(
      requiredTickers.map((ticker) => ticker.toUpperCase()).filter(Boolean),
    ),
  ].sort();
  const present = new Set(
    (cycle.symbols ?? []).map((symbol) => symbol.toUpperCase()),
  );
  return required.filter((ticker) => !present.has(ticker));
}

export function incompleteCycleTickers(
  requiredTickers: readonly string[],
  cycle: CycleCoverageInput,
): string[] {
  const required = [
    ...new Set(
      requiredTickers.map((ticker) => ticker.toUpperCase()).filter(Boolean),
    ),
  ].sort();
  return required.filter((ticker) => {
    const quote = cycle.quotes?.[ticker];
    const technicals = cycle.technicals?.[ticker];
    return quote == null || technicals == null;
  });
}

export function classifyPreflightFailure(args: {
  missingFromCycle: string[];
  incompleteTickers: string[];
  hasContext: boolean;
}): {
  status: "waiting_for_data" | "incomplete";
  category: "cycle_missing_symbol" | "market_data_incomplete";
  affected: string[];
  message: string;
} | null {
  if (args.missingFromCycle.length > 0) {
    return {
      status: "waiting_for_data",
      category: "cycle_missing_symbol",
      affected: args.missingFromCycle,
      message: `cycle_missing_symbol:${args.missingFromCycle.join(",")}`,
    };
  }
  if (args.incompleteTickers.length > 0 || !args.hasContext) {
    const affected = args.incompleteTickers;
    return {
      status: "incomplete",
      category: "market_data_incomplete",
      affected,
      message: `market_data_incomplete:${affected.join(",") || "context"}`,
    };
  }
  return null;
}
