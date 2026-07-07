import { DEFAULT_STRATEGIES } from "../../data";
import type { RuleCategory, RuleChip } from "../../types";

// ---------------------------------------------------------------------------
// System-default rule chip source — for the "Add Rule" picker's System
// Defaults list. Reads directly from every `isDefault: true` strategy in
// `DEFAULT_STRATEGIES` (today: Value/Growth/Dividend + Aggressive AI/
// High-Beta Growth; automatically includes any future default strategy too).
// Read-only: these are never mutated by the picker — adding one to a strategy
// copies its fields into a brand-new chip row with a fresh id.
// ---------------------------------------------------------------------------

export interface SystemChipOption {
  chip: RuleChip;
  sourceStrategyId: string;
  sourceStrategyName: string;
}

/** Every default strategy's rule chips for one category, as read-only templates. */
export function systemChipsForCategory(category: RuleCategory): SystemChipOption[] {
  return DEFAULT_STRATEGIES.filter((strategy) => strategy.isDefault).flatMap(
    (strategy) =>
      (strategy.rules ?? [])
        .filter((chip) => chip.category === category)
        .map((chip) => ({
          chip,
          sourceStrategyId: strategy.id,
          sourceStrategyName: strategy.name,
        })),
  );
}
