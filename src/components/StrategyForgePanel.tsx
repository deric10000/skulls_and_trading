import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { dataSource } from "../lib/datasource";
import {
  CATEGORY_META,
  CATEGORY_ORDER,
  METRICS,
  formatChipCondition,
} from "../lib/forge/metrics";
import { validateStrategy } from "../lib/forge/scoring";
import {
  ArrowCounterClockwise,
  CheckCircle,
  PencilSimple,
  Trash,
  Warning,
} from "../lib/icons";
import { useAppState } from "../state/AppState";
import { ActionFooter } from "./ActionFooter";
import { Dropdown } from "./Dropdown";
import { MultiSelect } from "./MultiSelect";
import { InfoTip, Tooltip } from "./Tooltip";
import { RuleChipsTableModal } from "./forge/RuleChipsTableModal";
import { TagsTableModal } from "./forge/TagsTableModal";
import type {
  CheckInterval,
  RuleCategory,
  RuleChip,
  RuleTag,
  Strategy,
} from "../types";

// ---------------------------------------------------------------------------
// The Configure card (Strategy Forge). Layout follows the Figma design:
// header → name/description → enabled → applied portfolios → conviction
// preview → steps stepper → 1. Strategy Cadence → six category sections
// (question, sub-stepper, rule-chip box + tags box opening table modals) →
// completeness cautions → actions. All rule/tag editing happens in the table
// modals (RuleChipsTableModal / TagsTableModal).
// ---------------------------------------------------------------------------

// ---- Cadence helpers -------------------------------------------------------

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

// ---- Steppers -------------------------------------------------------------
// Active steppers (per the design): the main "Steps To Setup Your Strategy"
// stepper uses blue (info) indices; the per-category sub-steppers use gold
// (accent) indices. A completed step swaps its number for a CheckCircle in the
// stepper's index color, and connector lines flex to fill the row.

export interface StepItem {
  label: string;
  complete: boolean;
}

function Stepper({
  steps,
  tone = "info",
}: {
  steps: StepItem[];
  tone?: "info" | "accent";
}) {
  return (
    <ol className={`forge-stepper forge-stepper--${tone}`}>
      {steps.map((step, index) => (
        <Fragment key={step.label}>
          <li
            className={step.complete ? "forge-step forge-step--done" : "forge-step"}
          >
            {step.complete ? (
              <CheckCircle className="forge-step-check" aria-hidden weight="fill" />
            ) : (
              <span className="forge-step-index">{index + 1}</span>
            )}
            <span className="forge-step-label">
              {step.label}
              {step.complete ? (
                <span className="visually-hidden"> (complete)</span>
              ) : null}
            </span>
          </li>
          {index < steps.length - 1 ? (
            <li className="forge-step-line" aria-hidden />
          ) : null}
        </Fragment>
      ))}
    </ol>
  );
}

// ---- Chip / tag pills with tooltips ----------------------------------------

function ChipPill({ chip }: { chip: RuleChip }) {
  const meta = METRICS[chip.metric];
  return (
    <Tooltip
      title={chip.label}
      wide
      body={
        <>
          <span className="tooltip-line">
            <strong>Value | Weight</strong>
          </span>
          <span className="tooltip-line">
            {formatChipCondition(chip)} | {chip.weightPct}%
          </span>
          <span className="tooltip-line">
            <strong>What it is:</strong>
          </span>
          <span className="tooltip-line">{meta.whatItIs}</span>
          <span className="tooltip-line">
            <strong>Why does it matter?</strong>
          </span>
          <span className="tooltip-line">{meta.whyMatters}</span>
        </>
      }
    >
      <span className={chip.enabled ? "forge-pill" : "forge-pill forge-pill--off"} tabIndex={0}>
        {chip.label}
      </span>
    </Tooltip>
  );
}

function TagPill({ tag }: { tag: RuleTag }) {
  return (
    <Tooltip
      title={tag.label}
      wide
      body={
        <>
          <span className="tooltip-line">{tag.purpose}</span>
          <span className="tooltip-line">
            <strong>Weight:</strong> {tag.weightPct}%
          </span>
          <span className="tooltip-line">{tag.autoApply}</span>
        </>
      }
    >
      <span
        className={tag.system ? "forge-pill forge-pill--muted" : "forge-pill"}
        tabIndex={0}
      >
        {tag.label}
      </span>
    </Tooltip>
  );
}

// ---- Main panel ----------------------------------------------------------

interface TableEditor {
  kind: "chips" | "tags";
  category: RuleCategory;
}

export function StrategyForgePanel({ strategy }: { strategy: Strategy | undefined }) {
  const { updateStrategy, resetStrategy, deleteStrategy } = useAppState();

  const portfolioOptions = useMemo(
    () =>
      dataSource
        .getPortfolios()
        .map((portfolio) => ({ value: portfolio.id, label: portfolio.label })),
    [],
  );

  const [editor, setEditor] = useState<TableEditor | null>(null);
  const [editingWeight, setEditingWeight] = useState<RuleCategory | null>(null);
  const [updatedFlash, setUpdatedFlash] = useState(false);
  const flashTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(flashTimer.current), []);

  const rules = useMemo(() => strategy?.rules ?? [], [strategy]);
  const ruleTags = useMemo(() => strategy?.ruleTags ?? [], [strategy]);

  const validation = useMemo(
    () => (strategy ? validateStrategy(strategy) : null),
    [strategy],
  );

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
  const weights = strategy.categoryWeights;
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
    const nextTech = techIndex < nextIndex ? next : technicalsInterval;
    updateStrategy(id, { checkInterval: next, technicalsInterval: nextTech });
  }

  function saveChips(category: RuleCategory, chips: RuleChip[]) {
    const nextRules = [
      ...rules.filter((chip) => chip.category !== category),
      ...chips,
    ];
    // Scrub deleted chips out of this category's tag memberships.
    const keptIds = new Set(nextRules.map((chip) => chip.id));
    const nextTags = ruleTags.map((tag) =>
      tag.category === category
        ? { ...tag, chipIds: tag.chipIds.filter((chipId) => keptIds.has(chipId)) }
        : tag,
    );
    updateStrategy(id, { rules: nextRules, ruleTags: nextTags });
    setEditor(null);
  }

  function saveTags(category: RuleCategory, tags: RuleTag[]) {
    updateStrategy(id, {
      ruleTags: [...ruleTags.filter((tag) => tag.category !== category), ...tags],
    });
    setEditor(null);
  }

  function handleUpdateStrategy() {
    // Edits apply live; Update confirms + re-runs the completeness checks so
    // the user gets explicit feedback before heading to Apply.
    setUpdatedFlash(true);
    window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setUpdatedFlash(false), 2500);
  }

  const weightFor = (category: RuleCategory): number | undefined =>
    weights?.[category];

  // ---- Stepper completion (drives the active steppers) ----
  const chipsIn = (category: RuleCategory) =>
    rules.filter((chip) => chip.category === category && chip.enabled);
  const customTagsIn = (category: RuleCategory) =>
    ruleTags.filter((tag) => tag.category === category && !tag.system);

  function categoryComplete(category: RuleCategory): boolean {
    const chips = chipsIn(category);
    if (chips.length === 0) return false;
    const total = Math.round(chips.reduce((sum, chip) => sum + chip.weightPct, 0));
    if (total !== 100) return false;
    if (category === "thesis" && !strategy?.thesisDescription?.trim()) return false;
    return true;
  }

  function subSteps(category: RuleCategory): StepItem[] {
    const labels = CATEGORY_META[category].subSteps;
    const hasChips = chipsIn(category).length > 0;
    const hasTags = customTagsIn(category).length > 0;
    const done =
      category === "thesis"
        ? [Boolean(strategy?.thesisDescription?.trim()), hasChips, hasTags]
        : [hasChips, hasTags];
    return labels.map((label, index) => ({
      label,
      complete: done[index] ?? false,
    }));
  }

  const mainSteps: StepItem[] = [
    { label: "Strategy Cadence", complete: Boolean(strategy.checkInterval) },
    ...CATEGORY_ORDER.map((category) => ({
      label: CATEGORY_META[category].stepLabel,
      complete: categoryComplete(category),
    })),
  ];

  return (
    <section className="panel strategy-config" aria-labelledby="config-title">
      <div className="panel-head">
        <h2 id="config-title">Configure</h2>
        <span className={strategy.isDefault ? "chip" : "chip chip--soon"}>
          {strategy.isDefault ? "Default" : "Custom"}
        </span>
      </div>

      {/* Scrolling body — head above + the action footer below stay pinned,
          matching the My Strategies / Current Watch card model. */}
      <div className="strategy-config-scroll">
      {/* ---- Identity ---- */}
      <label className="config-field">
        <span className="config-label forge-label">
          Strategy Name
          <InfoTip
            label="About strategy name"
            body="Name the strategy after the plan it enforces — it labels signals across the Dashboard and Home."
          />
        </span>
        <input
          className="input"
          value={strategy.name}
          onChange={(event) => updateStrategy(id, { name: event.target.value })}
        />
      </label>

      <label className="config-field">
        <span className="config-label forge-label">Description</span>
        <textarea
          className="input log-textarea"
          rows={2}
          value={strategy.description}
          onChange={(event) => updateStrategy(id, { description: event.target.value })}
        />
      </label>

      {/* ---- Applied portfolios ---- */}
      {/* A strategy is "active" implicitly once a portfolio is applied here —
          no separate Enabled toggle. Multi-select the portfolios/watchlists this
          strategy governs. */}
      <div className="config-field">
        <span className="config-label forge-label">
          Applied Portfolios
          <InfoTip
            label="About applied portfolios"
            body="Select the portfolios and watchlists this strategy is applied to. Applying a strategy makes it active for those holdings."
          />
        </span>
        <MultiSelect
          id="forge-applied-portfolios"
          label="Applied portfolios"
          options={portfolioOptions}
          selected={strategy.appliedPortfolioIds ?? []}
          onChange={(ids) => updateStrategy(id, { appliedPortfolioIds: ids })}
          placeholder="Select portfolios to apply this strategy to"
        />
      </div>

      {/* ---- Steps ---- */}
      <div className="forge-section forge-section--steps">
        <span className="config-label forge-label">Steps To Setup Your Strategy</span>
        <Stepper steps={mainSteps} tone="info" />
      </div>

      {/* ---- 1. Strategy cadence ---- */}
      <div className="forge-section">
        <div className="forge-section-head">
          <h3 className="forge-section-title">1. Strategy Cadence</h3>
        </div>
        <p className="forge-section-q">How often would you like your strategy to update?</p>
        <div className="forge-cadence-row">
          <label className="config-field">
            <span className="config-label forge-label forge-label--muted">
              Strategy Check
              <InfoTip
                label="About the strategy check cadence"
                body="How often this strategy re-scores its portfolios and refreshes the chips you see. Fundamentals refresh daily regardless."
              />
            </span>
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
            <span className="config-label forge-label forge-label--muted">
              Technical Indicators
              <InfoTip
                label="About the technicals cadence"
                body="The candle size technical indicators use. It can't refresh faster than the strategy check, and never below 15 minutes."
              />
            </span>
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

      {/* ---- 2..7 Rule categories ---- */}
      {CATEGORY_ORDER.map((category, index) => {
        const meta = CATEGORY_META[category];
        const categoryChips = rules.filter((chip) => chip.category === category);
        const categoryTags = ruleTags.filter((tag) => tag.category === category);
        const weight = weightFor(category);
        const editingThisWeight = editingWeight === category;
        return (
          <div key={category} className="forge-section">
            <div className="forge-section-head">
              <h3 className="forge-section-title">
                {index + 2}. {meta.label}
                <InfoTip label={`About ${meta.label}`} body={meta.info} />
              </h3>
              <div className="forge-section-tools">
                {editingThisWeight ? (
                  <span className="forge-weight-edit">
                    <label className="visually-hidden" htmlFor={`weight-${category}`}>
                      {meta.label} conviction weight percent
                    </label>
                    <input
                      id={`weight-${category}`}
                      className="input forge-cell-input forge-cell-input--num forge-cell-input--weight"
                      type="number"
                      min={0}
                      max={100}
                      autoFocus
                      value={weight ?? 0}
                      onChange={(event) =>
                        updateStrategy(id, {
                          categoryWeights: {
                            ...(weights ?? {
                              thesis: 0,
                              setup: 0,
                              risk: 0,
                              position: 0,
                              trade: 0,
                              timeframe: 0,
                            }),
                            [category]: Number(event.target.value),
                          },
                        })
                      }
                      onBlur={() => setEditingWeight(null)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === "Escape") {
                          setEditingWeight(null);
                        }
                      }}
                    />
                    <span className="forge-cell-unit forge-cell-unit--weight">%</span>
                  </span>
                ) : (
                  <span
                    className={
                      weight == null
                        ? "chip forge-weight-chip forge-weight-chip--warn"
                        : "chip forge-weight-chip"
                    }
                  >
                    Conviction Weight Total: {weight == null ? "??" : weight}%
                  </span>
                )}
                <button
                  type="button"
                  className="icon-btn icon-btn--blue"
                  aria-label={`Edit ${meta.label} conviction weight`}
                  onClick={() => setEditingWeight(editingThisWeight ? null : category)}
                >
                  <PencilSimple aria-hidden weight="regular" />
                </button>
              </div>
            </div>

            <p className="forge-section-q">{meta.question}</p>
            <Stepper steps={subSteps(category)} tone="accent" />

            {category === "thesis" ? (
              <label className="config-field">
                <span className="config-label forge-label forge-label--muted">
                  Thesis Description
                  <InfoTip
                    label="About the thesis description"
                    body="Describe what you want the strategy to find — the rule chips below turn this into measurable checks."
                  />
                </span>
                <textarea
                  className="input log-textarea"
                  rows={3}
                  value={strategy.thesisDescription ?? ""}
                  placeholder="Describe what this strategy should find…"
                  onChange={(event) =>
                    updateStrategy(id, { thesisDescription: event.target.value })
                  }
                />
              </label>
            ) : null}

            <div className="forge-boxes">
              <div className="forge-box forge-box--chips">
                <div className="forge-box-head">
                  <span className="config-label forge-label forge-label--muted">
                    {meta.chipsLabel}
                    <InfoTip
                      label={`About ${meta.chipsLabel.toLowerCase()}`}
                      title={meta.chipsLabel}
                      body={meta.chipsInfo}
                      wide
                    />
                  </span>
                  <button
                    type="button"
                    className="icon-btn icon-btn--blue"
                    aria-label={`Edit ${meta.chipsLabel}`}
                    onClick={() => setEditor({ kind: "chips", category })}
                  >
                    <PencilSimple aria-hidden weight="regular" />
                  </button>
                </div>
                <div className="forge-box-body">
                  {categoryChips.length > 0 ? (
                    categoryChips.map((chip) => <ChipPill key={chip.id} chip={chip} />)
                  ) : (
                    <span className="forge-box-empty">
                      No rule chips yet — use the edit icon to add them.
                    </span>
                  )}
                </div>
              </div>

              <div className="forge-box forge-box--tags">
                <div className="forge-box-head">
                  <span className="config-label forge-label forge-label--muted">
                    {meta.tagsLabel}
                    <InfoTip
                      label={`About ${meta.tagsLabel.toLowerCase()}`}
                      title={meta.tagsLabel}
                      body={meta.tagsInfo}
                      wide
                    />
                  </span>
                  <button
                    type="button"
                    className="icon-btn icon-btn--blue"
                    aria-label={`Edit ${meta.tagsLabel}`}
                    onClick={() => setEditor({ kind: "tags", category })}
                  >
                    <PencilSimple aria-hidden weight="regular" />
                  </button>
                </div>
                <div className="forge-box-body">
                  {categoryTags.length > 0 ? (
                    categoryTags.map((tag) => <TagPill key={tag.id} tag={tag} />)
                  ) : (
                    <span className="forge-box-empty">
                      No tags yet — use the edit icon to add them.
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}

      {/* ---- Completeness cautions ---- */}
      {validation && !validation.complete ? (
        <div className="forge-caution" role="status">
          <span className="forge-caution-head">
            <Warning aria-hidden weight="fill" />
            Finish the configuration before applying this strategy
          </span>
          <ul className="forge-caution-list">
            {validation.issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </div>
      ) : null}
      </div>

      {/* ---- Actions (pinned card footer; icon-only on mobile) ---- */}
      <ActionFooter className="forge-config-actions strategy-footer--icons">
        {strategy.isDefault ? (
          <button
            type="button"
            className="btn btn--small btn--ghost"
            onClick={() => resetStrategy(id)}
            aria-label="Reset to default"
          >
            <ArrowCounterClockwise size={16} weight="regular" aria-hidden />
            <span className="btn-label">Reset to default</span>
          </button>
        ) : (
          <button
            type="button"
            className="btn btn--small btn--ghost"
            onClick={() => deleteStrategy(id)}
            aria-label="Delete strategy"
          >
            <Trash size={16} weight="regular" aria-hidden />
            <span className="btn-label">Delete strategy</span>
          </button>
        )}
        <button
          type="button"
          className="btn btn--small btn--solid forge-update-btn"
          onClick={handleUpdateStrategy}
          aria-label="Update strategy"
        >
          <CheckCircle size={16} weight={updatedFlash ? "fill" : "regular"} aria-hidden />
          <span className="btn-label">
            {updatedFlash ? "Strategy Updated" : "Update Strategy"}
          </span>
        </button>
      </ActionFooter>

      {editor?.kind === "chips" ? (
        <RuleChipsTableModal
          category={editor.category}
          chips={rules.filter((chip) => chip.category === editor.category)}
          onSave={(chips) => saveChips(editor.category, chips)}
          onClose={() => setEditor(null)}
        />
      ) : null}
      {editor?.kind === "tags" ? (
        <TagsTableModal
          category={editor.category}
          tags={ruleTags.filter((tag) => tag.category === editor.category)}
          chips={rules.filter((chip) => chip.category === editor.category)}
          onSave={(tags) => saveTags(editor.category, tags)}
          onClose={() => setEditor(null)}
        />
      ) : null}
    </section>
  );
}
