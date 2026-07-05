import { useMemo, useState } from "react";
import { Dropdown } from "../Dropdown";
import {
  ALL_METRICS,
  CATEGORY_META,
  CATEGORY_ORDER,
  METRICS,
} from "../../lib/forge/metrics";
import type {
  MetricKey,
  RuleCategory,
  RuleChip,
  RuleOperator,
} from "../../types";

const OPERATOR_LABEL: Record<RuleOperator, string> = {
  ">": "is greater than",
  ">=": "is at least",
  "<": "is less than",
  "<=": "is at most",
  between: "is between",
  is: "is",
};

let chipSeq = 0;
function newChipId(): string {
  chipSeq += 1;
  return `chip-${Date.now()}-${chipSeq}`;
}

// Add/edit a single rule chip. Metric → operator → value(s) → weight, with a
// human-readable label. Progressive disclosure keeps the surface small (Hick's
// Law): the value editor adapts to the chosen operator.
export function RuleChipEditor({
  chip,
  defaultCategory,
  onSave,
  onSaveToLibrary,
  onClose,
}: {
  chip: RuleChip | null; // null = creating a new chip
  defaultCategory: RuleCategory;
  onSave: (chip: RuleChip) => void;
  onSaveToLibrary?: (chip: RuleChip) => void;
  onClose: () => void;
}) {
  const [label, setLabel] = useState(chip?.label ?? "");
  const [category, setCategory] = useState<RuleCategory>(
    chip?.category ?? defaultCategory,
  );
  const [metric, setMetric] = useState<MetricKey>(chip?.metric ?? "revenueGrowthPct");
  const [operator, setOperator] = useState<RuleOperator>(chip?.operator ?? ">=");
  const initialValue = chip?.value;
  const [single, setSingle] = useState<string>(
    typeof initialValue === "number"
      ? String(initialValue)
      : typeof initialValue === "string"
        ? initialValue
        : "0",
  );
  const [rangeMin, setRangeMin] = useState<string>(
    Array.isArray(initialValue) ? String(initialValue[0]) : "0",
  );
  const [rangeMax, setRangeMax] = useState<string>(
    Array.isArray(initialValue) ? String(initialValue[1]) : "0",
  );
  const [weight, setWeight] = useState<number>(chip?.weight ?? 2);

  const meta = METRICS[metric];
  const operatorOptions = useMemo(
    () => meta.operators.map((op) => ({ value: op, label: OPERATOR_LABEL[op] })),
    [meta],
  );

  function handleMetricChange(nextMetric: string) {
    const key = nextMetric as MetricKey;
    setMetric(key);
    const nextMeta = METRICS[key];
    // Keep the operator valid for the new metric; default category follows it.
    if (!nextMeta.operators.includes(operator)) {
      setOperator(nextMeta.operators[0]);
    }
    setCategory(nextMeta.category);
    if (!label.trim()) setLabel(nextMeta.plainLabel);
  }

  function build(): RuleChip | null {
    const trimmed = label.trim();
    if (!trimmed) return null;
    let value: RuleChip["value"];
    if (operator === "between") {
      value = [Number(rangeMin), Number(rangeMax)];
    } else if (operator === "is") {
      value = single;
    } else {
      value = Number(single);
    }
    return {
      id: chip?.id ?? newChipId(),
      label: trimmed,
      category,
      metric,
      operator,
      value,
      weight,
      enabled: chip?.enabled ?? true,
    };
  }

  function handleSave() {
    const built = build();
    if (built) onSave(built);
  }

  function handleSaveToLibrary() {
    const built = build();
    if (built && onSaveToLibrary) onSaveToLibrary(built);
  }

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="chip-editor-title"
      onClick={onClose}
    >
      <div
        className="modal-card panel chip-editor"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="panel-head">
          <h2 id="chip-editor-title">{chip ? "Edit rule chip" : "New rule chip"}</h2>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label="Close rule editor"
          >
            &times;
          </button>
        </div>

        <label className="config-field">
          <span className="config-label">Label</span>
          <input
            className="input"
            value={label}
            placeholder="e.g. Sales growing fast"
            onChange={(event) => setLabel(event.target.value)}
          />
        </label>

        <div className="chip-editor-grid">
          <label className="config-field">
            <span className="config-label">Data point</span>
            <Dropdown
              id="chip-metric"
              label="Metric"
              value={metric}
              onChange={handleMetricChange}
              options={ALL_METRICS.map((m) => ({
                value: m.key,
                label: `${m.label} — ${m.plainLabel}`,
              }))}
            />
          </label>

          <label className="config-field">
            <span className="config-label">Condition</span>
            <Dropdown
              id="chip-operator"
              label="Operator"
              value={operator}
              onChange={(value) => setOperator(value as RuleOperator)}
              options={operatorOptions}
            />
          </label>
        </div>

        <div className="chip-editor-grid">
          {operator === "between" ? (
            <div className="config-field">
              <span className="config-label">
                Range{meta.unit ? ` (${meta.unit})` : ""}
              </span>
              <div className="chip-editor-range">
                <input
                  className="input"
                  type="number"
                  value={rangeMin}
                  aria-label="Minimum"
                  onChange={(event) => setRangeMin(event.target.value)}
                />
                <span className="chip-editor-range-sep">to</span>
                <input
                  className="input"
                  type="number"
                  value={rangeMax}
                  aria-label="Maximum"
                  onChange={(event) => setRangeMax(event.target.value)}
                />
              </div>
            </div>
          ) : (
            <label className="config-field">
              <span className="config-label">
                Value{meta.unit ? ` (${meta.unit})` : ""}
              </span>
              <input
                className="input"
                type={operator === "is" ? "text" : "number"}
                value={single}
                onChange={(event) => setSingle(event.target.value)}
              />
            </label>
          )}

          <label className="config-field">
            <span className="config-label">Category</span>
            <Dropdown
              id="chip-category"
              label="Category"
              value={category}
              onChange={(value) => setCategory(value as RuleCategory)}
              options={CATEGORY_ORDER.map((key) => ({
                value: key,
                label: CATEGORY_META[key].label,
              }))}
            />
          </label>
        </div>

        <label className="config-field">
          <span className="config-label">Weight within category: {weight}</span>
          <input
            type="range"
            min={1}
            max={5}
            step={1}
            value={weight}
            onChange={(event) => setWeight(Number(event.target.value))}
          />
        </label>

        <p className="chip-editor-hint">{meta.hint}</p>

        <div className="config-actions chip-editor-actions">
          {onSaveToLibrary ? (
            <button
              type="button"
              className="btn btn--small btn--ghost"
              onClick={handleSaveToLibrary}
            >
              Save to library
            </button>
          ) : null}
          <button type="button" className="btn btn--small" onClick={handleSave}>
            {chip ? "Save changes" : "Add chip"}
          </button>
        </div>
      </div>
    </div>
  );
}
