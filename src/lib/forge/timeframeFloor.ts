import type { CandleInterval, RuleChip, Strategy } from "../../types";
import { isTimeframedMetric } from "./metrics";

export const MIN_TECHNICAL_TIME: CandleInterval = "1h";
const SUB_HOUR = new Set(["15m", "30m"]);

export interface TimeframeMigration {
  strategyName: string;
  chipLabel: string;
  from: "15m" | "30m";
}

let pendingMigrations: TimeframeMigration[] = [];

export function isSubHourTechnicalChip(chip: RuleChip): boolean {
  return isTimeframedMetric(chip.metric) && isSubHourTime(chip.dateRange);
}

export function isSubHourTime(value: string): boolean {
  return SUB_HOUR.has(value);
}

function migrateChips(
  chips: RuleChip[] | undefined,
  strategyName: string,
  record: boolean,
): RuleChip[] | undefined {
  if (!chips) return chips;
  return chips.map((chip) => {
    if (!isSubHourTechnicalChip(chip)) return chip;
    if (record) {
      pendingMigrations.push({
        strategyName,
        chipLabel: chip.label,
        from: chip.dateRange as "15m" | "30m",
      });
    }
    return { ...chip, dateRange: MIN_TECHNICAL_TIME };
  });
}

/** Migrate every conviction and Layer 3 chip list to the reliable 1h floor. */
export function migrateStrategyTimeframeFloor(
  strategy: Strategy,
  record = true,
): Strategy {
  return {
    ...strategy,
    rules: migrateChips(strategy.rules, strategy.name, record),
    trimZoneRules: migrateChips(
      strategy.trimZoneRules,
      strategy.name,
      record,
    ),
    addZoneRules: migrateChips(strategy.addZoneRules, strategy.name, record),
    goToCashRules: migrateChips(
      strategy.goToCashRules,
      strategy.name,
      record,
    ),
  };
}

export function migrateChipLibraryTimeframeFloor(
  chips: RuleChip[],
): RuleChip[] {
  return chips.map((chip) =>
    isSubHourTechnicalChip(chip)
      ? { ...chip, dateRange: MIN_TECHNICAL_TIME }
      : chip,
  );
}

export function consumeTimeframeMigrations(): TimeframeMigration[] {
  const migrations = pendingMigrations;
  pendingMigrations = [];
  return migrations;
}
