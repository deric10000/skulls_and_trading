import { useEffect, useMemo, useRef, useState } from "react";
import { ActionMenu } from "../ActionMenu";
import { ChipSearchList, type ChipSearchGroup } from "../ChipSearchList";
import { InfoTip } from "../Tooltip";
import {
  CATEGORY_META,
  METRICS,
  conditionLabel,
  formatChipCondition,
  metricsForCategory,
  type MetricMeta,
} from "../../lib/forge/metrics";
import { isExamplePlan, normalizePlanEdit } from "../../lib/forge/myPlan";
import { systemChipsForCategory } from "../../lib/forge/chipSources";
import { ForgeToast } from "./ForgeToast";
import { useAppState } from "../../state/AppState";
import { useIsMobile } from "../../lib/useIsMobile";
import {
  BookmarkSimple,
  CaretDown,
  CaretLeft,
  CaretUpDown,
  Copy,
  PencilSimple,
  Plus,
  Trash,
  X,
} from "../../lib/icons";
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
// Timeframe Rule Chips. Edits commit live to the strategy as you change rows;
// Cancel (or backdrop / X) restores the chip set from when the modal opened.
// Update closes the modal — conviction and the panel Update button already
// reflect live edits.
//
// Columns: CHIP LABEL · DATA POINT · DATE RANGE · CONDITION · VALUE ·
// RULE WEIGHT · [MY PLAN on Risk] · ACTIONS. Rule weights should total 100%.
// On mobile the rows reflow into stacked cards (index.css).
//
// "Add Rule" is a split button (ActionMenu): "Add new blank chip" is the
// original behavior; "Select chip from system defaults or custom chips" opens
// an inline picker panel with two searchable, metric-grouped lists —
// System Defaults (read-only templates sourced live from every default
// strategy, via `systemChipsForCategory`) and My Chips (AppState.chipLibrary,
// editable in place). Picking either COPIES the chip into a new, independent,
// fully-editable draft row — see data-architecture.md "Chip library".
// ---------------------------------------------------------------------------

type SortKey =
  | "label"
  | "metric"
  | "dateRange"
  | "operator"
  | "value"
  | "weightPct"
  | "myPlan";
type SaveMode = "template" | "everywhere";

const MY_PLAN_TOOLTIP =
  "Write, in your words, what you plan to do if this rule is broken.";

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

/** Groups chip entries by their underlying data point, in metricsForCategory
    order (matches the Data Point dropdown), dropping metrics with no matches. */
function groupChipsByMetric(
  category: RuleCategory,
  entries: { chip: RuleChip; meta?: string }[],
): ChipSearchGroup[] {
  return metricsForCategory(category)
    .map((metricMeta) => ({
      heading: metricMeta.label,
      options: entries
        .filter((entry) => entry.chip.metric === metricMeta.key)
        .map((entry) => ({
          id: entry.chip.id,
          chip: entry.chip,
          description: formatChipCondition(entry.chip),
          meta: entry.meta,
        })),
    }))
    .filter((group) => group.options.length > 0);
}

/** The Value cell's control, shared by table rows and the My Chips edit form —
    branches on the metric's format (text / boolean / between / plain number). */
function ChipValueField({
  chip,
  metricMeta,
  onChange,
}: {
  chip: RuleChip;
  metricMeta: MetricMeta;
  onChange: (value: RuleChip["value"]) => void;
}) {
  const suffix = valueUnitSuffix(chip.metric);
  if (metricMeta.format === "text") {
    return (
      <input
        className="input forge-cell-input"
        value={typeof chip.value === "string" ? chip.value : ""}
        aria-label="Value"
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }
  if (metricMeta.format === "boolean") {
    return (
      <select
        className="input forge-cell-input forge-cell-input--mono"
        value={String(chip.value)}
        aria-label="Value"
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="TRUE">TRUE</option>
        <option value="FALSE">FALSE</option>
      </select>
    );
  }
  if (chip.operator === "between") {
    const [lo, hi] = Array.isArray(chip.value) ? chip.value : [0, 0];
    return (
      <span className="forge-cell-range">
        <input
          className="input forge-cell-input forge-cell-input--num"
          type="number"
          value={lo}
          aria-label="Minimum value"
          onChange={(event) => onChange([Number(event.target.value), hi])}
        />
        <span aria-hidden>–</span>
        <input
          className="input forge-cell-input forge-cell-input--num"
          type="number"
          value={hi}
          aria-label="Maximum value"
          onChange={(event) => onChange([lo, Number(event.target.value)])}
        />
      </span>
    );
  }
  return (
    <span className="forge-cell-value">
      <input
        className="input forge-cell-input forge-cell-input--num"
        type="number"
        step="any"
        value={typeof chip.value === "number" ? chip.value : 0}
        aria-label="Value"
        onChange={(event) => onChange(Number(event.target.value))}
      />
      {suffix ? <span className="forge-cell-unit">{suffix}</span> : null}
    </span>
  );
}

export function RuleChipsTableModal({
  category,
  chips,
  onDraftChange,
  onCancel,
  onDone,
}: {
  category: RuleCategory;
  /** The strategy's current chips for this category (draft source). */
  chips: RuleChip[];
  /** Push chip edits to the strategy as the user edits (live commit). */
  onDraftChange: (chips: RuleChip[]) => void;
  /** Revert to the snapshot from when the modal opened, then close. */
  onCancel: () => void;
  /** Close the modal; edits are already committed. */
  onDone: () => void;
}) {
  const { chipLibrary, saveChipToLibrary, removeChipFromLibrary, updateChipInLibrary } =
    useAppState();
  const isMobile = useIsMobile();
  const meta = CATEGORY_META[category];
  // My Plan is available on every category — Watch Summary surfaces failing
  // chips from any status-driving category (thesis, setup, risk, …).
  const showMyPlan = true;
  const metricOptions = useMemo(() => metricsForCategory(category), [category]);
  const [draft, setDraft] = useState<RuleChip[]>(() =>
    chips.map((chip) => ({ ...chip })),
  );
  const skipInitialDraftSync = useRef(true);
  const onDraftChangeRef = useRef(onDraftChange);
  onDraftChangeRef.current = onDraftChange;
  useEffect(() => {
    if (skipInitialDraftSync.current) {
      skipInitialDraftSync.current = false;
      return;
    }
    onDraftChangeRef.current(draft);
  }, [draft]);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 } | null>(null);
  // Mobile only: rows collapse to a compact one-line summary by default (see
  // components.mdc "Collapsible mobile row standard") — desktop/tablet always
  // show full fields regardless of this state.
  const [expandedRowIds, setExpandedRowIds] = useState<Set<string>>(new Set());

  function toggleRowExpanded(id: string) {
    setExpandedRowIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // ---- Add Rule picker (System Defaults / My Chips) ----
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editingLibraryChipId, setEditingLibraryChipId] = useState<string | null>(null);
  const [libraryDraft, setLibraryDraft] = useState<RuleChip | null>(null);
  const [saveMode, setSaveMode] = useState<SaveMode>("template");
  const [savedRowFlashId, setSavedRowFlashId] = useState<string | null>(null);
  const savedRowFlashTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(savedRowFlashTimer.current), []);

  const systemGroups = useMemo(
    () =>
      groupChipsByMetric(
        category,
        systemChipsForCategory(category).map(({ chip, sourceStrategyName }) => ({
          chip,
          meta: sourceStrategyName,
        })),
      ),
    [category],
  );
  const customChipsForCategory = useMemo(
    () => chipLibrary.filter((chip) => chip.category === category),
    [chipLibrary, category],
  );
  const customGroups = useMemo(
    () => groupChipsByMetric(category, customChipsForCategory.map((chip) => ({ chip }))),
    [category, customChipsForCategory],
  );

  function closePicker() {
    setPickerOpen(false);
    setEditingLibraryChipId(null);
    setLibraryDraft(null);
  }

  function addChipFromSource(source: RuleChip, libraryChipId?: string) {
    const newChip: RuleChip = { ...source, id: nextChipId(), libraryChipId };
    setDraft((current) => [newChip, ...current]);
    closePicker();
  }

  function saveRowToLibrary(chip: RuleChip) {
    saveChipToLibrary({ ...chip });
    setSavedRowFlashId(chip.id);
    window.clearTimeout(savedRowFlashTimer.current);
    savedRowFlashTimer.current = window.setTimeout(() => setSavedRowFlashId(null), 1800);
  }

  function startEditingLibraryChip(chip: RuleChip) {
    setEditingLibraryChipId(chip.id);
    setLibraryDraft({ ...chip });
    setSaveMode("template");
  }

  function cancelEditingLibraryChip() {
    setEditingLibraryChipId(null);
    setLibraryDraft(null);
  }

  function handleLibraryMetricChange(metricKey: MetricKey) {
    setLibraryDraft((current) => {
      if (!current) return current;
      const metricMeta = METRICS[metricKey];
      const operator = metricMeta.operators.includes(current.operator)
        ? current.operator
        : metricMeta.operators[0];
      const value =
        metricMeta.format === "boolean"
          ? "TRUE"
          : metricMeta.format === "text"
            ? ""
            : typeof current.value === "number"
              ? current.value
              : 0;
      return {
        ...current,
        metric: metricKey,
        dateRange: metricMeta.defaultDateRange,
        operator,
        value,
      };
    });
  }

  function saveLibraryChipEdit() {
    if (!libraryDraft || !editingLibraryChipId) return;
    const { id: _id, ...patch } = libraryDraft;
    updateChipInLibrary(editingLibraryChipId, patch, saveMode === "everywhere");
    cancelEditingLibraryChip();
  }

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
        case "myPlan":
          return (chip.myPlan ?? "").toLowerCase();
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
    setDraft((current) => [chip, ...current]);
  }

  function duplicateChip(id: string) {
    setDraft((current) => {
      const source = current.find((chip) => chip.id === id);
      if (!source) return current;
      return [{ ...source, id: nextChipId(), label: `${source.label} (Copy)` }, ...current];
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
    <div className="modal-backdrop" role="presentation" onClick={onCancel}>
      <div
        className={
          showMyPlan
            ? "modal-card panel forge-table-modal forge-table-modal--with-plan"
            : "modal-card panel forge-table-modal"
        }
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
            onClick={onCancel}
            aria-label="Close"
          >
            <X aria-hidden weight="bold" />
          </button>
        </div>

        {pickerOpen ? (
          <div className="forge-chip-picker" role="region" aria-label="Add a rule chip">
            <div className="forge-chip-picker-head">
              <button type="button" className="breadcrumb" onClick={closePicker}>
                <CaretLeft aria-hidden />
                {meta.chipModalTitle}
              </button>
              <h3>Add From System Defaults or Your Chips</h3>
            </div>

            <div className="forge-chip-picker-columns">
              <section className="forge-chip-picker-col">
                <h4 className="config-label forge-label">System Defaults</h4>
                <ChipSearchList
                  id={`system-chips-${category}`}
                  label="Search system default chips"
                  groups={systemGroups}
                  onSelect={(chip) => addChipFromSource(chip)}
                  placeholder="Search system chips…"
                  emptyMessage="No system default chips for this category yet."
                />
              </section>

              <section className="forge-chip-picker-col">
                <h4 className="config-label forge-label">My Chips</h4>
                <ChipSearchList
                  id={`custom-chips-${category}`}
                  label="Search your saved chips"
                  groups={customGroups}
                  onSelect={(chip) => addChipFromSource(chip, chip.id)}
                  placeholder="Search your chips…"
                  emptyMessage="No custom chips saved yet — build one below in the table and save it here."
                  renderExtra={(option) => (
                    <span className="chip-search-actions">
                      <button
                        type="button"
                        className="icon-btn icon-btn--blue"
                        aria-label={`Edit ${option.chip.label}`}
                        onClick={() => startEditingLibraryChip(option.chip)}
                      >
                        <PencilSimple aria-hidden weight="regular" />
                      </button>
                      <button
                        type="button"
                        className="icon-btn icon-btn--danger"
                        aria-label={`Delete ${option.chip.label}`}
                        onClick={() => removeChipFromLibrary(option.chip.id)}
                      >
                        <Trash aria-hidden weight="regular" />
                      </button>
                    </span>
                  )}
                />

                {editingLibraryChipId && libraryDraft ? (
                  <div className="forge-chip-edit">
                    <div className="forge-chip-edit-grid">
                      <label className="config-field">
                        <span className="config-label forge-label forge-label--muted">
                          Chip Label
                        </span>
                        <input
                          className="input"
                          value={libraryDraft.label}
                          onChange={(event) =>
                            setLibraryDraft({ ...libraryDraft, label: event.target.value })
                          }
                        />
                      </label>
                      <label className="config-field">
                        <span className="config-label forge-label forge-label--muted">
                          Data Point
                        </span>
                        <select
                          className="input"
                          value={libraryDraft.metric}
                          onChange={(event) =>
                            handleLibraryMetricChange(event.target.value as MetricKey)
                          }
                        >
                          {metricOptions.map((option) => (
                            <option key={option.key} value={option.key}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="config-field">
                        <span className="config-label forge-label forge-label--muted">
                          Date Range
                        </span>
                        <select
                          className="input"
                          value={libraryDraft.dateRange}
                          onChange={(event) =>
                            setLibraryDraft({
                              ...libraryDraft,
                              dateRange: event.target.value as DateRange,
                            })
                          }
                        >
                          {METRICS[libraryDraft.metric].dateRanges.map((range) => (
                            <option key={range} value={range}>
                              {range}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="config-field">
                        <span className="config-label forge-label forge-label--muted">
                          Condition
                        </span>
                        <select
                          className="input"
                          value={libraryDraft.operator}
                          onChange={(event) =>
                            setLibraryDraft({
                              ...libraryDraft,
                              operator: event.target.value as RuleOperator,
                            })
                          }
                        >
                          {METRICS[libraryDraft.metric].operators.map((operator) => (
                            <option key={operator} value={operator}>
                              {conditionLabel(operator, METRICS[libraryDraft.metric].format)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="config-field">
                        <span className="config-label forge-label forge-label--muted">
                          Value
                        </span>
                        <ChipValueField
                          chip={libraryDraft}
                          metricMeta={METRICS[libraryDraft.metric]}
                          onChange={(value) => setLibraryDraft({ ...libraryDraft, value })}
                        />
                      </label>
                      <label className="config-field">
                        <span className="config-label forge-label forge-label--muted">
                          Rule Weight
                        </span>
                        <span className="forge-cell-value">
                          <input
                            className="input forge-cell-input forge-cell-input--num forge-cell-input--weight"
                            type="number"
                            min={0}
                            max={100}
                            value={libraryDraft.weightPct}
                            onChange={(event) =>
                              setLibraryDraft({
                                ...libraryDraft,
                                weightPct: Number(event.target.value),
                              })
                            }
                          />
                          <span className="forge-cell-unit forge-cell-unit--weight">%</span>
                        </span>
                      </label>
                    </div>

                    <fieldset className="forge-chip-savemode">
                      <legend className="config-label forge-label forge-label--muted">
                        Save mode
                      </legend>
                      <label className="forge-radio">
                        <input
                          type="radio"
                          name="chip-save-mode"
                          checked={saveMode === "template"}
                          onChange={() => setSaveMode("template")}
                        />
                        Save Default Chip Settings
                      </label>
                      <label className="forge-radio">
                        <input
                          type="radio"
                          name="chip-save-mode"
                          checked={saveMode === "everywhere"}
                          onChange={() => setSaveMode("everywhere")}
                        />
                        Save and Update Chip Settings Everywhere
                      </label>
                    </fieldset>
                    {saveMode === "everywhere" ? (
                      <ForgeToast tone="warning">
                        This updates this chip in every strategy that already uses it
                        — conviction scores there may change.
                      </ForgeToast>
                    ) : null}

                    <div className="forge-chip-edit-actions">
                      <button
                        type="button"
                        className="btn btn--small btn--link forge-cancel-btn"
                        onClick={cancelEditingLibraryChip}
                      >
                        <X aria-hidden weight="bold" /> Cancel
                      </button>
                      <button
                        type="button"
                        className="btn btn--small btn--solid"
                        onClick={saveLibraryChipEdit}
                      >
                        <Plus aria-hidden weight="regular" /> Save Chip
                      </button>
                    </div>
                  </div>
                ) : null}
              </section>
            </div>
          </div>
        ) : null}

        {!pickerOpen ? (
          <>
          <div className="forge-table-intro">
            <p>{meta.chipModalIntro}</p>
            <ActionMenu
              label="Add Rule options"
              trigger={({ open, toggle }) => (
                <button
                  type="button"
                  className="btn btn--small"
                  aria-haspopup="menu"
                  aria-expanded={open}
                  onClick={toggle}
                >
                  <CaretDown aria-hidden weight="bold" /> Add Rule
                </button>
              )}
              items={[
                { id: "blank", label: "Add new blank chip", onSelect: addChip },
                {
                  id: "pick",
                  label: "Select chip from system defaults or custom chips",
                  onSelect: () => setPickerOpen(true),
                },
              ]}
            />
          </div>

          <div
            className={
              showMyPlan
                ? "forge-table forge-table--chips forge-table--chips-plan"
                : "forge-table forge-table--chips"
            }
            role="table"
            aria-label={meta.chipModalTitle}
          >
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
              {showMyPlan ? (
                <span
                  className="forge-table-th forge-table-th--static forge-table-th--plan"
                  role="columnheader"
                >
                  <span className="forge-th-with-tip">
                    My Plan
                    <InfoTip
                      label="About My Plan"
                      body={MY_PLAN_TOOLTIP}
                    />
                  </span>
                </span>
              ) : null}
              <span className="forge-table-th forge-table-th--static" role="columnheader">
                Actions
              </span>
            </div>

            {sorted.map((chip) => {
              const metricMeta = METRICS[chip.metric];
              const isExpanded = expandedRowIds.has(chip.id);
              const showCompact = isMobile && !isExpanded;
              return (
                <div
                  key={chip.id}
                  className={
                    showCompact ? "forge-table-row forge-table-row--collapsed" : "forge-table-row"
                  }
                  role="row"
                >
                  {showCompact ? (
                    <button
                      type="button"
                      className="chip-search-option forge-row-summary"
                      onClick={() => toggleRowExpanded(chip.id)}
                      aria-expanded={false}
                    >
                      <span className="chip-search-option-label">{chip.label}</span>
                      <span className="chip-search-option-desc">
                        {formatChipCondition(chip)}
                      </span>
                      <CaretDown className="forge-row-caret" aria-hidden weight="bold" />
                    </button>
                  ) : (
                    <>
                    {isMobile ? (
                      <button
                        type="button"
                        className="chip-search-option forge-row-summary is-expanded"
                        onClick={() => toggleRowExpanded(chip.id)}
                        aria-expanded={true}
                      >
                        <span className="chip-search-option-label">{chip.label}</span>
                        <span className="chip-search-option-desc">
                          {formatChipCondition(chip)}
                        </span>
                        <CaretDown
                          className="forge-row-caret forge-row-caret--up"
                          aria-hidden
                          weight="bold"
                        />
                      </button>
                    ) : null}
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
                      <ChipValueField
                        chip={chip}
                        metricMeta={metricMeta}
                        onChange={(value) => patchChip(chip.id, { value })}
                      />
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
                    {showMyPlan ? (
                      <div className="forge-table-cell" role="cell" data-label="My Plan">
                        <textarea
                          className={
                            isExamplePlan(chip.myPlan)
                              ? "input forge-cell-input forge-cell-area forge-cell-plan forge-cell-plan--example"
                              : "input forge-cell-input forge-cell-area forge-cell-plan"
                          }
                          rows={2}
                          value={chip.myPlan ?? ""}
                          placeholder="What will you do if this rule breaks?"
                          aria-label="My plan"
                          onChange={(event) =>
                            patchChip(chip.id, {
                              myPlan: normalizePlanEdit(chip.myPlan, event.target.value),
                            })
                          }
                        />
                      </div>
                    ) : null}
                    <div className="forge-table-cell forge-table-cell--actions" role="cell" data-label="Actions">
                      <button
                        type="button"
                        className="icon-btn icon-btn--blue"
                        onClick={() => saveRowToLibrary(chip)}
                        aria-label={`Save ${chip.label} to My Chips`}
                      >
                        <BookmarkSimple
                          aria-hidden
                          weight={savedRowFlashId === chip.id ? "fill" : "regular"}
                        />
                      </button>
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
                    </>
                  )}
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
              onClick={onCancel}
            >
              <X aria-hidden weight="bold" /> Cancel
            </button>
            <button
              type="button"
              className="btn btn--small btn--solid"
              onClick={onDone}
            >
              <Plus aria-hidden weight="regular" /> Update
            </button>
          </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
