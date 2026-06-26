import { useMemo, useState } from "react";
import {
  DECISION_SIGNAL_OPTIONS,
  EXIT_RULE_OPTIONS,
  TAG_OPTIONS,
  TIMEFRAME_OPTIONS,
} from "../data";
import { dataSource } from "../lib/datasource";
import {
  CATEGORY_META,
  CATEGORY_ORDER,
  METRICS,
} from "../lib/forge/metrics";
import { scoreStock, type MetricContext } from "../lib/forge/scoring";
import { useAppState } from "../state/AppState";
import { Dropdown } from "./Dropdown";
import { StatusBadge } from "./StatusBadge";
import { RuleChipEditor } from "./forge/RuleChipEditor";
import type {
  CheckInterval,
  DecisionSignal,
  ExitRule,
  RuleCategory,
  RuleChip,
  RuleOperator,
  Strategy,
  Timeframe,
} from "../types";

// ---- Cadence helpers -----------------------------------------------------

const INTERVAL_ORDER: CheckInterval[] = ["15m", "30m", "1h", "4h", "1D", "1W", "1M"];
const INTERVAL_LABEL: Record<CheckInterval, string> = {
  "15m": "Every 15 min",
  "30m": "Every 30 min",
  "1h": "Hourly",
  "4h": "Every 4 hours",
  "1D": "Daily",
  "1W": "Weekly",
  "1M": "Monthly",
};

const OPERATOR_SYMBOL: Record<RuleOperator, string> = {
  ">": ">",
  ">=": "≥",
  "<": "<",
  "<=": "≤",
  between: "",
  is: "is",
};

function formatCondition(chip: RuleChip): string {
  const meta = METRICS[chip.metric];
  const unit = meta.unit ?? "";
  if (chip.operator === "between" && Array.isArray(chip.value)) {
    return `${meta.label} ${chip.value[0]}${unit}–${chip.value[1]}${unit}`;
  }
  if (chip.operator === "is") {
    return `${meta.label} is ${chip.value}`;
  }
  return `${meta.label} ${OPERATOR_SYMBOL[chip.operator]} ${chip.value}${unit}`;
}

// ---- Small toggle chip group (legacy labels) -----------------------------

function toggleValue<T>(values: T[], value: T): T[] {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
}

function ChipGroup<T extends string>({
  title,
  options,
  active,
  onToggle,
}: {
  title: string;
  options: readonly T[];
  active: T[];
  onToggle: (value: T) => void;
}) {
  return (
    <div className="config-group">
      <h3>{title}</h3>
      <div className="config-chips">
        {options.map((option) => {
          const on = active.includes(option);
          return (
            <button
              key={option}
              type="button"
              className={on ? "config-chip config-chip--on" : "config-chip"}
              aria-pressed={on}
              onClick={() => onToggle(option)}
            >
              {option}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---- Build a preview MetricContext for one ticker ------------------------

function usePreviewContext(ticker: string): MetricContext {
  return useMemo(() => {
    const portfolio = dataSource.getPortfolios()[0];
    const lastPrice = (t: string) => dataSource.getTickerInfo(t)?.lastPrice ?? 0;
    const bookValue = portfolio
      ? portfolio.holdings.reduce(
          (sum, holding) => sum + holding.shares * lastPrice(holding.ticker),
          0,
        )
      : 0;
    const holding = portfolio?.holdings.find((item) => item.ticker === ticker);
    const weightPct =
      holding && bookValue > 0
        ? (holding.shares * lastPrice(ticker) * 100) / bookValue
        : holding
          ? 0
          : undefined;
    return {
      fundamentals: dataSource.getFundamentals(ticker),
      technicals: dataSource.getTechnicals(ticker),
      market: dataSource.getMarketContext(),
      weightPct,
      openPnlPct: holding?.openPnlPct,
    };
  }, [ticker]);
}

// ---- Thesis boolean builder ---------------------------------------------

function ThesisBuilder({
  strategy,
  onChange,
}: {
  strategy: Strategy;
  onChange: (groups: string[][]) => void;
}) {
  const thesisChips = (strategy.rules ?? []).filter(
    (chip) => chip.category === "thesis",
  );
  const groups =
    strategy.thesis && strategy.thesis.groups.length > 0
      ? strategy.thesis.groups
      : [thesisChips.map((chip) => chip.id)];

  if (thesisChips.length === 0) {
    return (
      <p className="forge-thesis-empty">
        Add a Thesis Fit chip above, then group your rules with AND / OR here.
      </p>
    );
  }

  function toggleMembership(groupIndex: number, chipId: string) {
    const next = groups.map((group) => [...group]);
    const group = next[groupIndex];
    const at = group.indexOf(chipId);
    if (at >= 0) group.splice(at, 1);
    else group.push(chipId);
    onChange(next.filter((g) => g.length > 0));
  }

  function addGroup() {
    onChange([...groups, []]);
  }

  function removeGroup(groupIndex: number) {
    onChange(groups.filter((_, index) => index !== groupIndex));
  }

  return (
    <div className="forge-thesis">
      <p className="forge-thesis-help">
        A name passes the thesis if it satisfies <strong>all</strong> chips in{" "}
        <strong>any one</strong> group (AND within a group, OR across groups).
      </p>
      {groups.map((group, groupIndex) => (
        <div key={groupIndex} className="forge-thesis-group">
          <div className="forge-thesis-group-head">
            <span className="forge-thesis-group-name">Group {groupIndex + 1}</span>
            {groups.length > 1 ? (
              <button
                type="button"
                className="btn btn--small btn--ghost"
                onClick={() => removeGroup(groupIndex)}
              >
                Remove group
              </button>
            ) : null}
          </div>
          <div className="forge-thesis-chips">
            {thesisChips.map((chip) => {
              const on = group.includes(chip.id);
              return (
                <button
                  key={chip.id}
                  type="button"
                  className={on ? "config-chip config-chip--on" : "config-chip"}
                  aria-pressed={on}
                  onClick={() => toggleMembership(groupIndex, chip.id)}
                >
                  {chip.label}
                </button>
              );
            })}
          </div>
          {groupIndex < groups.length - 1 ? (
            <div className="forge-thesis-or">OR</div>
          ) : null}
        </div>
      ))}
      <button type="button" className="btn btn--small btn--ghost" onClick={addGroup}>
        + Add OR group
      </button>
    </div>
  );
}

// ---- Rule chip row -------------------------------------------------------

function RuleChipRow({
  chip,
  outcome,
  onEdit,
  onDelete,
  onToggle,
}: {
  chip: RuleChip;
  outcome: "pass" | "fail" | "no-data";
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
}) {
  return (
    <li className={`forge-rule forge-rule--${outcome}`}>
      <button
        type="button"
        className={
          chip.enabled ? "forge-rule-toggle forge-rule-toggle--on" : "forge-rule-toggle"
        }
        aria-pressed={chip.enabled}
        aria-label={chip.enabled ? "Disable chip" : "Enable chip"}
        onClick={onToggle}
      />
      <div className="forge-rule-body">
        <span className="forge-rule-label">{chip.label}</span>
        <span className="forge-rule-cond">{formatCondition(chip)}</span>
      </div>
      <span className="forge-rule-weight" title="Weight within category">
        ×{chip.weight}
      </span>
      <span className={`forge-rule-pill forge-rule-pill--${outcome}`}>
        {outcome === "pass" ? "Pass" : outcome === "fail" ? "Fail" : "No data"}
      </span>
      <div className="forge-rule-actions">
        <button type="button" className="forge-rule-act" onClick={onEdit} aria-label="Edit chip">
          Edit
        </button>
        <button
          type="button"
          className="forge-rule-act forge-rule-act--danger"
          onClick={onDelete}
          aria-label="Delete chip"
        >
          Delete
        </button>
      </div>
    </li>
  );
}

// ---- Main panel ----------------------------------------------------------

interface EditorState {
  chip: RuleChip | null;
  category: RuleCategory;
}

export function StrategyForgePanel({ strategy }: { strategy: Strategy | undefined }) {
  const {
    updateStrategy,
    resetStrategy,
    deleteStrategy,
    chipLibrary,
    saveChipToLibrary,
  } = useAppState();

  // Preview ticker — default to the first holding in any bucket for this
  // strategy, else the first portfolio holding.
  const tickerOptions = useMemo(() => {
    const portfolio = dataSource.getPortfolios()[0];
    return (portfolio?.holdings ?? []).map((holding) => ({
      value: holding.ticker,
      label: holding.ticker,
    }));
  }, []);
  const [previewTicker, setPreviewTicker] = useState(
    tickerOptions[0]?.value ?? "NVDA",
  );
  const [editor, setEditor] = useState<EditorState | null>(null);

  const ctx = usePreviewContext(previewTicker);
  const rules = strategy?.rules ?? [];

  const alignment = useMemo(
    () => (strategy ? scoreStock(strategy, ctx) : null),
    [strategy, ctx],
  );

  const outcomeByChip = useMemo(() => {
    const map: Record<string, "pass" | "fail" | "no-data"> = {};
    alignment?.results.forEach((result) => {
      map[result.chip.id] = result.outcome;
    });
    return map;
  }, [alignment]);

  if (!strategy) {
    return (
      <section className="panel strategy-config" aria-labelledby="config-title">
        <div className="panel-head">
          <h2 id="config-title">Configure</h2>
        </div>
        <p className="panel-intro">Select a strategy to configure it.</p>
      </section>
    );
  }

  const id = strategy.id;
  const checkInterval = strategy.checkInterval ?? "1D";
  const technicalsInterval = strategy.technicalsInterval ?? checkInterval;

  // Technicals can't refresh faster than the strategy check (we wouldn't have
  // the data) and never below 15m. Clamp the option list to >= checkInterval.
  const checkIndex = INTERVAL_ORDER.indexOf(checkInterval);
  const technicalsOptions = INTERVAL_ORDER.slice(Math.max(0, checkIndex)).map(
    (interval) => ({ value: interval, label: INTERVAL_LABEL[interval] }),
  );

  function handleCheckIntervalChange(value: string) {
    const next = value as CheckInterval;
    const nextIndex = INTERVAL_ORDER.indexOf(next);
    const techIndex = INTERVAL_ORDER.indexOf(technicalsInterval);
    // Keep technicals at or slower than the new check cadence.
    const nextTech = techIndex < nextIndex ? next : technicalsInterval;
    updateStrategy(id, { checkInterval: next, technicalsInterval: nextTech });
  }

  function upsertChip(chip: RuleChip) {
    const exists = rules.some((item) => item.id === chip.id);
    const nextRules = exists
      ? rules.map((item) => (item.id === chip.id ? chip : item))
      : [...rules, chip];
    updateStrategy(id, { rules: nextRules });
    setEditor(null);
  }

  function deleteChip(chipId: string) {
    updateStrategy(id, { rules: rules.filter((item) => item.id !== chipId) });
    // Also drop it from any thesis group.
    if (strategy?.thesis) {
      const groups = strategy.thesis.groups
        .map((group) => group.filter((memberId) => memberId !== chipId))
        .filter((group) => group.length > 0);
      updateStrategy(id, { thesis: { groups } });
    }
  }

  function toggleChip(chipId: string) {
    updateStrategy(id, {
      rules: rules.map((item) =>
        item.id === chipId ? { ...item, enabled: !item.enabled } : item,
      ),
    });
  }

  function addFromLibrary(libChip: RuleChip) {
    const clone: RuleChip = {
      ...libChip,
      id: `chip-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    };
    updateStrategy(id, { rules: [...rules, clone] });
  }

  return (
    <section className="panel strategy-config" aria-labelledby="config-title">
      <div className="panel-head">
        <h2 id="config-title">Configure</h2>
        <span className={strategy.isDefault ? "chip" : "chip chip--soon"}>
          {strategy.isDefault ? "Default" : "Custom"}
        </span>
      </div>

      <label className="config-field">
        <span className="config-label">Strategy name</span>
        <input
          className="input"
          value={strategy.name}
          onChange={(event) => updateStrategy(id, { name: event.target.value })}
        />
      </label>

      <label className="config-field">
        <span className="config-label">Description</span>
        <textarea
          className="input log-textarea"
          rows={2}
          value={strategy.description}
          onChange={(event) =>
            updateStrategy(id, { description: event.target.value })
          }
        />
      </label>

      <label className="config-toggle">
        <input
          type="checkbox"
          checked={strategy.enabled}
          onChange={(event) => updateStrategy(id, { enabled: event.target.checked })}
        />
        <span>Enabled (counts toward Dashboard signals)</span>
      </label>

      {/* ---- Live conviction preview ---- */}
      {alignment ? (
        <div className="forge-preview">
          <div className="forge-preview-head">
            <span className="config-label">Conviction preview</span>
            <div className="forge-preview-ticker">
              <Dropdown
                id="forge-preview-ticker"
                label="Preview ticker"
                value={previewTicker}
                onChange={setPreviewTicker}
                options={tickerOptions}
              />
            </div>
          </div>
          {alignment.hasRules ? (
            <>
              <div className="forge-preview-score">
                <span className="forge-preview-number">{alignment.conviction}</span>
                <StatusBadge status={alignment.status} />
              </div>
              <div className="forge-preview-track">
                <span
                  className="forge-preview-fill"
                  style={{ width: `${alignment.conviction}%` }}
                />
              </div>
              <ul className="forge-preview-cats">
                {CATEGORY_ORDER.map((category) => {
                  const cat = alignment.categories.find(
                    (item) => item.category === category,
                  );
                  const score = cat?.score ?? null;
                  return (
                    <li key={category} className="forge-preview-cat">
                      <span className="forge-preview-cat-name">
                        {CATEGORY_META[category].label}
                      </span>
                      <span className="forge-preview-cat-bar">
                        <span
                          className="forge-preview-cat-fill"
                          style={{ width: `${score ?? 0}%` }}
                        />
                      </span>
                      <span className="forge-preview-cat-val">
                        {score == null ? "—" : score}
                      </span>
                    </li>
                  );
                })}
              </ul>
              {!alignment.thesisPass ? (
                <p className="forge-preview-gate">
                  Thesis gate failed — this name doesn't meet the core thesis.
                </p>
              ) : alignment.riskBreached ? (
                <p className="forge-preview-gate">
                  Risk gate tripped — a risk rule is breaching.
                </p>
              ) : null}
            </>
          ) : (
            <p className="forge-preview-empty">
              Add rule chips below to see live conviction for {previewTicker}.
            </p>
          )}
        </div>
      ) : null}

      {/* ---- Check cadence ---- */}
      <div className="config-group forge-cadence">
        <h3>Check cadence</h3>
        <p className="forge-cadence-help">
          How often this strategy re-scores its bucket and updates the chips you
          see. Fundamentals refresh daily; technicals use the candle below.
        </p>
        <div className="forge-cadence-row">
          <label className="config-field">
            <span className="config-label">Strategy check</span>
            <Dropdown
              id="forge-check-interval"
              label="Strategy check interval"
              value={checkInterval}
              onChange={handleCheckIntervalChange}
              options={INTERVAL_ORDER.map((interval) => ({
                value: interval,
                label: INTERVAL_LABEL[interval],
              }))}
            />
          </label>
          <label className="config-field">
            <span className="config-label">Technicals candle</span>
            <Dropdown
              id="forge-technicals-interval"
              label="Technicals interval"
              value={technicalsInterval}
              onChange={(value) =>
                updateStrategy(id, { technicalsInterval: value as CheckInterval })
              }
              options={technicalsOptions}
            />
          </label>
        </div>
      </div>

      {/* ---- Rule categories ---- */}
      {CATEGORY_ORDER.map((category) => {
        const meta = CATEGORY_META[category];
        const categoryChips = rules.filter((chip) => chip.category === category);
        return (
          <div key={category} className="config-group forge-category">
            <div className="forge-category-head">
              <h3>{meta.label}</h3>
              <span className="forge-category-q">{meta.question}</span>
            </div>
            {categoryChips.length > 0 ? (
              <ul className="forge-rules">
                {categoryChips.map((chip) => (
                  <RuleChipRow
                    key={chip.id}
                    chip={chip}
                    outcome={outcomeByChip[chip.id] ?? "no-data"}
                    onEdit={() => setEditor({ chip, category })}
                    onDelete={() => deleteChip(chip.id)}
                    onToggle={() => toggleChip(chip.id)}
                  />
                ))}
              </ul>
            ) : (
              <p className="forge-category-empty">No rules yet.</p>
            )}
            <button
              type="button"
              className="btn btn--small btn--ghost"
              onClick={() => setEditor({ chip: null, category })}
            >
              + Add rule
            </button>

            {category === "thesis" ? (
              <ThesisBuilder
                strategy={strategy}
                onChange={(groups) => updateStrategy(id, { thesis: { groups } })}
              />
            ) : null}
          </div>
        );
      })}

      {/* ---- Chip library ---- */}
      <div className="config-group forge-library">
        <h3>Chip library</h3>
        <p className="forge-cadence-help">
          Reusable rules. Click to add a copy to this strategy; save new chips to
          the library from the rule editor.
        </p>
        <div className="config-chips">
          {chipLibrary.map((libChip) => (
            <button
              key={libChip.id}
              type="button"
              className="config-chip"
              onClick={() => addFromLibrary(libChip)}
              title={formatCondition(libChip)}
            >
              + {libChip.label}
            </button>
          ))}
        </div>
      </div>

      {/* ---- Legacy labels (kept for existing list/summary views) ---- */}
      <details className="forge-legacy">
        <summary>Labels &amp; legacy signals</summary>
        <ChipGroup<Timeframe>
          title="Timeframe"
          options={TIMEFRAME_OPTIONS}
          active={strategy.timeframe}
          onToggle={(value) =>
            updateStrategy(id, {
              timeframe: toggleValue(strategy.timeframe, value),
            })
          }
        />
        <ChipGroup<string>
          title="Strategy Tags"
          options={TAG_OPTIONS}
          active={strategy.tags}
          onToggle={(value) =>
            updateStrategy(id, { tags: toggleValue(strategy.tags, value) })
          }
        />
        <ChipGroup<DecisionSignal>
          title="Key Decision Signals"
          options={DECISION_SIGNAL_OPTIONS}
          active={strategy.decisionSignals}
          onToggle={(value) =>
            updateStrategy(id, {
              decisionSignals: toggleValue(strategy.decisionSignals, value),
            })
          }
        />
        <ChipGroup<ExitRule>
          title="Exit Logic"
          options={EXIT_RULE_OPTIONS}
          active={strategy.exitLogic}
          onToggle={(value) =>
            updateStrategy(id, { exitLogic: toggleValue(strategy.exitLogic, value) })
          }
        />
      </details>

      <div className="config-actions">
        {strategy.isDefault ? (
          <button
            type="button"
            className="btn btn--small btn--ghost"
            onClick={() => resetStrategy(id)}
          >
            Reset to default
          </button>
        ) : (
          <button
            type="button"
            className="btn btn--small btn--ghost"
            onClick={() => deleteStrategy(id)}
          >
            Delete strategy
          </button>
        )}
      </div>

      {editor ? (
        <RuleChipEditor
          chip={editor.chip}
          defaultCategory={editor.category}
          onSave={upsertChip}
          onSaveToLibrary={saveChipToLibrary}
          onClose={() => setEditor(null)}
        />
      ) : null}
    </section>
  );
}
