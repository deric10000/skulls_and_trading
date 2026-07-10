import { useEffect, useMemo, useRef, useState } from "react";
import { ActionMenu } from "../ActionMenu";
import { ChipSearchList, type ChipSearchGroup } from "../ChipSearchList";
import { InfoTip } from "../Tooltip";
import { ForgeTableModal } from "./ForgeTableModal";
import {
  CATEGORY_META,
  CATEGORY_ORDER,
  METRICS,
  conditionLabel,
  formatChipCondition,
  metricsForCategory,
  type MetricMeta,
} from "../../lib/forge/metrics";
import { isExamplePlan, normalizePlanEdit } from "../../lib/forge/myPlan";
import { useIsMobile } from "../../lib/useIsMobile";
import {
  CaretDown,
  CaretLeft,
  CaretUpDown,
  Copy,
  Trash,
} from "../../lib/icons";
import type {
  MetricKey,
  RuleChip,
  RuleOperator,
  RuleTag,
} from "../../types";

// ---------------------------------------------------------------------------
// Trim Zone table modal — Layer 3 overlay authoring on ForgeTableModal chrome
// (same baseline as Rule Chips / Tags). Reads/writes strategy.trimZone* only.
// Copies from conviction chips/tags are independent; nothing here feeds
// scoreStock. Empty by default until the captain adds rules.
// ---------------------------------------------------------------------------

type SortKey =
  | "label"
  | "metric"
  | "dateRange"
  | "operator"
  | "value"
  | "weightPct"
  | "myPlan";

type PickerMode = "chips" | "tags" | null;

const MY_PLAN_TOOLTIP =
  "Write, in your words, what you plan to do if this Trim Zone rule is broken.";

const TRIM_ZONE_INFO =
  "Trim Zone rules decide when the Trim Zone label fires. They are independent copies — changing a value here does not change conviction scoring or the original category rule.";

let trimIdCounter = 0;
function nextTrimId(prefix: string): string {
  trimIdCounter += 1;
  return `trim-${prefix}-${Date.now()}-${trimIdCounter}`;
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

function allMetricOptions(): MetricMeta[] {
  return CATEGORY_ORDER.flatMap((category) => metricsForCategory(category));
}

function groupSourceChips(chips: RuleChip[]): ChipSearchGroup[] {
  return CATEGORY_ORDER.flatMap((category) => {
    const meta = CATEGORY_META[category];
    const inCategory = chips.filter((chip) => chip.category === category);
    if (inCategory.length === 0) return [];
    return [
      {
        heading: meta.label,
        options: inCategory.map((chip) => ({
          id: chip.id,
          chip,
          description: formatChipCondition(chip),
          meta: meta.stepLabel,
        })),
      },
    ];
  });
}

function groupSourceTags(tags: RuleTag[]): ChipSearchGroup[] {
  return CATEGORY_ORDER.flatMap((category) => {
    const meta = CATEGORY_META[category];
    const inCategory = tags.filter((tag) => tag.category === category && !tag.system);
    if (inCategory.length === 0) return [];
    return [
      {
        heading: meta.label,
        options: inCategory.map((tag) => ({
          id: tag.id,
          // ChipSearchList expects a chip-shaped option; reuse label/desc only.
          chip: {
            id: tag.id,
            label: tag.label,
            category: tag.category,
            metric: "weightPct",
            dateRange: "Current",
            operator: ">=" as const,
            value: 0,
            weightPct: tag.weightPct,
            enabled: true,
          },
          description: tag.purpose,
          meta: `${tag.chipIds.length} chips · ${meta.stepLabel}`,
        })),
      },
    ];
  });
}

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

export function TrimZoneTableModal({
  rules,
  tags,
  sourceChips,
  sourceTags,
  onDraftChange,
  onCancel,
  onDone,
}: {
  rules: RuleChip[];
  tags: RuleTag[];
  /** Conviction-scoring chips available to copy (all categories). */
  sourceChips: RuleChip[];
  /** Conviction-scoring tags available to copy (all categories). */
  sourceTags: RuleTag[];
  onDraftChange: (next: { rules: RuleChip[]; tags: RuleTag[] }) => void;
  onCancel: () => void;
  onDone: () => void;
}) {
  const isMobile = useIsMobile();
  const metricOptions = useMemo(() => allMetricOptions(), []);
  const [draftRules, setDraftRules] = useState<RuleChip[]>(() =>
    rules.map((chip) => ({ ...chip })),
  );
  const [draftTags, setDraftTags] = useState<RuleTag[]>(() =>
    tags.map((tag) => ({ ...tag, chipIds: [...tag.chipIds] })),
  );
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "label",
    dir: "asc",
  });
  const [pickerMode, setPickerMode] = useState<PickerMode>(null);
  const [expandedRowIds, setExpandedRowIds] = useState<Set<string>>(() => new Set());
  const skipFirstCommit = useRef(true);

  useEffect(() => {
    if (skipFirstCommit.current) {
      skipFirstCommit.current = false;
      return;
    }
    onDraftChange({ rules: draftRules, tags: draftTags });
  }, [draftRules, draftTags, onDraftChange]);

  const chipGroups = useMemo(() => groupSourceChips(sourceChips), [sourceChips]);
  const tagGroups = useMemo(() => groupSourceTags(sourceTags), [sourceTags]);

  const totalWeight = useMemo(
    () => draftRules.reduce((sum, chip) => sum + Math.max(0, chip.weightPct), 0),
    [draftRules],
  );

  const sorted = useMemo(() => {
    const rows = [...draftRules];
    const dir = sort.dir === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      const av =
        sort.key === "metric"
          ? METRICS[a.metric]?.label ?? a.metric
          : sort.key === "operator"
            ? conditionLabel(a.operator, METRICS[a.metric]?.format)
            : sort.key === "value"
              ? String(a.value)
              : sort.key === "myPlan"
                ? a.myPlan ?? ""
                : a[sort.key];
      const bv =
        sort.key === "metric"
          ? METRICS[b.metric]?.label ?? b.metric
          : sort.key === "operator"
            ? conditionLabel(b.operator, METRICS[b.metric]?.format)
            : sort.key === "value"
              ? String(b.value)
              : sort.key === "myPlan"
                ? b.myPlan ?? ""
                : b[sort.key];
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
    return rows;
  }, [draftRules, sort]);

  function toggleSort(key: SortKey) {
    setSort((current) =>
      current.key === key
        ? { key, dir: current.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" },
    );
  }

  function patchChip(id: string, patch: Partial<RuleChip>) {
    setDraftRules((current) =>
      current.map((chip) => (chip.id === id ? { ...chip, ...patch } : chip)),
    );
  }

  function handleMetricChange(id: string, metricKey: MetricKey) {
    const metricMeta = METRICS[metricKey];
    const operator = metricMeta.operators[0];
    const value =
      metricMeta.format === "boolean"
        ? "TRUE"
        : metricMeta.format === "text"
          ? ""
          : operator === "between"
            ? [0, 0]
            : 0;
    patchChip(id, {
      metric: metricKey,
      dateRange: metricMeta.defaultDateRange,
      operator,
      value,
    });
  }

  function addBlankChip() {
    const metricMeta = metricOptions[0] ?? METRICS.weightPct;
    const chip: RuleChip = {
      id: nextTrimId("chip"),
      label: "New Trim Rule",
      category: "position",
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
    setDraftRules((current) => [chip, ...current]);
  }

  function addChipFromSource(source: RuleChip) {
    const copy: RuleChip = {
      ...source,
      id: nextTrimId("chip"),
      label: source.label,
    };
    setDraftRules((current) => [copy, ...current]);
    setPickerMode(null);
  }

  function addTagFromSource(source: RuleTag) {
    const idMap = new Map<string, string>();
    const memberChips = source.chipIds
      .map((chipId) => sourceChips.find((chip) => chip.id === chipId))
      .filter((chip): chip is RuleChip => Boolean(chip))
      .map((chip) => {
        const newId = nextTrimId("chip");
        idMap.set(chip.id, newId);
        return { ...chip, id: newId };
      });

    const tagCopy: RuleTag = {
      ...source,
      id: nextTrimId("tag"),
      chipIds: source.chipIds.map((chipId) => idMap.get(chipId) ?? chipId),
      system: false,
    };

    setDraftRules((current) => [...memberChips, ...current]);
    setDraftTags((current) => [tagCopy, ...current]);
    setPickerMode(null);
  }

  function duplicateChip(id: string) {
    setDraftRules((current) => {
      const source = current.find((chip) => chip.id === id);
      if (!source) return current;
      return [
        { ...source, id: nextTrimId("chip"), label: `${source.label} (Copy)` },
        ...current,
      ];
    });
  }

  function deleteChip(id: string) {
    setDraftRules((current) => current.filter((chip) => chip.id !== id));
    setDraftTags((current) =>
      current.map((tag) => ({
        ...tag,
        chipIds: tag.chipIds.filter((chipId) => chipId !== id),
      })),
    );
  }

  function deleteTag(id: string) {
    setDraftTags((current) => current.filter((tag) => tag.id !== id));
  }

  function toggleRowExpanded(id: string) {
    setExpandedRowIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const headers: { key: SortKey; label: string }[] = [
    { key: "label", label: "Chip Label" },
    { key: "metric", label: "Data Point" },
    { key: "dateRange", label: "Date Range" },
    { key: "operator", label: "Condition" },
    { key: "value", label: "Value" },
    { key: "weightPct", label: "Rule Weight" },
  ];

  const addRuleAction = (
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
                    { id: "blank", label: "Add new blank rule", onSelect: addBlankChip },
                    {
                      id: "copy-chip",
                      label: "Copy rule chip from any category",
                      onSelect: () => setPickerMode("chips"),
                    },
                    {
                      id: "copy-tag",
                      label: "Copy tag from any category",
                      onSelect: () => setPickerMode("tags"),
                    },
                  ]}
                />
  );

  const pickerView = (
          <div className="forge-chip-picker" role="region" aria-label="Add a Trim Zone rule">
            <div className="forge-chip-picker-head">
              <button type="button" className="breadcrumb" onClick={() => setPickerMode(null)}>
                <CaretLeft aria-hidden />
                Trim Zone Rules
              </button>
              <h3>
                {pickerMode === "chips"
                  ? "Copy a rule chip from this strategy"
                  : "Copy a tag from this strategy"}
              </h3>
            </div>
            <div className="forge-chip-picker-intro">
              <p>
                Picking a chip or tag creates an independent Trim Zone copy.
              </p>
            </div>
            <div className="forge-chip-picker-columns">
              <section className="forge-chip-picker-col">
                <h4 className="config-label forge-label">
                  {pickerMode === "chips" ? "Strategy Rule Chips" : "Strategy Tags"}
                </h4>
                <ChipSearchList
                  id={`trim-zone-${pickerMode}`}
                  label={
                    pickerMode === "chips"
                      ? "Search strategy rule chips"
                      : "Search strategy tags"
                  }
                  groups={pickerMode === "chips" ? chipGroups : tagGroups}
                  onSelect={(chip) => {
                    if (pickerMode === "chips") {
                      const source = sourceChips.find((item) => item.id === chip.id);
                      if (source) addChipFromSource(source);
                      return;
                    }
                    const source = sourceTags.find((item) => item.id === chip.id);
                    if (source) addTagFromSource(source);
                  }}
                  placeholder={
                    pickerMode === "chips" ? "Search rule chips…" : "Search tags…"
                  }
                  emptyMessage={
                    pickerMode === "chips"
                      ? "No strategy rule chips to copy yet."
                      : "No strategy tags to copy yet."
                  }
                />
              </section>
            </div>
          </div>
  );

  return (
    <ForgeTableModal
      title="Trim Zone Rules"
      titleId="trim-zone-table-title"
      titleAccessory={
        <InfoTip
          label="About Trim Zone rules"
          title="Trim Zone"
          body={TRIM_ZONE_INFO}
          wide
        />
      }
      withPlan
      onCancel={onCancel}
      onDone={onDone}
      intro="Add Trim Zone rules that fire the Trim Zone label."
      addAction={addRuleAction}
      totalLabel="Total Rule Weights"
      totalValue={`${totalWeight}%`}
      totalWarn={draftRules.length > 0 && totalWeight !== 100}
      caution={
        draftRules.length > 0 && totalWeight !== 100 ? (
          <p className="forge-table-caution" role="status">
            Rule weights should total 100% — currently {totalWeight}%. (Trim
            Zone weights do not affect conviction.)
          </p>
        ) : null
      }
      alternateView={pickerMode ? pickerView : null}
    >
            <div
              className="forge-table forge-table--chips forge-table--chips-plan"
              role="table"
              aria-label="Trim Zone Rules"
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
                <span
                  className="forge-table-th forge-table-th--static forge-table-th--plan"
                  role="columnheader"
                >
                  <span className="forge-th-with-tip">
                    My Plan
                    <InfoTip label="About My Plan" body={MY_PLAN_TOOLTIP} />
                  </span>
                </span>
                <span className="forge-table-th forge-table-th--static" role="columnheader">
                  Actions
                </span>
              </div>

              {sorted.length === 0 ? (
                <div className="forge-table-row" role="row">
                  <span className="forge-box-empty" style={{ gridColumn: "1 / -1" }}>
                    No Trim Zone rules yet — use Add Rule to create a blank rule or
                    copy one from another category.
                  </span>
                </div>
              ) : null}

              {sorted.map((chip) => {
                const metricMeta = METRICS[chip.metric];
                const isExpanded = expandedRowIds.has(chip.id);
                const showCompact = isMobile && !isExpanded;
                return (
                  <div
                    key={chip.id}
                    className={
                      showCompact
                        ? "forge-table-row forge-table-row--collapsed"
                        : "forge-table-row"
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
                              className="forge-row-caret"
                              aria-hidden
                              weight="bold"
                            />
                          </button>
                        ) : null}
                        <div className="forge-table-cell" role="cell" data-label="Chip Label">
                          <input
                            className="input forge-cell-input"
                            value={chip.label}
                            aria-label="Chip label"
                            onChange={(event) =>
                              patchChip(chip.id, { label: event.target.value })
                            }
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
                            {CATEGORY_ORDER.map((category) => (
                              <optgroup
                                key={category}
                                label={CATEGORY_META[category].stepLabel}
                              >
                                {metricsForCategory(category).map((option) => (
                                  <option key={option.key} value={option.key}>
                                    {option.label}
                                  </option>
                                ))}
                              </optgroup>
                            ))}
                          </select>
                        </div>
                        <div className="forge-table-cell" role="cell" data-label="Date Range">
                          <select
                            className="input forge-cell-input"
                            value={chip.dateRange}
                            aria-label="Date range"
                            onChange={(event) =>
                              patchChip(chip.id, {
                                dateRange: event.target.value as RuleChip["dateRange"],
                              })
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
                              patchChip(chip.id, {
                                operator: event.target.value as RuleOperator,
                              })
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
                                patchChip(chip.id, {
                                  weightPct: Number(event.target.value),
                                })
                              }
                            />
                            <span className="forge-cell-unit forge-cell-unit--weight">%</span>
                          </span>
                        </div>
                        <div className="forge-table-cell" role="cell" data-label="My Plan">
                          <textarea
                            className={
                              isExamplePlan(chip.myPlan)
                                ? "input forge-cell-input forge-cell-area forge-cell-plan forge-cell-plan--example"
                                : "input forge-cell-input forge-cell-area forge-cell-plan"
                            }
                            rows={2}
                            value={chip.myPlan ?? ""}
                            placeholder="What will you do if this Trim Zone rule breaks?"
                            aria-label="My plan"
                            onChange={(event) =>
                              patchChip(chip.id, {
                                myPlan: normalizePlanEdit(chip.myPlan, event.target.value),
                              })
                            }
                          />
                        </div>
                        <div
                          className="forge-table-cell forge-table-cell--actions"
                          role="cell"
                          data-label="Actions"
                        >
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

            {draftTags.length > 0 ? (
              <div className="forge-trim-zone-tags">
                <span className="config-label forge-label forge-label--muted">
                  Trim Zone Tags
                </span>
                <ul className="watch-plan-triggers">
                  {draftTags.map((tag) => (
                    <li key={tag.id}>
                      <span className="forge-pill-row">
                        <span className="chip">{tag.label}</span>
                        <button
                          type="button"
                          className="icon-btn icon-btn--danger"
                          aria-label={`Remove tag ${tag.label}`}
                          onClick={() => deleteTag(tag.id)}
                        >
                          <Trash aria-hidden weight="regular" />
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
    </ForgeTableModal>
  );
}
