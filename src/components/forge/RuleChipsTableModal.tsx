import { useMemo, useState } from "react";
import {
  CATEGORY_META,
  METRICS,
  conditionLabel,
  metricsForCategory,
} from "../../lib/forge/metrics";
import { CaretUpDown, Copy, Plus, Trash, X } from "../../lib/icons";
import type {
  DateRange,
  MetricKey,
  RuleCategory,
  RuleChip,
  RuleOperator,
} from "../../types";

// ---------------------------------------------------------------------------
// Rule Chips table modal (per the Figma table designs). One reusable component
// serves every category: Fundamental / Technical / Risk / Position / Trade /
// Timeframe Rule Chips. Edits are DRAFTED locally; Cancel discards, Update
// commits the whole chip set back to the strategy.
//
// Columns: CHIP LABEL · DATA POINT · DATE RANGE · CONDITION · VALUE ·
// RULE WEIGHT · ACTIONS (duplicate / delete). Rule weights should total 100%.
// On mobile the rows reflow into stacked cards (see index.css).
// ---------------------------------------------------------------------------

type SortKey = "label" | "metric" | "dateRange" | "operator" | "value" | "weightPct";

let chipIdCounter = 0;
function nextChipId(): string {
  chipIdCounter += 1;
  return `chip-${Date.now()}-${chipIdCounter}`;
}

function valueUnitSuffix(metric: MetricKey): string {
  const meta = METRICS[metric];
  switch (meta.format) {
    case "percent":
      return "%";
    case "ratio":
      return "x";
    case "days":
      return "days";
    case "currency":
      return meta.unit ?? "$";
    default:
      return "";
  }
}

export function RuleChipsTableModal({
  category,
  chips,
  onSave,
  onClose,
}: {
  category: RuleCategory;
  /** The strategy's current chips for this category (draft source). */
  chips: RuleChip[];
  /** Commit the edited chip set for this category. */
  onSave: (chips: RuleChip[]) => void;
  onClose: () => void;
}) {
  const meta = CATEGORY_META[category];
  const metricOptions = useMemo(() => metricsForCategory(category), [category]);
  const [draft, setDraft] = useState<RuleChip[]>(() =>
    chips.map((chip) => ({ ...chip })),
  );
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 } | null>(null);

  const totalWeight = Math.round(
    draft.filter((chip) => chip.enabled).reduce((sum, chip) => sum + (chip.weightPct || 0), 0),
  );

  const sorted = useMemo(() => {
    if (!sort) return draft;
    const value = (chip: RuleChip): string | number => {
      switch (sort.key) {
        case "metric":
          return METRICS[chip.metric]?.label ?? "";
        case "operator":
          return conditionLabel(chip.operator, METRICS[chip.metric]?.format);
        case "value":
          return Array.isArray(chip.value)
            ? chip.value[0]
            : typeof chip.value === "number"
              ? chip.value
              : String(chip.value);
        case "weightPct":
          return chip.weightPct;
        case "dateRange":
          return chip.dateRange;
        default:
          return chip.label.toLowerCase();
      }
    };
    return [...draft].sort((a, b) => {
      const av = value(a);
      const bv = value(b);
      if (typeof av === "number" && typeof bv === "number") {
        return (av - bv) * sort.dir;
      }
      return String(av).localeCompare(String(bv)) * sort.dir;
    });
  }, [draft, sort]);

  function toggleSort(key: SortKey) {
    setSort((current) =>
      current?.key === key
        ? { key, dir: current.dir === 1 ? -1 : 1 }
        : { key, dir: 1 },
    );
  }

  function patchChip(id: string, patch: Partial<RuleChip>) {
    setDraft((current) =>
      current.map((chip) => (chip.id === id ? { ...chip, ...patch } : chip)),
    );
  }

  function handleMetricChange(id: string, metricKey: MetricKey) {
    const metricMeta = METRICS[metricKey];
    const operatorOk = (op: RuleOperator) => metricMeta.operators.includes(op);
    setDraft((current) =>
      current.map((chip) => {
        if (chip.id !== id) return chip;
        const operator = operatorOk(chip.operator)
          ? chip.operator
          : metricMeta.operators[0];
        const value =
          metricMeta.format === "boolean"
            ? "TRUE"
            : metricMeta.format === "text"
              ? ""
              : typeof chip.value === "number"
                ? chip.value
                : 0;
        return {
          ...chip,
          metric: metricKey,
          dateRange: metricMeta.defaultDateRange,
          operator,
          value,
        };
      }),
    );
  }

  function addChip() {
    const metricMeta = metricOptions[0] ?? METRICS.revenueGrowthPct;
    const chip: RuleChip = {
      id: nextChipId(),
      label: "New Rule",
      category,
      metric: metricMeta.key,
      dateRange: metricMeta.defaultDateRange,
      operator: metricMeta.operators[0],
      value:
        metricMeta.format === "boolean"
          ? "TRUE"
          : metricMeta.format === "text"
            ? ""
            : 0,
      weightPct: 0,
      enabled: true,
    };
    setDraft((current) => [...current, chip]);
  }

  function duplicateChip(id: string) {
    setDraft((current) => {
      const source = current.find((chip) => chip.id === id);
      if (!source) return current;
      return [...current, { ...source, id: nextChipId(), label: `${source.label} (Copy)` }];
    });
  }

  function deleteChip(id: string) {
    setDraft((current) => current.filter((chip) => chip.id !== id));
  }

  const headers: { key: SortKey; label: string }[] = [
    { key: "label", label: "Chip Label" },
    { key: "metric", label: "Data Point" },
    { key: "dateRange", label: "Date Range" },
    { key: "operator", label: "Condition" },
    { key: "value", label: "Value" },
    { key: "weightPct", label: "Rule Weight" },
  ];

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-card panel forge-table-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="chip-table-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="forge-table-head">
          <h2 id="chip-table-title">{meta.chipModalTitle}</h2>
          <button
            type="button"
            className="forge-table-close"
            onClick={onClose}
            aria-label="Close"
          >
            <X aria-hidden weight="bold" />
          </button>
        </div>

        <div className="forge-table-intro">
          <p>{meta.chipModalIntro}</p>
          <button type="button" className="btn btn--small" onClick={addChip}>
            <Plus aria-hidden weight="regular" /> Add Rule
          </button>
        </div>

        <div className="forge-table forge-table--chips" role="table" aria-label={meta.chipModalTitle}>
          <div className="forge-table-row forge-table-row--head" role="row">
            {headers.map((header) => (
              <button
                key={header.key}
                type="button"
                role="columnheader"
                className="forge-table-th"
                onClick={() => toggleSort(header.key)}
              >
                {header.label}
                <CaretUpDown aria-hidden weight="regular" />
              </button>
            ))}
            <span className="forge-table-th forge-table-th--static" role="columnheader">
              Actions
            </span>
          </div>

          {sorted.map((chip) => {
            const metricMeta = METRICS[chip.metric];
            const suffix = valueUnitSuffix(chip.metric);
            return (
              <div key={chip.id} className="forge-table-row" role="row">
                <div className="forge-table-cell" role="cell" data-label="Chip Label">
                  <input
                    className="input forge-cell-input forge-cell-input--pill"
                    value={chip.label}
                    aria-label="Chip label"
                    onChange={(event) => patchChip(chip.id, { label: event.target.value })}
                  />
                </div>
                <div className="forge-table-cell" role="cell" data-label="Data Point">
                  <select
                    className="input forge-cell-input"
                    value={chip.metric}
                    aria-label="Data point"
                    onChange={(event) =>
                      handleMetricChange(chip.id, event.target.value as MetricKey)
                    }
                  >
                    {metricOptions.map((option) => (
                      <option key={option.key} value={option.key}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="forge-table-cell" role="cell" data-label="Date Range">
                  <select
                    className="input forge-cell-input forge-cell-input--mono"
                    value={chip.dateRange}
                    aria-label="Date range"
                    onChange={(event) =>
                      patchChip(chip.id, { dateRange: event.target.value as DateRange })
                    }
                  >
                    {metricMeta.dateRanges.map((range) => (
                      <option key={range} value={range}>
                        {range}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="forge-table-cell" role="cell" data-label="Condition">
                  <select
                    className="input forge-cell-input"
                    value={chip.operator}
                    aria-label="Condition"
                    onChange={(event) =>
                      patchChip(chip.id, { operator: event.target.value as RuleOperator })
                    }
                  >
                    {metricMeta.operators.map((operator) => (
                      <option key={operator} value={operator}>
                        {conditionLabel(operator, metricMeta.format)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="forge-table-cell" role="cell" data-label="Value">
                  {metricMeta.format === "text" ? (
                    <input
                      className="input forge-cell-input"
                      value={typeof chip.value === "string" ? chip.value : ""}
                      aria-label="Value"
                      onChange={(event) => patchChip(chip.id, { value: event.target.value })}
                    />
                  ) : metricMeta.format === "boolean" ? (
                    <select
                      className="input forge-cell-input forge-cell-input--mono"
                      value={String(chip.value)}
                      aria-label="Value"
                      onChange={(event) => patchChip(chip.id, { value: event.target.value })}
                    >
                      <option value="TRUE">TRUE</option>
                      <option value="FALSE">FALSE</option>
                    </select>
                  ) : chip.operator === "between" ? (
                    <span className="forge-cell-range">
                      <input
                        className="input forge-cell-input forge-cell-input--num"
                        type="number"
                        value={Array.isArray(chip.value) ? chip.value[0] : 0}
                        aria-label="Minimum value"
                        onChange={(event) =>
                          patchChip(chip.id, {
                            value: [
                              Number(event.target.value),
                              Array.isArray(chip.value) ? chip.value[1] : 0,
                            ],
                          })
                        }
                      />
                      <span aria-hidden>–</span>
                      <input
                        className="input forge-cell-input forge-cell-input--num"
                        type="number"
                        value={Array.isArray(chip.value) ? chip.value[1] : 0}
                        aria-label="Maximum value"
                        onChange={(event) =>
                          patchChip(chip.id, {
                            value: [
                              Array.isArray(chip.value) ? chip.value[0] : 0,
                              Number(event.target.value),
                            ],
                          })
                        }
                      />
                    </span>
                  ) : (
                    <span className="forge-cell-value">
                      <input
                        className="input forge-cell-input forge-cell-input--num"
                        type="number"
                        step="any"
                        value={typeof chip.value === "number" ? chip.value : 0}
                        aria-label="Value"
                        onChange={(event) =>
                          patchChip(chip.id, { value: Number(event.target.value) })
                        }
                      />
                      {suffix ? <span className="forge-cell-unit">{suffix}</span> : null}
                    </span>
                  )}
                </div>
                <div className="forge-table-cell" role="cell" data-label="Rule Weight">
                  <span className="forge-cell-value">
                    <input
                      className="input forge-cell-input forge-cell-input--num forge-cell-input--weight"
                      type="number"
                      min={0}
                      max={100}
                      value={chip.weightPct}
                      aria-label="Rule weight percent"
                      onChange={(event) =>
                        patchChip(chip.id, { weightPct: Number(event.target.value) })
                      }
                    />
                    <span className="forge-cell-unit forge-cell-unit--weight">%</span>
                  </span>
                </div>
                <div className="forge-table-cell forge-table-cell--actions" role="cell" data-label="Actions">
                  <button
                    type="button"
                    className="icon-btn icon-btn--blue"
                    onClick={() => duplicateChip(chip.id)}
                    aria-label={`Duplicate ${chip.label}`}
                  >
                    <Copy aria-hidden weight="regular" />
                  </button>
                  <button
                    type="button"
                    className="icon-btn icon-btn--danger"
                    onClick={() => deleteChip(chip.id)}
                    aria-label={`Delete ${chip.label}`}
                  >
                    <Trash aria-hidden weight="regular" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div
          className={
            totalWeight === 100
              ? "forge-table-total"
              : "forge-table-total forge-table-total--warn"
          }
        >
          <span>Total Rule Weights</span>
          <span className="forge-table-total-val">{totalWeight}%</span>
        </div>
        {totalWeight !== 100 ? (
          <p className="forge-table-caution" role="status">
            Rule weights should total 100% — currently {totalWeight}%.
          </p>
        ) : null}

        <div className="forge-table-actions">
          <button
            type="button"
            className="btn btn--small btn--link forge-cancel-btn"
            onClick={onClose}
          >
            <X aria-hidden weight="bold" /> Cancel
          </button>
          <button
            type="button"
            className="btn btn--small btn--solid"
            onClick={() => onSave(draft)}
          >
            <Plus aria-hidden weight="regular" /> Update
          </button>
        </div>
      </div>
    </div>
  );
}
