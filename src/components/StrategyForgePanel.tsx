import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_CATEGORY_WEIGHTS } from "../data";
import { dataSource } from "../lib/datasource";
import {
  CATEGORY_META,
  CATEGORY_ORDER,
  METRICS,
  formatChipCondition,
} from "../lib/forge/metrics";
import {
  enabledTickersByAppliedPortfolio,
  isTickerEnabledForStrategy,
  sortedPortfolioHoldings,
} from "../lib/forge/tickerStrategy";
import {
  APPLY_READINESS_MESSAGE,
  isStrategyApplyReady,
} from "../lib/forge/applyReadiness";
import {
  enabledCategories,
  isCategoryEnabled,
  patchCategoryEnabled,
} from "../lib/forge/categoryEnabled";
import {
  ArrowCounterClockwise,
  FloppyDisk,
  PencilSimple,
  Trash,
} from "../lib/icons";
import { ForgeToast } from "./forge/ForgeToast";
import { useAppState } from "../state/AppState";
import { ActionFooter } from "./ActionFooter";
import { Checkbox } from "./Checkbox";
import { Dropdown } from "./Dropdown";
import { ForgePill } from "./ForgePill";
import { MultiSelect } from "./MultiSelect";
import { InfoTip, Tooltip } from "./Tooltip";
// Table modals load on open (performance-budget.md: big secondary UI is lazy).
const RuleChipsTableModal = lazy(() =>
  import("./forge/RuleChipsTableModal").then((m) => ({
    default: m.RuleChipsTableModal,
  })),
);
const TagsTableModal = lazy(() =>
  import("./forge/TagsTableModal").then((m) => ({ default: m.TagsTableModal })),
);
const Layer3ZoneTableModal = lazy(() =>
  import("./forge/Layer3ZoneTableModal").then((m) => ({
    default: m.Layer3ZoneTableModal,
  })),
);
import {
  LAYER3_ZONE_ORDER,
  LAYER3_ZONES,
  type Layer3ZoneId,
} from "../lib/forge/layer3Zones";
import { GO_TO_CASH_SICADFU } from "../lib/status";
import type {
  CheckInterval,
  RuleCategory,
  RuleChip,
  RuleTag,
  Strategy,
} from "../types";

// ---------------------------------------------------------------------------
// The Configure card (Strategy Forge). Layout follows the Figma design:
// header → name/description → applied portfolios → conviction
// preview → in-card section tabs → apply-readiness toast → Strategy Cadence →
// six category sections (question, rule-chip box + tags box opening table
// modals) → actions. All rule/tag editing happens in the table modals
// (RuleChipsTableModal / TagsTableModal).
// ---------------------------------------------------------------------------

// ---- Cadence helpers -------------------------------------------------------

const BETA0_CADENCE_FLOOR: CheckInterval[] = ["1D", "1W", "1M"];
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

// ---- In-card section tabs (all viewports) ---------------------------------
// Horizontal tab strip navigates the Configure card one section at a time.
// Distinct from the page-level `Tabs` component (Configure / Preview Watchlist).

export interface SectionTab {
  id: string;
  label: string;
}

function SectionTabs({
  tabs,
  active,
  onChange,
}: {
  tabs: SectionTab[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="forge-section-tabs" role="tablist" aria-label="Configuration sections">
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={isActive ? "forge-section-tab is-active" : "forge-section-tab"}
            onClick={() => onChange(tab.id)}
          >
            <span className="forge-section-tab-label">{tab.label}</span>
          </button>
        );
      })}
    </div>
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
      <ForgePill state={chip.enabled ? "default" : "off"}>{chip.label}</ForgePill>
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
      <ForgePill state={tag.system ? "muted" : "default"}>
        {tag.label}
      </ForgePill>
    </Tooltip>
  );
}

// ---- Main panel ----------------------------------------------------------

interface TableEditor {
  kind: "chips" | "tags" | Layer3ZoneId;
  category?: RuleCategory;
}

export function StrategyForgePanel({ strategy }: { strategy: Strategy | undefined }) {
  const { updateStrategy, resetStrategy, deleteStrategy, portfolios, setTickerEnabledForStrategy } =
    useAppState();

  const portfolioOptions = useMemo(
    () => portfolios.map((portfolio) => ({ value: portfolio.id, label: portfolio.label })),
    [portfolios],
  );
  const appliedPortfolioIds = strategy?.appliedPortfolioIds ?? [];
  const appliedPortfolios = useMemo(
    () => portfolios.filter((portfolio) => appliedPortfolioIds.includes(portfolio.id)),
    [appliedPortfolioIds, portfolios],
  );
  const appliedPortfolioOptions = useMemo(
    () =>
      appliedPortfolios.map((portfolio) => ({
        value: portfolio.id,
        label: portfolio.label,
      })),
    [appliedPortfolios],
  );

  const [editor, setEditor] = useState<TableEditor | null>(null);
  /** Chip/tag rows as they were when the table modal opened — Cancel restores this. */
  const editorSnapshotRef = useRef<
    RuleChip[] | RuleTag[] | { rules: RuleChip[]; tags: RuleTag[] }
  >([]);
  const [editingWeight, setEditingWeight] = useState<RuleCategory | null>(null);
  const [activeSection, setActiveSection] = useState<string>("identity");
  const [selectedTickerPortfolioId, setSelectedTickerPortfolioId] = useState("");
  const [applyToastDismissed, setApplyToastDismissed] = useState(false);
  const [updateToastVisible, setUpdateToastVisible] = useState(false);
  const [infoToast, setInfoToast] = useState<string | null>(null);
  const [updatedFlash, setUpdatedFlash] = useState(false);
  const flashTimer = useRef<number | undefined>(undefined);
  const updateToastTimer = useRef<number | undefined>(undefined);
  const infoToastTimer = useRef<number | undefined>(undefined);
  const previousStrategyIdRef = useRef<string | undefined>(undefined);
  useEffect(
    () => () => {
      window.clearTimeout(flashTimer.current);
      window.clearTimeout(updateToastTimer.current);
      window.clearTimeout(infoToastTimer.current);
    },
    [],
  );

  function showInfoToast(message: string) {
    setInfoToast(message);
    window.clearTimeout(infoToastTimer.current);
    infoToastTimer.current = window.setTimeout(() => setInfoToast(null), 10000);
  }
  useEffect(() => {
    setActiveSection("identity");
    setSelectedTickerPortfolioId("");
    const previousId = previousStrategyIdRef.current;
    if (previousId && previousId !== strategy?.id) {
      setApplyToastDismissed(false);
    }
    previousStrategyIdRef.current = strategy?.id;
  }, [strategy?.id]);

  useEffect(() => {
    setSelectedTickerPortfolioId((current) => {
      if (appliedPortfolios.some((portfolio) => portfolio.id === current)) return current;
      return appliedPortfolios[0]?.id ?? "";
    });
  }, [appliedPortfolios]);

  const selectedTickerPortfolio = useMemo(
    () => appliedPortfolios.find((portfolio) => portfolio.id === selectedTickerPortfolioId),
    [appliedPortfolios, selectedTickerPortfolioId],
  );
  const portfolioHoldings = useMemo(
    () =>
      selectedTickerPortfolio ? sortedPortfolioHoldings(selectedTickerPortfolio) : [],
    [selectedTickerPortfolio],
  );

  // "Unsaved" = strategy fields or ticker assignments changed since the last
  // Update (or since this strategy was selected). Default strategies store
  // ticker on/off in portfolio holdings; custom copies use strategy.tickerExclusions.
  const savedSnapshotRef = useRef<string | null>(null);
  const configSnapshot = useMemo(() => {
    if (!strategy) return null;
    return JSON.stringify({
      strategy,
      tickers: enabledTickersByAppliedPortfolio(strategy, portfolios),
    });
  }, [strategy, portfolios]);
  useEffect(() => {
    savedSnapshotRef.current = configSnapshot;
    // Intentionally keyed on the strategy id only — resets the baseline on
    // selection change, not on every edit (configSnapshot changes on every
    // keystroke, which would defeat the dirty check).
  }, [strategy?.id]);
  const isDirty =
    configSnapshot !== null && configSnapshot !== savedSnapshotRef.current;

  const rules = useMemo(() => strategy?.rules ?? [], [strategy]);
  const ruleTags = useMemo(() => strategy?.ruleTags ?? [], [strategy]);
  const layer3ByZone = useMemo(() => {
    const read = (zoneId: Layer3ZoneId) => {
      const meta = LAYER3_ZONES[zoneId];
      return {
        rules: (strategy?.[meta.rulesKey] ?? []) as RuleChip[],
        tags: (strategy?.[meta.tagsKey] ?? []) as RuleTag[],
      };
    };
    return {
      trimZone: read("trimZone"),
      addZone: read("addZone"),
      goToCash: read("goToCash"),
    };
  }, [strategy]);

  const applyReady = useMemo(
    () => (strategy ? isStrategyApplyReady(strategy) : true),
    [strategy],
  );

  useEffect(() => {
    if (applyReady) setApplyToastDismissed(false);
  }, [applyReady]);

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

  // Beta 0: only daily+ options. Technicals can't be faster than check.
  const checkOptions = BETA0_CADENCE_FLOOR.map((interval) => ({
    value: interval,
    label: INTERVAL_LABEL[interval],
  }));
  const checkIndex = BETA0_CADENCE_FLOOR.indexOf(
    (BETA0_CADENCE_FLOOR.includes(checkInterval)
      ? checkInterval
      : "1D") as (typeof BETA0_CADENCE_FLOOR)[number],
  );
  const technicalsOptions = BETA0_CADENCE_FLOOR.slice(Math.max(0, checkIndex)).map(
    (interval) => ({ value: interval, label: INTERVAL_LABEL[interval] }),
  );

  function handleCheckIntervalChange(value: string) {
    const next = value as CheckInterval;
    const nextIndex = BETA0_CADENCE_FLOOR.indexOf(
      next as (typeof BETA0_CADENCE_FLOOR)[number],
    );
    const techIndex = BETA0_CADENCE_FLOOR.indexOf(
      technicalsInterval as (typeof BETA0_CADENCE_FLOOR)[number],
    );
    const nextTech =
      techIndex < nextIndex || techIndex < 0 ? next : technicalsInterval;
    updateStrategy(id, { checkInterval: next, technicalsInterval: nextTech });
  }

  function openEditor(next: TableEditor) {
    if (next.kind === "chips" && next.category) {
      editorSnapshotRef.current = rules
        .filter((chip) => chip.category === next.category)
        .map((chip) => ({ ...chip }));
    } else if (next.kind === "tags" && next.category) {
      editorSnapshotRef.current = ruleTags
        .filter((tag) => tag.category === next.category)
        .map((tag) => ({ ...tag, chipIds: [...tag.chipIds] }));
    } else if (next.kind in LAYER3_ZONES) {
      const zone = layer3ByZone[next.kind as Layer3ZoneId];
      editorSnapshotRef.current = {
        rules: zone.rules.map((chip) => ({ ...chip })),
        tags: zone.tags.map((tag) => ({ ...tag, chipIds: [...tag.chipIds] })),
      };
    }
    setEditor(next);
  }

  function commitChips(category: RuleCategory, chips: RuleChip[]) {
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
  }

  function commitTags(category: RuleCategory, tags: RuleTag[]) {
    updateStrategy(id, {
      ruleTags: [...ruleTags.filter((tag) => tag.category !== category), ...tags],
    });
  }

  function commitLayer3Zone(
    zoneId: Layer3ZoneId,
    next: { rules: RuleChip[]; tags: RuleTag[] },
  ) {
    const meta = LAYER3_ZONES[zoneId];
    updateStrategy(id, {
      [meta.rulesKey]: next.rules,
      [meta.tagsKey]: next.tags,
    });
  }

  function cancelEditor() {
    if (!editor) return;
    if (editor.kind === "chips" && editor.category) {
      commitChips(editor.category, editorSnapshotRef.current as RuleChip[]);
    } else if (editor.kind === "tags" && editor.category) {
      commitTags(editor.category, editorSnapshotRef.current as RuleTag[]);
    } else if (editor.kind in LAYER3_ZONES) {
      commitLayer3Zone(
        editor.kind as Layer3ZoneId,
        editorSnapshotRef.current as { rules: RuleChip[]; tags: RuleTag[] },
      );
    }
    setEditor(null);
  }

  function dismissEditor() {
    setEditor(null);
  }

  function handleUpdateStrategy() {
    // Edits apply live; Update confirms + re-runs the completeness checks so
    // the user gets explicit feedback before heading to Apply. Also moves the
    // "last saved" baseline forward, so the button disables again until the
    // next edit.
    savedSnapshotRef.current = configSnapshot;
    setUpdatedFlash(true);
    setUpdateToastVisible(true);
    window.clearTimeout(flashTimer.current);
    window.clearTimeout(updateToastTimer.current);
    flashTimer.current = window.setTimeout(() => setUpdatedFlash(false), 2500);
    updateToastTimer.current = window.setTimeout(() => setUpdateToastVisible(false), 2500);
  }

  const weightFor = (category: RuleCategory): number | undefined =>
    weights?.[category];

  function patchCategoryWeight(category: RuleCategory, value: number) {
    if (!isCategoryEnabled(strategy, category)) return;
    updateStrategy(id, {
      categoryWeights: {
        ...(weights ?? DEFAULT_CATEGORY_WEIGHTS),
        [category]: value,
      },
    });
  }

  function toggleCategoryEnabled(category: RuleCategory, enabled: boolean) {
    if (!enabled && enabledCategories(strategy).length <= 1) {
      showInfoToast("Keep at least one category on for conviction scoring.");
      return;
    }
    const patch = patchCategoryEnabled(strategy, category, enabled);
    if (!patch) return;
    updateStrategy(id, patch);
    const label = CATEGORY_META[category].stepLabel;
    if (!enabled) {
      showInfoToast(
        `${label} no longer counts toward conviction — its weight stays parked. The other categories were scaled up to fill 100% — adjust them if your plan shifted.`,
      );
    } else {
      showInfoToast(
        `${label} counts toward conviction again at its parked weight. The other categories were scaled down to make room — adjust them if your plan shifted.`,
      );
    }
  }

  function handleSectionChange(next: string) {
    setActiveSection(next);
    if (
      CATEGORY_ORDER.includes(next as RuleCategory) &&
      !isCategoryEnabled(strategy, next as RuleCategory)
    ) {
      const label = CATEGORY_META[next as RuleCategory].stepLabel;
      showInfoToast(
        `${label} is off for conviction scoring. Enable it under Description → Conviction Scores.`,
      );
    }
  }

  const convictionWeightTotal = enabledCategories(strategy).reduce(
    (sum, category) => sum + (weightFor(category) ?? 0),
    0,
  );

  // In-card section tabs: Description + Cadence + the six categories.
  const sectionTabs: SectionTab[] = [
    { id: "identity", label: "Description" },
    { id: "tickers", label: "Tickers" },
    { id: "cadence", label: "Strategy Cadence" },
    ...CATEGORY_ORDER.map((category) => ({
      id: category,
      label: CATEGORY_META[category].stepLabel,
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

      {/* In-card section tabs — one Configure pane visible at a time. */}
      <SectionTabs
        tabs={sectionTabs}
        active={activeSection}
        onChange={handleSectionChange}
      />

      {/* Toasts overlay the scroll body so they don't shove the form down. */}
      <div className="strategy-config-main">
      {(updateToastVisible ||
        infoToast ||
        (!applyReady && !applyToastDismissed)) ? (
        <div className="forge-toast-stack forge-toast-stack--overlay">
          {updateToastVisible ? (
            <ForgeToast tone="success">Strategy updated.</ForgeToast>
          ) : null}
          {infoToast ? (
            <ForgeToast tone="info" onDismiss={() => setInfoToast(null)}>
              {infoToast}
            </ForgeToast>
          ) : null}
          {!applyReady && !applyToastDismissed ? (
            <ForgeToast
              tone="warning"
              onDismiss={() => setApplyToastDismissed(true)}
              dismissLabel="Dismiss apply readiness reminder"
            >
              {APPLY_READINESS_MESSAGE}
            </ForgeToast>
          ) : null}
        </div>
      ) : null}

      {/* Scrolling body — head above + the action footer below stay pinned. */}
      <div className="strategy-config-scroll">
      {/* ---- Identity (Description pane) ---- */}
      <div
        className={activeSection === "identity" ? "forge-pane is-active" : "forge-pane"}
        data-forge-section="identity"
      >
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

      {/* ---- Conviction scores (same categoryWeights as each category tab) ---- */}
      <div className="config-field">
        <span className="config-label forge-label">
          Conviction Scores
          <InfoTip
            label="About conviction scores"
            body="Each category weight is that category's share of a stock's conviction. Rule chips score a category 0–100; those scores are multiplied by these weights and summed. Uncheck a category to park its weight exactly and scale the others up to 100%. Turn it back on to restore that parked weight and scale the others down to make room. Edit weights here or on each category tab; they stay in sync."
          />
        </span>
        <div className="forge-conviction-grid">
          {CATEGORY_ORDER.map((category) => {
            const meta = CATEGORY_META[category];
            const weight = weightFor(category);
            const categoryOn = isCategoryEnabled(strategy, category);
            return (
              <div
                key={category}
                className={
                  categoryOn
                    ? "config-field forge-conviction-field"
                    : "config-field forge-conviction-field is-off"
                }
              >
                <div className="config-toggle forge-conviction-toggle">
                  <Checkbox
                    checked={categoryOn}
                    aria-label={`Include ${meta.stepLabel} in conviction scoring`}
                    onCheckedChange={(next) =>
                      toggleCategoryEnabled(category, next)
                    }
                  />
                  <span className="config-label forge-label forge-label--muted">
                    {meta.stepLabel}
                  </span>
                </div>
                <span className="forge-weight-edit">
                  <input
                    id={`conviction-weight-${category}`}
                    className="input forge-cell-input forge-cell-input--num forge-cell-input--weight"
                    type="number"
                    min={0}
                    max={100}
                    disabled={!categoryOn}
                    value={weight ?? 0}
                    aria-label={`${meta.stepLabel} conviction weight percent`}
                    onChange={(event) =>
                      patchCategoryWeight(category, Number(event.target.value))
                    }
                  />
                  <span className="forge-cell-unit forge-cell-unit--weight" aria-hidden>
                    %
                  </span>
                </span>
              </div>
            );
          })}
        </div>
        <p
          className={
            convictionWeightTotal === 100
              ? "forge-conviction-total"
              : "forge-conviction-total is-warn"
          }
        >
          Total: {convictionWeightTotal}%
          {convictionWeightTotal === 100 ? "" : " — must total 100%"}
        </p>
      </div>
      </div>

      {/* ---- Tickers (per-portfolio enable/disable) ---- */}
      <div
        className={activeSection === "tickers" ? "forge-pane is-active" : "forge-pane"}
        data-forge-section="tickers"
      >
        <div className="config-field">
          <span className="config-label forge-label">
            Applied Portfolios
            <InfoTip
              label="About applied portfolios on the Tickers tab"
              body="Portfolios applied on the Description tab. Choose one from the dropdown to view and toggle its tickers for this strategy. To add or remove portfolios, use the Description tab."
            />
          </span>
          {appliedPortfolios.length > 0 ? (
            <Dropdown
              id="forge-ticker-portfolio"
              label="Portfolio for ticker assignment"
              value={selectedTickerPortfolioId}
              onChange={setSelectedTickerPortfolioId}
              options={appliedPortfolioOptions}
            />
          ) : (
            <span className="forge-box-empty">
              No portfolios applied yet — select portfolios on the Description tab first.
            </span>
          )}
        </div>

        <div className="forge-box forge-box--tickers">
          <div className="forge-box-head">
            <span className="config-label forge-label forge-label--muted">
              Tickers In Selected Portfolio
              <InfoTip
                label="About tickers in the selected portfolio"
                body="Every ticker held in the selected portfolio. Tap a ticker to include or exclude it from this strategy. Default strategies start with seed assignments; custom strategies include all tickers until you turn one off."
              />
            </span>
          </div>
          <div className="forge-box-body">
            {portfolioHoldings.length > 0 ? (
              portfolioHoldings.map((holding) => {
                const enabled = isTickerEnabledForStrategy(
                  holding,
                  strategy,
                  selectedTickerPortfolioId,
                );
                const info = dataSource.getTickerInfo(holding.ticker);
                return (
                  <Tooltip
                    key={holding.ticker}
                    title={info?.company ?? holding.ticker}
                    body={
                      <>
                        {info ? (
                          <p className="tooltip-line">
                            {info.category} · {info.sector}
                          </p>
                        ) : null}
                        <p className="tooltip-line">
                          {holding.shares.toLocaleString()} shares · avg $
                          {holding.avgPrice.toFixed(2)}
                        </p>
                        <p className="tooltip-line">
                          {enabled
                            ? "Included in this strategy — tap to exclude."
                            : "Excluded from this strategy — tap to include."}
                        </p>
                      </>
                    }
                  >
                    <ForgePill
                      state={enabled ? "selected" : "inactive"}
                      variant="applied"
                      aria-label={`${enabled ? "Exclude" : "Include"} ${holding.ticker} in ${strategy.name}`}
                      onClick={() =>
                        setTickerEnabledForStrategy(
                          selectedTickerPortfolioId,
                          holding.ticker,
                          id,
                          !enabled,
                        )
                      }
                    >
                      {holding.ticker}
                    </ForgePill>
                  </Tooltip>
                );
              })
            ) : (
              <span className="forge-box-empty">
                {appliedPortfolios.length > 0
                  ? "Select an applied portfolio above to list its tickers."
                  : "Apply a portfolio on the Description tab to manage tickers here."}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ---- 1. Strategy cadence ---- */}
      <div
        className={activeSection === "cadence" ? "forge-section is-active" : "forge-section"}
        data-forge-section="cadence"
      >
        <div className="forge-section-head">
          <h3 className="forge-section-title">1. Strategy Cadence</h3>
        </div>
        <p className="forge-section-q">
          How often should the Forge notify you when your strategy checks pass
          and rules break?
        </p>
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
              value={
                BETA0_CADENCE_FLOOR.includes(checkInterval) ? checkInterval : "1D"
              }
              onChange={handleCheckIntervalChange}
              options={checkOptions}
            />
          </label>
          <label className="config-field">
            <span className="config-label forge-label forge-label--muted">
              Technical Indicators
              <InfoTip
                label="About the technicals cadence"
                body="The candle size technical indicators use. Beta 0 free-tier floor is daily or slower; can't refresh faster than the strategy check."
              />
            </span>
            <Dropdown
              id="forge-technicals-interval"
              label="Technicals interval"
              value={
                BETA0_CADENCE_FLOOR.includes(technicalsInterval)
                  ? technicalsInterval
                  : "1D"
              }
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
        const categoryOn = isCategoryEnabled(strategy, category);
        const editingThisWeight = categoryOn && editingWeight === category;
        return (
          <div
            key={category}
            className={activeSection === category ? "forge-section is-active" : "forge-section"}
            data-forge-section={category}
          >
            <div className="forge-section-head">
              <h3 className="forge-section-title">
                {index + 2}. {meta.label}
                <InfoTip label={`About ${meta.label}`} body={meta.info} />
              </h3>
              <div className="forge-section-tools">
                {!categoryOn ? (
                  <span className="chip forge-weight-chip forge-weight-chip--warn">
                    Off for conviction
                  </span>
                ) : editingThisWeight ? (
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
                        patchCategoryWeight(category, Number(event.target.value))
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
                {categoryOn ? (
                  <button
                    type="button"
                    className="icon-btn icon-btn--blue"
                    aria-label={`Edit ${meta.label} conviction weight`}
                    onClick={() => setEditingWeight(editingThisWeight ? null : category)}
                  >
                    <PencilSimple aria-hidden weight="regular" />
                  </button>
                ) : null}
              </div>
            </div>

            <p className="forge-section-q">{meta.question}</p>

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
                    onClick={() => openEditor({ kind: "chips", category })}
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
                    onClick={() => openEditor({ kind: "tags", category })}
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

              {category === "trade"
                ? LAYER3_ZONE_ORDER.map((zoneId) => {
                    const zone = LAYER3_ZONES[zoneId];
                    const { rules: zoneRules, tags: zoneTags } =
                      layer3ByZone[zoneId];
                    return (
                      <div
                        key={zoneId}
                        className="forge-box forge-box--chips forge-box--layer3-zone"
                      >
                        <div className="forge-box-head">
                          <span className="config-label forge-label forge-label--muted">
                            {zone.title}
                            <InfoTip
                              label={`About ${zone.shortName}`}
                              title={
                                zoneId === "goToCash" ? "SICADFU" : zone.shortName
                              }
                              body={
                                zoneId === "goToCash"
                                  ? `${GO_TO_CASH_SICADFU}. ${zone.boxInfoBody}`
                                  : zone.boxInfoBody
                              }
                              wide
                            />
                          </span>
                          <button
                            type="button"
                            className="icon-btn icon-btn--blue"
                            aria-label={`Edit ${zone.title}`}
                            onClick={() => openEditor({ kind: zoneId })}
                          >
                            <PencilSimple aria-hidden weight="regular" />
                          </button>
                        </div>
                        <div className="forge-box-body">
                          {zoneRules.length > 0 || zoneTags.length > 0 ? (
                            <>
                              {zoneRules.map((chip) => (
                                <ChipPill key={chip.id} chip={chip} />
                              ))}
                              {zoneTags.map((tag) => (
                                <TagPill key={tag.id} tag={tag} />
                              ))}
                            </>
                          ) : (
                            <span className="forge-box-empty">{zone.emptyBox}</span>
                          )}
                        </div>
                      </div>
                    );
                  })
                : null}
            </div>
          </div>
        );
      })}

      </div>
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
          disabled={!isDirty}
          aria-label="Update strategy"
        >
          <FloppyDisk size={16} weight={updatedFlash ? "fill" : "regular"} aria-hidden />
          <span className="btn-label">
            {updatedFlash ? "Strategy Updated" : "Update Strategy"}
          </span>
        </button>
      </ActionFooter>

      <Suspense fallback={null}>
        {editor?.kind === "chips" && editor.category ? (
          <RuleChipsTableModal
            category={editor.category}
            chips={rules.filter((chip) => chip.category === editor.category)}
            onDraftChange={(chips) => commitChips(editor.category!, chips)}
            onCancel={cancelEditor}
            onDone={dismissEditor}
          />
        ) : null}
        {editor?.kind === "tags" && editor.category ? (
          <TagsTableModal
            category={editor.category}
            tags={ruleTags.filter((tag) => tag.category === editor.category)}
            chips={rules.filter((chip) => chip.category === editor.category)}
            onDraftChange={(tags) => commitTags(editor.category!, tags)}
            onCancel={cancelEditor}
            onDone={dismissEditor}
          />
        ) : null}
        {editor && editor.kind in LAYER3_ZONES ? (
          <Layer3ZoneTableModal
            zone={LAYER3_ZONES[editor.kind as Layer3ZoneId]}
            rules={layer3ByZone[editor.kind as Layer3ZoneId].rules}
            tags={layer3ByZone[editor.kind as Layer3ZoneId].tags}
            sourceChips={rules}
            sourceTags={ruleTags}
            onDraftChange={(next) =>
              commitLayer3Zone(editor.kind as Layer3ZoneId, next)
            }
            onCancel={cancelEditor}
            onDone={dismissEditor}
          />
        ) : null}
      </Suspense>
    </section>
  );
}
