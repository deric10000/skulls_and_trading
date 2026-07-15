import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAppState, type WatchEditSnapshot } from "../state/AppState";
import { asyncSearchTickers, dataSource } from "../lib/datasource";
import { getLiveQuote } from "../lib/market/liveCache";
import { formatChange, formatPrice, formatDecimals } from "../lib/format";
import { NeedsDataReviewFlag } from "./NeedsDataReviewFlag";
import { formatChipCondition, formatObservedBreach } from "../lib/forge/metrics";
import {
  categoriesForStatus,
  isExamplePlan,
  isLayer3Status,
} from "../lib/forge/myPlan";
import { LAYER3_ZONES, type Layer3ZoneId } from "../lib/forge/layer3Zones";
import type { ChipResult, StockAlignment } from "../lib/forge/scoring";
import {
  resolveAggregatedStatus,
  resolveStatus,
} from "../lib/forge/status";
import {
  isTickerEnabledForStrategy,
  shouldScoreTickerWithStrategy,
} from "../lib/forge/tickerStrategy";
import { STATUS_TONE } from "../lib/status";
import { StatusStack, WatchAlignLabel, WatchConvictionHead } from "./StatusBadge";
import { ForgePill } from "./ForgePill";
import { PortfolioCompass } from "./PortfolioCompass";
import {
  CaretDown,
  CaretLeft,
  CheckSquare,
  MagnifyingGlass,
  PencilSimple,
  Plus,
  Square,
  Trash,
  X,
} from "../lib/icons";
import {
  nextAverageCost,
  openPnlPercent,
  openPnlTotal,
  qtySideFromDelta,
} from "../lib/finance/averageCost";
import {
  estimateFillTimestamp,
  formatFillTimestampEst,
} from "../lib/finance/timestamps";
import type {
  LogEntry,
  PendingQtyOrder,
  Portfolio,
  PortfolioHolding,
  RuleCategory,
  RuleChip,
  RuleTag,
  StatusType,
  Strategy,
  WatchlistItem,
} from "../types";
import { ForgeToast } from "./forge/ForgeToast";
import { ForgeTableModal } from "./forge/ForgeTableModal";
import { ActionFooter } from "./ActionFooter";

/** Closed Beta: hide under-conviction Watch Summary detail until Dashboard ships. */
const SHOW_WATCH_SUMMARY_DETAIL = false;

interface StrategyBreakdown {
  strategy: Strategy;
  alignment: StockAlignment | undefined;
}

type PlanTrigger =
  | {
      kind: "chip";
      id: string;
      label: string;
      myPlan?: string;
      chip: RuleChip;
      dataPoints: string[];
    }
  | {
      kind: "tag";
      id: string;
      label: string;
      myPlan?: string;
      tag: RuleTag;
      dataPoints: string[];
    };

/** Live failing reading + threshold miss, for chips and tag members. */
function formatObservedDataPoint(result: ChipResult): string {
  return formatObservedBreach(result.chip, result.value);
}

/** Title for the My Plan label — nickname + "is not met". */
function formatPlanTriggerTitle(trigger: PlanTrigger): string {
  return `My Plan if ${trigger.label} is not met`;
}

interface PlanSection {
  status: StatusType;
  triggers: PlanTrigger[];
}

function collectTriggersForCategories(
  strategyBreakdowns: StrategyBreakdown[],
  categories: Set<RuleCategory>,
): PlanTrigger[] {
  if (categories.size === 0) return [];

  const triggers: PlanTrigger[] = [];
  const seen = new Set<string>();

  /** Prefer the live strategy's myPlan (Forge edits) over the scored chip copy. */
  const resolveChipPlan = (strategy: Strategy, chip: RuleChip): string | undefined => {
    const rawId = chip.id.includes(":") ? chip.id.slice(chip.id.lastIndexOf(":") + 1) : chip.id;
    const live =
      strategy.rules?.find((item) => item.id === chip.id) ??
      strategy.rules?.find((item) => item.id === rawId);
    return live?.myPlan ?? chip.myPlan;
  };

  const resolveTagPlan = (strategy: Strategy, tag: RuleTag): string | undefined => {
    const live = strategy.ruleTags?.find((item) => item.id === tag.id);
    return live?.myPlan ?? tag.myPlan;
  };

  for (const { strategy, alignment } of strategyBreakdowns) {
    const failing = (alignment?.results ?? []).filter(
      (result): result is ChipResult =>
        result.outcome === "fail" && categories.has(result.chip.category),
    );
    if (failing.length === 0) continue;

    for (const result of failing) {
      const key = `chip:${result.chip.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      triggers.push({
        kind: "chip",
        id: result.chip.id,
        label: result.chip.label,
        myPlan: resolveChipPlan(strategy, result.chip),
        chip: result.chip,
        dataPoints: [formatObservedDataPoint(result)],
      });
    }

    const failingIds = new Set(failing.map((result) => result.chip.id));
    void failingIds;
    // Merged scoring prefixes chip ids with `strategyId:` — match tag members
    // against both the raw id and the suffix after the last colon.
    const chipMatchesTag = (chipId: string, tagChipId: string) =>
      chipId === tagChipId || chipId.endsWith(`:${tagChipId}`);

    for (const tag of strategy.ruleTags ?? []) {
      if (!categories.has(tag.category) || tag.system) continue;
      const memberFails = failing.filter((result) =>
        tag.chipIds.some((tagChipId) => chipMatchesTag(result.chip.id, tagChipId)),
      );
      if (memberFails.length === 0) continue;
      const key = `tag:${tag.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      triggers.push({
        kind: "tag",
        id: tag.id,
        label: tag.label,
        myPlan: resolveTagPlan(strategy, tag),
        tag,
        dataPoints: memberFails.map(formatObservedDataPoint),
      });
    }
  }

  return triggers;
}

const ZONE_STATUS_TO_ID: Partial<Record<StatusType, Layer3ZoneId>> = {
  "Trim Zone": "trimZone",
  "Add Zone": "addZone",
  "Go to Cash": "goToCash",
};

/** Failing Layer 3 overlay chips/tags for a zone status. */
function collectZoneTriggers(
  strategyBreakdowns: StrategyBreakdown[],
  status: StatusType,
): PlanTrigger[] {
  const zoneId = ZONE_STATUS_TO_ID[status];
  if (!zoneId) return [];
  const meta = LAYER3_ZONES[zoneId];
  const triggers: PlanTrigger[] = [];
  const seen = new Set<string>();

  for (const { strategy, alignment } of strategyBreakdowns) {
    const zoneRules = strategy[meta.rulesKey] ?? [];
    const zoneRuleIds = new Set(zoneRules.map((chip) => chip.id));
    const failing = (alignment?.zoneResults ?? []).filter(
      (result) =>
        result.outcome === "fail" &&
        (zoneRuleIds.has(result.chip.id) ||
          [...zoneRuleIds].some((id) => result.chip.id.endsWith(`:${id}`))),
    );
    if (failing.length === 0) continue;

    const resolveChipPlan = (chip: RuleChip): string | undefined => {
      const rawId = chip.id.includes(":")
        ? chip.id.slice(chip.id.lastIndexOf(":") + 1)
        : chip.id;
      const live =
        zoneRules.find((item) => item.id === chip.id) ??
        zoneRules.find((item) => item.id === rawId);
      return live?.myPlan ?? chip.myPlan;
    };

    for (const result of failing) {
      const key = `chip:${result.chip.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      triggers.push({
        kind: "chip",
        id: result.chip.id,
        label: result.chip.label,
        myPlan: resolveChipPlan(result.chip),
        chip: result.chip,
        dataPoints: [formatObservedDataPoint(result)],
      });
    }

    const zoneTags = strategy[meta.tagsKey] ?? [];
    for (const tag of zoneTags) {
      if (tag.system) continue;
      const memberFails = failing.filter((result) =>
        tag.chipIds.some(
          (tagChipId) =>
            result.chip.id === tagChipId ||
            result.chip.id.endsWith(`:${tagChipId}`),
        ),
      );
      if (memberFails.length === 0) continue;
      const key = `tag:${tag.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      triggers.push({
        kind: "tag",
        id: tag.id,
        label: tag.label,
        myPlan: tag.myPlan,
        tag,
        dataPoints: memberFails.map(formatObservedDataPoint),
      });
    }
  }

  return triggers;
}

/** One section per status label, with only the failing chips/tags that drive it. */
function collectPlanSections(
  strategyBreakdowns: StrategyBreakdown[],
  statuses: StatusType[],
): PlanSection[] {
  return statuses
    .map((status) => ({
      status,
      triggers: isLayer3Status(status)
        ? collectZoneTriggers(strategyBreakdowns, status)
        : collectTriggersForCategories(
            strategyBreakdowns,
            new Set(categoriesForStatus(status)),
          ),
    }))
    .filter((section) => section.triggers.length > 0);
}

function statusLabelsFromAlignment(
  alignment: StockAlignment | undefined,
  fallbackStatus: StatusType,
): StatusType[] {
  if (alignment?.resolved) {
    const labels = [alignment.resolved.primary, ...alignment.resolved.categoryFlags];
    return [...new Set(labels)];
  }
  if (alignment?.status) return [alignment.status];
  return fallbackStatus ? [fallbackStatus] : [];
}

/** One applied strategy: name chip + its own conviction/plan box. */
function StrategyConvictionBlock({
  strategy,
  alignment,
  fallbackStatus,
  ticker,
}: {
  strategy: Strategy;
  alignment: StockAlignment | undefined;
  fallbackStatus: StatusType;
  ticker: string;
}) {
  const conviction = alignment?.conviction ?? 0;
  const resolved = alignment?.resolved;
  const status = alignment?.status ?? fallbackStatus;

  const statusLabels = useMemo(
    () => statusLabelsFromAlignment(alignment, fallbackStatus),
    [alignment, fallbackStatus],
  );

  const planSections = useMemo(
    () =>
      collectPlanSections([{ strategy, alignment }], statusLabels),
    [strategy, alignment, statusLabels],
  );

  const planTriggers = useMemo(
    () => planSections.flatMap((section) => section.triggers),
    [planSections],
  );

  const triggerKey = planTriggers
    .map((trigger) => `${trigger.kind}:${trigger.id}`)
    .join("|");

  const [selectedTriggerId, setSelectedTriggerId] = useState<string | null>(null);
  const [expandedPlanStatuses, setExpandedPlanStatuses] = useState<Set<StatusType>>(
    () => new Set(),
  );

  useEffect(() => {
    setSelectedTriggerId(
      planTriggers[0] ? `${planTriggers[0].kind}:${planTriggers[0].id}` : null,
    );
    setExpandedPlanStatuses(
      planSections[0] ? new Set([planSections[0].status]) : new Set(),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- triggerKey fingerprints the set
  }, [ticker, strategy.id, triggerKey]);

  function togglePlanSection(statusLabel: StatusType) {
    const willExpand = !expandedPlanStatuses.has(statusLabel);
    setExpandedPlanStatuses((current) => {
      const next = new Set(current);
      if (next.has(statusLabel)) next.delete(statusLabel);
      else next.add(statusLabel);
      return next;
    });
    if (willExpand) {
      const section = planSections.find((item) => item.status === statusLabel);
      const first = section?.triggers[0];
      if (first) setSelectedTriggerId(`${first.kind}:${first.id}`);
    }
  }

  const selectedTrigger =
    planTriggers.find(
      (trigger) => `${trigger.kind}:${trigger.id}` === selectedTriggerId,
    ) ?? planTriggers[0];

  const sectionIdBase = `watch-plan-${strategy.id}`;

  return (
    <div className="watch-strategy-block">
      <ul className="signal-stack" aria-label={`${strategy.name} strategy`}>
        <li className="chip">{strategy.name}</li>
      </ul>
      <div className="watch-conviction-box">
        <WatchConvictionHead
          resolved={resolved}
          fallbackStatus={status}
          hideStatuses={planSections.length > 0}
        />
        <span className="watch-conviction-meter">
          <span className="watch-conviction-track">
            <span
              className="watch-conviction-fill"
              style={{ width: `${conviction}%` }}
            />
          </span>
          <span className="watch-conviction-score">{formatDecimals(conviction)}</span>
        </span>

        {planSections.length > 0 ? (
          <div className="watch-summary-plan-block">
            {planSections.map((section) => {
              const expanded = expandedPlanStatuses.has(section.status);
              const panelId = `${sectionIdBase}-${section.status.replace(/\s+/g, "-").toLowerCase()}`;
              const sectionTone = STATUS_TONE[section.status];
              const sectionSelected =
                selectedTrigger &&
                section.triggers.some(
                  (trigger) =>
                    `${trigger.kind}:${trigger.id}` ===
                    `${selectedTrigger.kind}:${selectedTrigger.id}`,
                )
                  ? selectedTrigger
                  : null;
              const sectionPlanTitle = sectionSelected
                ? formatPlanTriggerTitle(sectionSelected)
                : null;

              return (
                <div
                  key={section.status}
                  className={
                    expanded
                      ? "watch-plan-section is-expanded"
                      : "watch-plan-section"
                  }
                >
                  <button
                    type="button"
                    className="watch-plan-section-toggle"
                    aria-expanded={expanded}
                    aria-controls={panelId}
                    onClick={() => togglePlanSection(section.status)}
                  >
                    <WatchAlignLabel status={section.status} />
                    <CaretDown
                      className="watch-plan-section-caret"
                      aria-hidden
                      weight="regular"
                    />
                  </button>
                  {expanded ? (
                    <div id={panelId} className="watch-plan-section-body">
                      <ul className="watch-plan-triggers">
                        {section.triggers.map((trigger) => {
                          const key = `${trigger.kind}:${trigger.id}`;
                          const selected = selectedTrigger
                            ? `${selectedTrigger.kind}:${selectedTrigger.id}` === key
                            : false;
                          return (
                            <li key={key}>
                              <ForgePill
                                state={selected ? "selected" : "inactive"}
                                onClick={() => setSelectedTriggerId(key)}
                              >
                                {trigger.label}
                              </ForgePill>
                            </li>
                          );
                        })}
                      </ul>
                      {sectionSelected && sectionPlanTitle ? (
                        <div className="watch-summary-my-plan">
                          <span className="config-label forge-label">
                            {sectionPlanTitle}
                          </span>
                          {sectionSelected.dataPoints.length > 0 ? (
                            <ul
                              className={`watch-my-plan-datapoints watch-align--${sectionTone}`}
                              aria-label="Failing data points"
                            >
                              {sectionSelected.dataPoints.map((point) => (
                                <li key={point}>{point}</li>
                              ))}
                            </ul>
                          ) : null}
                          <p
                            className={
                              isExamplePlan(sectionSelected.myPlan)
                                ? "watch-my-plan-text watch-my-plan-text--example"
                                : "watch-my-plan-text"
                            }
                          >
                            {sectionSelected.myPlan?.trim()
                              ? sectionSelected.myPlan
                              : "No plan written yet for this rule."}
                          </p>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function WatchSummary({
  item,
  logs,
  strategyBreakdowns,
}: {
  item: WatchlistItem;
  logs: LogEntry[];
  /** Strategies applied to this ticker in the **current** portfolio only
      (AppState.getAppliedStrategiesForTicker(ticker, portfolioId)). Each carries
      its own rule-chip breakdown — not a cross-portfolio union. Drives both
      the strategy-name chip stack and the "calculating"/"excluded" sections
      below, so the two always agree. */
  strategyBreakdowns: StrategyBreakdown[];
}) {
  const owned = item.shares > 0;
  const marketValue = item.price * item.shares;
  const totalPnl = (item.price - item.avgPrice) * item.shares;
  const changeUp = item.changePct >= 0;
  const changeClass = changeUp ? "watch-change--up" : "watch-change--down";

  const analysis = SHOW_WATCH_SUMMARY_DETAIL
    ? dataSource.getTickerAnalysis(item.ticker)
    : null;
  const latestLog = SHOW_WATCH_SUMMARY_DETAIL ? logs[0] : undefined;

  return (
    <div className="watch-summary">
      {/* Selected ticker card — same structure/styles as the list-row
          `.watch-select` card; details expand below the conviction box. */}
      <div className="watch-item select-card is-selected watch-summary-card">
        <div className="watch-select" aria-pressed="true">
          <span className="watch-head">
            <span className="watch-id">
              <span className="watch-ticker">
                <span className="watch-selected-dot" aria-hidden="true" />
                {item.ticker}
              </span>
              <span className="watch-name">{item.name}</span>
            </span>
            {owned ? (
              <span className="watch-mvqty">
                <span className="watch-field-label">Market Value | Qty</span>
                <span className="watch-figure watch-figure--strong">
                  {formatPrice(marketValue)}
                </span>
                <span className="watch-figure">{item.shares}</span>
              </span>
            ) : null}
          </span>

          <span className="watch-body">
            <span className="watch-metrics">
              {owned ? (
                <span className="watch-metric-pair">
                  <span className="watch-metric">
                    <span className="watch-field-label">Last Price</span>
                    <span className="watch-figure watch-figure--strong">
                      {formatPrice(item.price)}
                    </span>
                  </span>
                  <span className="watch-metric">
                    <span className="watch-field-label">Avg. Price</span>
                    <span className="watch-figure">
                      {formatPrice(item.avgPrice)}
                    </span>
                  </span>
                </span>
              ) : (
                <span className="watch-metric">
                  <span className="watch-field-label">Last Price</span>
                  <span className="watch-figure watch-figure--strong">
                    {formatPrice(item.price)}
                  </span>
                </span>
              )}
              {owned ? (
                <span className="watch-metric">
                  <span className="watch-field-label">
                    {"Open P&L% | Total"}
                  </span>
                  <span className="watch-pnl">
                    <span className={`watch-figure watch-figure--medium ${changeClass}`}>
                      {formatChange(item.changePct)}
                    </span>
                    <span className={`watch-figure ${changeClass}`}>
                      {formatPrice(totalPnl)}
                    </span>
                  </span>
                </span>
              ) : null}
            </span>

            <div className="watch-strategy-stack">
              {strategyBreakdowns.length > 0 ? (
                strategyBreakdowns.map(({ strategy, alignment }) => (
                  <StrategyConvictionBlock
                    key={strategy.id}
                    strategy={strategy}
                    alignment={alignment}
                    fallbackStatus={item.status}
                    ticker={item.ticker}
                  />
                ))
              ) : (
                <div className="watch-conviction-box">
                  <WatchConvictionHead
                    resolved={item.resolved}
                    fallbackStatus={item.status}
                  />
                  <span className="watch-conviction-meter">
                    <span className="watch-conviction-track">
                      <span
                        className="watch-conviction-fill"
                        style={{ width: `${item.conviction}%` }}
                      />
                    </span>
                    <span className="watch-conviction-score">
                      {formatDecimals(item.conviction)}
                    </span>
                  </span>
                </div>
              )}
            </div>
          </span>
        </div>
      </div>

      {SHOW_WATCH_SUMMARY_DETAIL ? (
        <>
          <dl className="watch-summary-detail">
            <div className="watch-summary-row">
              <dt>Why</dt>
              <dd>{item.reason}</dd>
            </div>
            {analysis ? (
              <>
                <div className="watch-summary-row">
                  <dt>Setup</dt>
                  <dd>{analysis.setupSummary}</dd>
                </div>
                <div className="watch-summary-row">
                  <dt>Thesis</dt>
                  <dd>{analysis.thesis}</dd>
                </div>
                <div className="watch-summary-row">
                  <dt>Risk</dt>
                  <dd>{analysis.risk}</dd>
                </div>
              </>
            ) : null}
          </dl>

          {latestLog ? (
            <div className="watch-summary-log">
              <span className="watch-summary-log-label">
                Captain&rsquo;s Log · {logs.length}
              </span>
              <div className="watch-summary-log-entry">
                <span className="watch-summary-log-title">{latestLog.title}</span>
                <span className="watch-summary-log-time">{latestLog.timestamp}</span>
              </div>
              <p className="watch-summary-log-note">{latestLog.note}</p>
            </div>
          ) : null}

          {/* What's actually driving (or excluded from) this ticker's conviction
              per applied strategy — one block per strategy shown in the chip
              stack above, each with its OWN rule chips, split by whether they had
              real data to evaluate. See components.mdc "Conviction chip
              breakdown standard". */}
          {strategyBreakdowns.map(({ strategy, alignment }) => {
            const results = alignment?.results ?? [];
            const activeResults = results.filter(
              (result) => result.outcome !== "no-data",
            );
            const excludedResults = results.filter(
              (result) => result.outcome === "no-data",
            );
            return (
              <div key={strategy.id} className="watch-summary-chips">
                <span className="watch-summary-chips-strategy">{strategy.name}</span>
                <div className="watch-summary-chip-group">
                  <span className="config-label forge-label">
                    Calculating Conviction
                  </span>
                  <div className="forge-box-body">
                    {activeResults.length > 0 ? (
                      activeResults.map((result) => (
                        <ForgePill
                          key={result.chip.id}
                          title={formatChipCondition(result.chip)}
                        >
                          {result.chip.label}
                        </ForgePill>
                      ))
                    ) : (
                      <span className="forge-box-empty">
                        No rule chips have data yet.
                      </span>
                    )}
                  </div>
                </div>
                <div className="watch-summary-chip-group">
                  <span className="config-label forge-label">Excluded (No Data)</span>
                  <div className="forge-box-body">
                    {excludedResults.length > 0 ? (
                      excludedResults.map((result) => (
                        <ForgePill key={result.chip.id} state="off">
                          {result.chip.label}
                        </ForgePill>
                      ))
                    ) : (
                      <span className="forge-box-empty">
                        Every rule chip has data.
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </>
      ) : null}
    </div>
  );
}

const DEFAULT_SOURCE_ID = dataSource.getPortfolios()[0]?.id ?? "";

/** Current Watch source switcher — multiselect-style list + create row. */
function PortfolioSourceSwitcher({
  id,
  sources,
  value,
  onChange,
  onCreateRequest,
}: {
  id: string;
  sources: Portfolio[];
  value: string;
  onChange: (id: string) => void;
  /** Opens the Watchlist vs Portfolio modal with the typed name. */
  onCreateRequest: (label: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [createDraft, setCreateDraft] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const selected =
    sources.find((source) => source.id === value) ?? sources[0];

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function requestCreate() {
    const label = createDraft.trim();
    if (!label) return;
    onCreateRequest(label);
    setCreateDraft("");
    setOpen(false);
  }

  return (
    <div className="portfolio-source-switcher" ref={rootRef}>
      <label className="visually-hidden" htmlFor={id}>
        Switch portfolio or watchlist
      </label>
      <button
        type="button"
        id={id}
        className="input multiselect-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="multiselect-value">
          {selected ? (
            <span>{selected.label}</span>
          ) : (
            <span className="multiselect-placeholder">Select…</span>
          )}
        </span>
        <CaretDown className="multiselect-caret" aria-hidden weight="regular" />
      </button>
      {open ? (
        <ul
          className="multiselect-menu portfolio-ticker-suggestions"
          role="listbox"
          aria-label="Portfolios and watchlists"
        >
          <li className="portfolio-ticker-suggestion portfolio-source-add-row">
            <input
              className="input portfolio-source-add-input"
              placeholder="New name…"
              value={createDraft}
              maxLength={48}
              autoComplete="off"
              aria-label="Name for a new portfolio or watchlist"
              onChange={(event) => setCreateDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  requestCreate();
                }
                event.stopPropagation();
              }}
              onClick={(event) => event.stopPropagation()}
            />
            <button
              type="button"
              className="icon-btn"
              aria-label="Add portfolio or watchlist"
              disabled={!createDraft.trim()}
              onClick={requestCreate}
            >
              <Plus aria-hidden weight="regular" />
            </button>
          </li>
          {sources.map((source) => {
            const isSelected = source.id === value;
            return (
              <li key={source.id} className="portfolio-ticker-suggestion">
                <button
                  type="button"
                  className={
                    isSelected
                      ? "multiselect-option is-selected"
                      : "multiselect-option"
                  }
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    onChange(source.id);
                    setOpen(false);
                  }}
                >
                  <span className="portfolio-ticker-symbol">{source.label}</span>
                  <span className="portfolio-ticker-name">
                    {source.type === "watchlist" ? "Watchlist" : "Portfolio"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

function watchItemFromHolding(holding: PortfolioHolding): WatchlistItem {
  const info = dataSource.getTickerInfo(holding.ticker);
  const last = info?.lastPrice ?? 0;
  const avg = holding.avgPrice;
  return {
    ticker: holding.ticker,
    name: info ? `${info.company} · ${info.category}` : holding.ticker,
    price: last,
    changePct: openPnlPercent(last, avg),
    status: holding.status,
    conviction: holding.conviction,
    shares: holding.shares,
    avgPrice: avg,
    reason: holding.reason,
  };
}

/** Session add preview — matches seeded card layout before confirming. */
function previewWatchItem(ticker: string): WatchlistItem | null {
  const info = dataSource.getTickerInfo(ticker);
  if (!info) return null;
  const resolved = resolveStatus(0, [], { hasStrategy: false });
  return {
    ticker,
    name: `${info.company} · ${info.category}`,
    price: info.lastPrice,
    changePct: 0,
    status: resolved.primary,
    conviction: 0,
    shares: 0,
    avgPrice: 0,
    reason: "Pending research — assign a strategy and log your thesis.",
    resolved,
  };
}

/** Read-only Current Watch row used in the add-confirm modal. */
function WatchItemPreviewCard({ item }: { item: WatchlistItem }) {
  const owned = item.shares > 0;
  const marketValue = item.price * item.shares;
  const totalPnl = (item.price - item.avgPrice) * item.shares;
  const changeUp = item.changePct >= 0;
  const changeClass = changeUp ? "watch-change--up" : "watch-change--down";

  return (
    <div className="watch-item select-card watch-item--preview">
      <div className="watch-select">
        <span className="watch-head">
          <span className="watch-id">
            <span className="watch-ticker">{item.ticker}</span>
            <span className="watch-name">{item.name}</span>
          </span>
          {owned ? (
            <span className="watch-mvqty">
              <span className="watch-field-label">Market Value | Qty</span>
              <span className="watch-figure watch-figure--strong">
                {formatPrice(marketValue)}
              </span>
              <span className="watch-figure">{item.shares}</span>
            </span>
          ) : null}
        </span>

        <span className="watch-body">
          <span className="watch-metrics">
            {owned ? (
              <span className="watch-metric-pair">
                <span className="watch-metric">
                  <span className="watch-field-label">Last Price</span>
                  <span className="watch-figure watch-figure--strong">
                    {formatPrice(item.price)}
                  </span>
                </span>
                <span className="watch-metric">
                  <span className="watch-field-label">Avg. Price</span>
                  <span className="watch-figure">{formatPrice(item.avgPrice)}</span>
                </span>
              </span>
            ) : (
              <span className="watch-metric">
                <span className="watch-field-label">Last Price</span>
                <span className="watch-figure watch-figure--strong">
                  {formatPrice(item.price)}
                </span>
              </span>
            )}
            {owned ? (
              <span className="watch-metric">
                <span className="watch-field-label">{"Open P&L% | Total"}</span>
                <span className="watch-pnl">
                  <span className={`watch-figure watch-figure--medium ${changeClass}`}>
                    {formatChange(item.changePct)}
                  </span>
                  <span className={`watch-figure ${changeClass}`}>
                    {formatPrice(totalPnl)}
                  </span>
                </span>
              </span>
            ) : null}
          </span>

          <span className="watch-conviction-box">
            <WatchConvictionHead
              resolved={item.resolved}
              fallbackStatus={item.status}
            />
            <span className="watch-conviction-meter">
              <span className="watch-conviction-track">
                <span
                  className="watch-conviction-fill"
                  style={{ width: `${item.conviction}%` }}
                />
              </span>
              <span className="watch-conviction-score">{formatDecimals(item.conviction)}</span>
            </span>
          </span>
        </span>
      </div>
    </div>
  );
}

/** Qty field — local string draft while focused so caret/select behave normally. */
function WatchQtyInput({
  ticker,
  shares,
  onCommit,
}: {
  ticker: string;
  shares: number;
  onCommit: (shares: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const display = draft ?? String(shares);

  function commit(raw: string) {
    const next =
      raw.trim() === "" ? 0 : Number.parseInt(raw, 10);
    onCommit(Number.isFinite(next) ? Math.max(0, next) : 0);
  }

  return (
    <label className="watch-qty-edit">
      <span className="visually-hidden">Share quantity for {ticker}</span>
      <input
        type="number"
        className="input watch-qty-input"
        min={0}
        step={1}
        inputMode="numeric"
        autoComplete="off"
        value={display}
        onFocus={() => setDraft(String(shares))}
        onChange={(event) => {
          const raw = event.target.value;
          // Allow empty while typing; reject non-integers (e.g. "1e").
          if (raw !== "" && !/^\d+$/.test(raw)) return;
          setDraft(raw);
          // Commit as soon as the value is a number (typing or stepper) so
          // dirty / Update enable without waiting for blur.
          if (raw !== "") commit(raw);
        }}
        onBlur={(event) => {
          commit(event.target.value);
          setDraft(null);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
          }
        }}
      />
    </label>
  );
}

function buildPendingQtyOrders(
  baseline: Record<string, number>,
  drafts: Record<string, number>,
): PendingQtyOrder[] {
  const filledAt = estimateFillTimestamp();
  const tickers = new Set([...Object.keys(baseline), ...Object.keys(drafts)]);
  const orders: PendingQtyOrder[] = [];
  for (const ticker of tickers) {
    const before = baseline[ticker] ?? 0;
    const after = drafts[ticker] ?? before;
    const delta = after - before;
    const side = qtySideFromDelta(delta);
    if (!side) continue;
    const quote = dataSource.getQuote(ticker);
    orders.push({
      ticker,
      side,
      deltaShares: Math.abs(delta),
      sharesBefore: before,
      sharesAfter: after,
      fillPrice: quote?.lastPrice ?? 0,
      filledAt,
    });
  }
  return orders.sort((a, b) => a.ticker.localeCompare(b.ticker));
}

/** Edit-mode strategy picker — ticker-suggestion droplist chrome + checkbox. */
function WatchStrategyEditPicker({
  ticker,
  portfolioId,
  strategies,
  holding,
  onToggle,
}: {
  ticker: string;
  portfolioId: string;
  strategies: Strategy[];
  holding: PortfolioHolding | undefined;
  onToggle: (strategyId: string, enabled: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const enabledCount = strategies.filter((strategy) =>
    holding
      ? isTickerEnabledForStrategy(holding, strategy, portfolioId)
      : false,
  ).length;

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div
      className={open ? "watch-strategy-edit is-open" : "watch-strategy-edit"}
      ref={rootRef}
    >
      <span className="watch-field-label">Strategies</span>
      <button
        type="button"
        className="input multiselect-trigger watch-strategy-edit-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Strategies for ${ticker}`}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="multiselect-value">
          {strategies.length === 0 ? (
            <span className="multiselect-placeholder">No strategies applied</span>
          ) : enabledCount > 0 ? (
            <span>
              {enabledCount} of {strategies.length} on
            </span>
          ) : (
            <span className="multiselect-placeholder">Select strategies…</span>
          )}
        </span>
        <CaretDown className="multiselect-caret" aria-hidden weight="regular" />
      </button>
      {open ? (
        <ul
          className="multiselect-menu portfolio-ticker-suggestions watch-strategy-edit-menu"
          role="listbox"
          aria-multiselectable="true"
          aria-label={`Strategies for ${ticker}`}
        >
          {strategies.map((strategy) => {
            const on = holding
              ? isTickerEnabledForStrategy(holding, strategy, portfolioId)
              : false;
            return (
              <li key={strategy.id} className="portfolio-ticker-suggestion">
                <button
                  type="button"
                  className={
                    on ? "multiselect-option is-selected" : "multiselect-option"
                  }
                  role="option"
                  aria-selected={on}
                  onClick={() => onToggle(strategy.id, !on)}
                >
                  <span className="portfolio-ticker-symbol">{strategy.name}</span>
                </button>
                <button
                  type="button"
                  className={
                    on
                      ? "watch-strategy-check watch-strategy-check--on"
                      : "watch-strategy-check"
                  }
                  aria-label={
                    on
                      ? `Remove ${strategy.name} from ${ticker}`
                      : `Add ${strategy.name} to ${ticker}`
                  }
                  aria-pressed={on}
                  onClick={() => onToggle(strategy.id, !on)}
                >
                  {on ? (
                    <CheckSquare aria-hidden weight="fill" />
                  ) : (
                    <Square aria-hidden weight="regular" />
                  )}
                </button>
              </li>
            );
          })}
          {strategies.length === 0 ? (
            <li className="multiselect-empty">
              Apply a strategy to this list in Strategy Forge first.
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}

export function WatchlistWidget({
  readOnly = false,
  onSelectTicker,
}: {
  readOnly?: boolean;
  /**
   * Optional: called when a name is selected in the read-only (home) widget so a
   * sibling (e.g. Market Weather) can focus that ticker's sector/industry. Does
   * not affect the dashboard's global selected ticker.
   */
  onSelectTicker?: (ticker: string) => void;
}) {
  const {
    watchlist,
    selectedTicker,
    selectTicker,
    logsByTicker,
    portfolios,
    strategies,
    getPortfolioAlignment,
    getAppliedStrategiesForTicker,
    getStrategyChipBreakdown,
    addTickerToPortfolio,
    setTickerEnabledForStrategy,
    applyQtyOrders,
    removeTickerFromPortfolio,
    captureWatchEditSnapshot,
    restoreWatchEditSnapshot,
    createPortfolioSource,
    getWatchPullStamp,
    lastDataPullAtByStrategyId,
  } = useAppState();
  const [editMode, setEditMode] = useState(false);
  const [editDraft, setEditDraft] = useState("");
  const [editToast, setEditToast] = useState<string | null>(null);
  const [tickerSuggestionsOpen, setTickerSuggestionsOpen] = useState(false);
  const [editSuggestions, setEditSuggestions] = useState<
    { symbol: string; name: string }[]
  >([]);
  const [addPreview, setAddPreview] = useState<WatchlistItem | null>(null);
  /** Qty before this edit session (for buy/sell deltas). */
  const [qtyBaseline, setQtyBaseline] = useState<Record<string, number>>({});
  /** In-session qty drafts — committed only via Update → review modal. */
  const [qtyDrafts, setQtyDrafts] = useState<Record<string, number>>({});
  const [pendingOrders, setPendingOrders] = useState<PendingQtyOrder[] | null>(
    null,
  );
  /** Holdings + exclusions at enter-edit; Cancel→discard restores this. */
  const [editSnapshot, setEditSnapshot] = useState<WatchEditSnapshot | null>(
    null,
  );
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const [pendingSourceName, setPendingSourceName] = useState<string | null>(
    null,
  );
  const [pendingSourceType, setPendingSourceType] =
    useState<Portfolio["type"]>("watchlist");
  const [isMobile, setIsMobile] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 767px)").matches,
  );
  // Read-only (home) selection is local to this widget so it never mutates the
  // global selected ticker that drives the dashboard. Defaults to none selected.
  const [localSelected, setLocalSelected] = useState<string | null>(null);
  // Which portfolio/watchlist is shown. Portfolios (live-connected accounts) are
  // read-only; only a watchlist can add/remove tickers.
  const [portfolio, setPortfolio] = useState(DEFAULT_SOURCE_ID);
  // 0 = All (merged); 1..n = appliedStrategies[n-1]. Only used when ≥2 applied.
  const [strategyViewIndex, setStrategyViewIndex] = useState(0);
  const selectedSource =
    portfolios.find((option) => option.id === portfolio) ??
    portfolios[0] ?? {
      id: DEFAULT_SOURCE_ID,
      label: "Portfolio",
      type: "portfolio" as const,
      holdings: [],
    };
  const isWatchlistSource = selectedSource.type === "watchlist";
  const isDefaultSource = selectedSource.id === DEFAULT_SOURCE_ID;
  const livePortfolio = portfolios.find((item) => item.id === selectedSource.id);

  useEffect(() => {
    const q = editDraft.trim();
    if (q.length < 2) {
      setEditSuggestions([]);
      return;
    }
    let cancelled = false;
    const handle = window.setTimeout(() => {
      void asyncSearchTickers(q).then((hits) => {
        if (!cancelled) setEditSuggestions(hits);
      });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [editDraft]);

  const appliedStrategies = useMemo(
    () =>
      strategies
        .filter((strategy) =>
          (strategy.appliedPortfolioIds ?? []).includes(selectedSource.id),
        )
        .sort((a, b) => a.id.localeCompare(b.id)),
    [strategies, selectedSource.id],
  );
  const canCycleStrategies = readOnly && appliedStrategies.length >= 2;
  const cycleLength = appliedStrategies.length + 1; // All + each strategy
  const focusedStrategy =
    canCycleStrategies && strategyViewIndex > 0
      ? appliedStrategies[strategyViewIndex - 1]
      : undefined;

  useEffect(() => {
    setStrategyViewIndex(0);
    setEditMode(false);
    setEditDraft("");
    setEditToast(null);
    setTickerSuggestionsOpen(false);
    setAddPreview(null);
    setQtyBaseline({});
    setQtyDrafts({});
    setPendingOrders(null);
    setEditSnapshot(null);
    setDiscardConfirmOpen(false);
    setPendingSourceName(null);
  }, [selectedSource.id]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!canCycleStrategies) {
      setStrategyViewIndex(0);
      return;
    }
    if (strategyViewIndex >= cycleLength) {
      setStrategyViewIndex(0);
    }
  }, [canCycleStrategies, cycleLength, strategyViewIndex]);

  useEffect(() => {
    if (!addPreview) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setAddPreview(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [addPreview]);

  // Non-default sources: keep a local mirror synced from session AppState
  // portfolios (so adds in edit mode show up without hitting the static seed).
  const [watchlistItems, setWatchlistItems] = useState<WatchlistItem[]>(() =>
    (livePortfolio?.holdings ?? []).map(watchItemFromHolding),
  );
  useEffect(() => {
    if (isDefaultSource) return;
    setWatchlistItems((livePortfolio?.holdings ?? []).map(watchItemFromHolding));
  }, [isDefaultSource, livePortfolio, lastDataPullAtByStrategyId]);

  // The list to render: the default portfolio mirrors live app state (already
  // decorated with computed alignment); other sources use session holdings
  // with Forge conviction/status overlaid.
  const items = useMemo<WatchlistItem[]>(() => {
    if (isDefaultSource) return watchlist;
    const base = watchlistItems;
    const byTicker = getPortfolioAlignment(selectedSource.id).byTicker;
    return base.map((item) => {
      const aligned = byTicker[item.ticker];
      return aligned
        ? {
            ...item,
            conviction: aligned.conviction,
            status: aligned.status,
            resolved: aligned.resolved,
          }
        : item;
    });
  }, [
    isDefaultSource,
    watchlist,
    watchlistItems,
    selectedSource,
    getPortfolioAlignment,
  ]);

  // When a single applied strategy is focused (only with ≥2 applied), show only
  // that strategy's tickers with its own scores. All / single-applied-strategy
  // portfolios keep every ticker (including names with no strategy).
  const displayItems = useMemo<WatchlistItem[]>(() => {
    if (!focusedStrategy || !livePortfolio) return items;
    return items
      .filter((item) => {
        const holding = livePortfolio.holdings.find(
          (entry) => entry.ticker === item.ticker,
        );
        return (
          holding != null &&
          shouldScoreTickerWithStrategy(
            holding,
            focusedStrategy,
            livePortfolio.id,
          )
        );
      })
      .map((item) => {
        const alignment = getStrategyChipBreakdown(
          focusedStrategy.id,
          item.ticker,
          livePortfolio.id,
        );
        if (!alignment) {
          const resolved = resolveStatus(0, [], { hasStrategy: false });
          return {
            ...item,
            conviction: 0,
            status: resolved.primary,
            resolved,
          };
        }
        return {
          ...item,
          conviction: alignment.conviction,
          status: alignment.status,
          resolved: alignment.resolved,
        };
      });
  }, [items, focusedStrategy, livePortfolio, getStrategyChipBreakdown]);

  function enterEditMode() {
    const baseline: Record<string, number> = {};
    for (const item of items) baseline[item.ticker] = item.shares;
    setQtyBaseline(baseline);
    setQtyDrafts({ ...baseline });
    setEditSnapshot(captureWatchEditSnapshot(selectedSource.id));
    setDiscardConfirmOpen(false);
    setEditMode(true);
  }

  function cancelEditMode() {
    setEditMode(false);
    setEditDraft("");
    setEditToast(null);
    setTickerSuggestionsOpen(false);
    setAddPreview(null);
    setQtyBaseline({});
    setQtyDrafts({});
    setPendingOrders(null);
    setEditSnapshot(null);
    setDiscardConfirmOpen(false);
  }

  function hasStructuralEdits(snapshot: WatchEditSnapshot): boolean {
    const currentHoldings = livePortfolio?.holdings ?? [];
    if (
      JSON.stringify(currentHoldings) !== JSON.stringify(snapshot.holdings)
    ) {
      return true;
    }
    for (const [strategyId, baselineExclusions] of Object.entries(
      snapshot.tickerExclusionsByStrategy,
    )) {
      const strategy = strategies.find((entry) => entry.id === strategyId);
      const current = strategy?.tickerExclusions?.[snapshot.portfolioId] ?? [];
      if (
        JSON.stringify([...current].sort()) !==
        JSON.stringify([...baselineExclusions].sort())
      ) {
        return true;
      }
    }
    return false;
  }

  const pendingQtyOrders = useMemo(
    () =>
      editMode ? buildPendingQtyOrders(qtyBaseline, qtyDrafts) : [],
    [editMode, qtyBaseline, qtyDrafts],
  );

  const editIsDirty =
    editMode &&
    (pendingQtyOrders.length > 0 ||
      (editSnapshot != null && hasStructuralEdits(editSnapshot)));

  function requestCancelEdit() {
    if (editIsDirty) {
      setDiscardConfirmOpen(true);
      return;
    }
    cancelEditMode();
  }

  function confirmDiscardEdit() {
    if (editSnapshot) restoreWatchEditSnapshot(editSnapshot);
    cancelEditMode();
  }

  function requestUpdateOrders() {
    if (!editIsDirty) return;
    const orders = pendingQtyOrders;
    if (orders.length === 0) {
      // Structural edits already apply live — Update just closes edit mode.
      cancelEditMode();
      return;
    }
    setPendingOrders(orders);
  }

  function confirmPendingOrders() {
    if (!pendingOrders || pendingOrders.length === 0) {
      setPendingOrders(null);
      cancelEditMode();
      return;
    }
    applyQtyOrders(selectedSource.id, pendingOrders);
    setPendingOrders(null);
    cancelEditMode();
  }

  // Leave drill-in if the focused strategy filter hides the selected ticker.
  useEffect(() => {
    if (
      localSelected &&
      !displayItems.some((item) => item.ticker === localSelected)
    ) {
      setLocalSelected(null);
    }
  }, [displayItems, localSelected]);

  const activeTicker = readOnly ? localSelected : selectedTicker;

  function showEditToast(message: string) {
    setEditToast(message);
    window.setTimeout(() => setEditToast(null), 2500);
  }

  function openAddPreview(raw?: string) {
    const next = (raw ?? editDraft).trim().toUpperCase();
    if (!next) return;
    setTickerSuggestionsOpen(false);
    const preview = previewWatchItem(next);
    if (!preview) {
      showEditToast("No Data");
      return;
    }
    setEditDraft(next);
    setAddPreview(preview);
  }

  function confirmAddPreview() {
    if (!addPreview) return;
    const result = addTickerToPortfolio(selectedSource.id, addPreview.ticker);
    setAddPreview(null);
    if (result === "no-data") {
      showEditToast("No Data");
      return;
    }
    if (result === "exists") {
      showEditToast("Already on this list");
      return;
    }
    setEditDraft("");
    setTickerSuggestionsOpen(false);
  }

  function confirmCreateSource() {
    if (!pendingSourceName) return;
    const id = createPortfolioSource(pendingSourceName, pendingSourceType);
    setPendingSourceName(null);
    setPendingSourceType("watchlist");
    if (id) setPortfolio(id);
  }

  function handleRemove(ticker: string) {
    removeTickerFromPortfolio(selectedSource.id, ticker);
    setLocalSelected((current) => (current === ticker ? null : current));
  }

  // Read-only detail view: a condensed, read-only summary of the selected ticker
  // (drawn from the dashboard's signal / analysis / log data, no CRUD).
  const summaryItem =
    readOnly && localSelected
      ? displayItems.find((item) => item.ticker === localSelected)
      : undefined;

  // Strategies applied to this ticker in the **selected** portfolio only —
  // never a cross-source union (that was leaking Deric's Webull into other
  // Current Watch drill-ins for the same symbol).
  const strategyBreakdowns = useMemo(() => {
    if (!summaryItem) return [];
    return getAppliedStrategiesForTicker(
      summaryItem.ticker,
      selectedSource.id,
    ).map((strategy) => ({
      strategy,
      alignment: getStrategyChipBreakdown(
        strategy.id,
        summaryItem.ticker,
        selectedSource.id,
      ),
    }));
  }, [summaryItem, selectedSource.id, getAppliedStrategiesForTicker, getStrategyChipBreakdown]);

  // Snapshot chip reflects the selected portfolio's market-value-weighted
  // alignment (not the first watchlist row's status). When a single strategy
  // is focused, re-weight across the filtered (on-strategy) holdings only.
  const portfolioAlignment = getPortfolioAlignment(selectedSource.id);
  const snapshotResolved = useMemo(() => {
    if (!focusedStrategy) {
      return portfolioAlignment.portfolio.resolved;
    }
    const slices = displayItems
      .filter((item) => item.shares > 0)
      .map((item) => {
        const alignment = getStrategyChipBreakdown(
          focusedStrategy.id,
          item.ticker,
          selectedSource.id,
        );
        return {
          marketValue: item.price * item.shares,
          conviction: alignment?.conviction ?? item.conviction,
          categories: alignment?.categories ?? [],
        };
      });
    return resolveAggregatedStatus(slices, {
      hasStrategy: displayItems.length > 0,
    });
  }, [
    focusedStrategy,
    displayItems,
    portfolioAlignment.portfolio.resolved,
    getStrategyChipBreakdown,
    selectedSource.id,
  ]);

  function onStrategyViewChange(value: string) {
    if (value === "all") {
      setStrategyViewIndex(0);
      return;
    }
    const index = appliedStrategies.findIndex((strategy) => strategy.id === value);
    if (index >= 0) setStrategyViewIndex(index + 1);
  }

  const pullStamp = getWatchPullStamp(
    appliedStrategies.map((strategy) => strategy.id),
    focusedStrategy?.id ?? null,
  );
  const stocksTag =
    appliedStrategies.length === 0 || !pullStamp
      ? `${displayItems.length} stocks`
      : `${displayItems.length} stocks, ${pullStamp}`;

  if (summaryItem) {
    return (
      <section className="panel watchlist" aria-labelledby="watchlist-title">
        <div className="panel-head">
          <h2 id="watchlist-title">Current Watch</h2>
          <span className="panel-tag">{summaryItem.ticker}</span>
        </div>
        <button
          type="button"
          className="breadcrumb watchlist-breadcrumb"
          onClick={() => setLocalSelected(null)}
        >
          <CaretLeft aria-hidden />
          Current Watch
        </button>
        <WatchSummary
          item={summaryItem}
          logs={logsByTicker[summaryItem.ticker] ?? []}
          strategyBreakdowns={strategyBreakdowns}
        />
      </section>
    );
  }

  return (
    <section
      className={
        editMode ? "panel watchlist watchlist--editing" : "panel watchlist"
      }
      aria-labelledby="watchlist-title"
    >
      <div className="panel-head">
        <h2 id="watchlist-title">Current Watch</h2>
        <span className="panel-tag watchlist-tag">{stocksTag}</span>
      </div>
      <div className="portfolio-switcher">
        <div className="portfolio-field">
          <PortfolioSourceSwitcher
            id="portfolio-select"
            sources={portfolios}
            value={portfolio}
            onChange={setPortfolio}
            onCreateRequest={(label) => {
              setPendingSourceName(label);
              setPendingSourceType("watchlist");
            }}
          />
        </div>
        <button
          type="button"
          className={editMode ? "icon-btn icon-btn--active" : "icon-btn"}
          aria-label={
            editMode
              ? editIsDirty
                ? "Editing — use Cancel or Update below"
                : "Done editing portfolio or watchlist"
              : "Edit portfolio or watchlist"
          }
          aria-pressed={editMode}
          disabled={editMode && editIsDirty}
          onClick={() => {
            if (editMode) {
              if (editIsDirty) return;
              cancelEditMode();
              return;
            }
            enterEditMode();
            setEditDraft("");
            setEditToast(null);
            setTickerSuggestionsOpen(false);
            setAddPreview(null);
          }}
        >
          <PencilSimple aria-hidden weight="regular" />
        </button>
      </div>
      {pendingSourceName ? (
        <ForgeTableModal
          title={`Create “${pendingSourceName}”?`}
          titleId="watch-create-source-title"
          onCancel={() => {
            setPendingSourceName(null);
            setPendingSourceType("watchlist");
          }}
          onDone={confirmCreateSource}
          doneLabel="Create"
          intro="Choose whether this is a Watchlist or a Portfolio."
        >
          <div
            className="watch-source-type-picker"
            role="radiogroup"
            aria-label="Source type"
          >
            <button
              type="button"
              className={
                pendingSourceType === "watchlist"
                  ? "select-card watch-source-type-option is-selected"
                  : "select-card watch-source-type-option"
              }
              role="radio"
              aria-checked={pendingSourceType === "watchlist"}
              onClick={() => setPendingSourceType("watchlist")}
            >
              <span className="watch-source-type-title">Watchlist</span>
              <span className="watch-source-type-copy">
                A user-curated list you manage yourself — add and remove tickers
                freely. No brokerage connection.
              </span>
            </button>
            <button
              type="button"
              className={
                pendingSourceType === "portfolio"
                  ? "select-card watch-source-type-option is-selected"
                  : "select-card watch-source-type-option"
              }
              role="radio"
              aria-checked={pendingSourceType === "portfolio"}
              onClick={() => setPendingSourceType("portfolio")}
            >
              <span className="watch-source-type-title">Portfolio</span>
              <span className="watch-source-type-copy">
                A brokerage-linked account (session stub for now). Holdings will
                come from the connection later; qty edits preview buy/sell
                fills.
              </span>
            </button>
          </div>
        </ForgeTableModal>
      ) : null}
      {editMode ? (
        <div className="portfolio-edit-add">
          <div className="portfolio-field portfolio-ticker-lookup">
            <label className="visually-hidden" htmlFor="portfolio-ticker-lookup">
              Look up a ticker
            </label>
            <div className="chip-search-field">
              <MagnifyingGlass
                className="chip-search-icon"
                aria-hidden
                weight="regular"
              />
              <input
                id="portfolio-ticker-lookup"
                className="input chip-search-input"
                placeholder="Search ticker…"
                value={editDraft}
                maxLength={8}
                autoComplete="off"
                onChange={(event) => {
                  setEditDraft(event.target.value.toUpperCase());
                  setTickerSuggestionsOpen(true);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    openAddPreview();
                  }
                  if (event.key === "Escape") {
                    setTickerSuggestionsOpen(false);
                  }
                }}
              />
            </div>
            {tickerSuggestionsOpen && editSuggestions.length > 0 ? (
              <ul
                className="multiselect-menu portfolio-ticker-suggestions"
                role="listbox"
                aria-label="Matching tickers"
              >
                {editSuggestions.map((hit) => (
                  <li key={hit.symbol} className="portfolio-ticker-suggestion">
                    <button
                      type="button"
                      className="multiselect-option"
                      role="option"
                      onClick={() => {
                        setEditDraft(hit.symbol);
                        setTickerSuggestionsOpen(false);
                      }}
                    >
                      <span className="portfolio-ticker-symbol">{hit.symbol}</span>
                      <span className="portfolio-ticker-name">{hit.name}</span>
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={`Add ${hit.symbol}`}
                      onClick={() => openAddPreview(hit.symbol)}
                    >
                      <Plus aria-hidden weight="regular" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      ) : null}
      {addPreview ? (
        <ForgeTableModal
          title={`Add ${addPreview.ticker}?`}
          titleId="watch-add-preview-title"
          onCancel={() => setAddPreview(null)}
          onDone={confirmAddPreview}
          doneLabel="Add"
          intro="Preview how this name will appear on Current Watch."
        >
          <div className="forge-table watch-add-preview">
            <WatchItemPreviewCard item={addPreview} />
          </div>
        </ForgeTableModal>
      ) : null}
      {editToast ? (
        <div className="forge-toast-stack portfolio-edit-toast">
          <ForgeToast tone="warning" onDismiss={() => setEditToast(null)}>
            {editToast}
          </ForgeToast>
        </div>
      ) : null}
      {readOnly && !editMode ? (
        // Snapshot headline reflects the selected source's lead alignment.
        // With ≥2 applied strategies, a link-style select cycles All ↔ each strategy.
        // Hidden while editing so the lookup field has room.
        <div className="watchlist-snapshot">
          <PortfolioCompass status={snapshotResolved.primary} />
          <div className="watchlist-snapshot-body">
            {canCycleStrategies ? (
              <div className="watchlist-snapshot-title-row watchlist-strategy-link-wrap">
                <span className="watchlist-snapshot-label" aria-hidden="true">
                  <CaretDown aria-hidden />
                  Portfolio Strategy Alignment{" "}
                  <span className="watchlist-strategy-count">
                    ({appliedStrategies.length})
                  </span>
                </span>
                <label className="visually-hidden" htmlFor="strategy-view-select">
                  Switch strategy view
                </label>
                <select
                  id="strategy-view-select"
                  className="watchlist-strategy-link"
                  value={focusedStrategy?.id ?? "all"}
                  onChange={(event) => onStrategyViewChange(event.target.value)}
                  aria-label="Switch strategy view"
                >
                  <option value="all">
                    {appliedStrategies.length} Strategies Applied
                  </option>
                  {appliedStrategies.map((strategy) => (
                    <option key={strategy.id} value={strategy.id}>
                      {strategy.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="watchlist-snapshot-title-row">
                <span className="watchlist-snapshot-label">
                  Portfolio Strategy Alignment
                </span>
              </div>
            )}
            <StatusStack resolved={snapshotResolved} />
          </div>
        </div>
      ) : null}
      <ul className="watchlist-items">
        {displayItems.map((item) => {
          const isActive = item.ticker === activeTicker;
          const holding = livePortfolio?.holdings.find(
            (entry) => entry.ticker === item.ticker,
          );
          const canEditQty = editMode && !isWatchlistSource;
          const baselineShares = qtyBaseline[item.ticker] ?? item.shares;
          const displayShares = canEditQty
            ? (qtyDrafts[item.ticker] ?? item.shares)
            : item.shares;
          const showOwnedMetrics = displayShares > 0 || canEditQty;
          const lastPrice = item.price;
          const priceNeedsReview = !getLiveQuote(item.ticker);
          let displayAvg = item.avgPrice;
          if (canEditQty && displayShares !== baselineShares) {
            const side = qtySideFromDelta(displayShares - baselineShares);
            if (side) {
              displayAvg = nextAverageCost({
                sharesBefore: baselineShares,
                avgBefore: item.avgPrice,
                side,
                deltaShares: Math.abs(displayShares - baselineShares),
                fillPrice: lastPrice,
                sharesAfter: displayShares,
              });
            }
          }
          const marketValue = lastPrice * displayShares;
          const changePct = openPnlPercent(lastPrice, displayAvg);
          const totalPnl = openPnlTotal(lastPrice, displayAvg, displayShares);
          const changeUp = changePct >= 0;
          const changeClass = changeUp ? "watch-change--up" : "watch-change--down";
          const cardClass = isActive
            ? "watch-item select-card is-selected"
            : "watch-item select-card";
          const cardClassEditing = editMode
            ? `${cardClass} watch-item--editing`
            : cardClass;

          const head = editMode ? (
            <span className="watch-head watch-head--editing">
              <span className="watch-head-top">
                <span className="watch-id">
                  <span className="watch-ticker">{item.ticker}</span>
                  <span className="watch-name">{item.name}</span>
                </span>
                <button
                  type="button"
                  className="icon-btn icon-btn--danger watch-remove-icon"
                  onClick={() => handleRemove(item.ticker)}
                  aria-label={`Remove ${item.ticker} from ${
                    isWatchlistSource ? "watchlist" : "portfolio"
                  }`}
                >
                  <Trash aria-hidden weight="regular" />
                </button>
              </span>
              {showOwnedMetrics ? (
                <span className="watch-mvqty watch-mvqty--edit">
                  <span className="watch-mvqty-col">
                    <span className="watch-field-label">Qty</span>
                    {canEditQty ? (
                      <WatchQtyInput
                        ticker={item.ticker}
                        shares={displayShares}
                        onCommit={(next) =>
                          setQtyDrafts((current) => ({
                            ...current,
                            [item.ticker]: next,
                          }))
                        }
                      />
                    ) : (
                      <span className="watch-figure">{displayShares}</span>
                    )}
                  </span>
                  <span className="watch-mvqty-col">
                    <span className="watch-field-label">Market Value</span>
                    <span className="watch-figure watch-figure--strong">
                      {formatPrice(marketValue)}
                    </span>
                  </span>
                </span>
              ) : null}
            </span>
          ) : (
            <span className="watch-head">
              <span className="watch-id">
                <span className="watch-ticker">
                  {isActive ? (
                    <span className="watch-selected-dot" aria-hidden="true" />
                  ) : null}
                  {item.ticker}
                </span>
                <span className="watch-name">{item.name}</span>
              </span>
              {showOwnedMetrics ? (
                <span className="watch-mvqty">
                  <span className="watch-field-label">Market Value | Qty</span>
                  <span className="watch-figure watch-figure--strong">
                    {formatPrice(marketValue)}
                  </span>
                  <span className="watch-figure">{displayShares}</span>
                </span>
              ) : null}
            </span>
          );

          const metrics = (
            <span className="watch-metrics">
              {showOwnedMetrics && displayShares > 0 ? (
                <span className="watch-metric-pair">
                  <span className="watch-metric">
                    <span className="watch-field-label">Last Price</span>
                    <span className="watch-figure watch-figure--strong">
                      {priceNeedsReview ? (
                        <NeedsDataReviewFlag />
                      ) : (
                        formatPrice(lastPrice)
                      )}
                    </span>
                  </span>
                  <span className="watch-metric">
                    <span className="watch-field-label">Avg. Price</span>
                    <span className="watch-figure">
                      {formatPrice(displayAvg)}
                    </span>
                  </span>
                </span>
              ) : (
                <span className="watch-metric">
                  <span className="watch-field-label">Last Price</span>
                  <span className="watch-figure watch-figure--strong">
                    {priceNeedsReview ? (
                      <NeedsDataReviewFlag />
                    ) : (
                      formatPrice(lastPrice)
                    )}
                  </span>
                </span>
              )}
              {displayShares > 0 ? (
                <span className="watch-metric">
                  <span className="watch-field-label">{"Open P&L% | Total"}</span>
                  <span className="watch-pnl">
                    <span className={`watch-figure watch-figure--medium ${changeClass}`}>
                      {formatChange(changePct)}
                    </span>
                    <span className={`watch-figure ${changeClass}`}>
                      {formatPrice(totalPnl)}
                    </span>
                  </span>
                </span>
              ) : null}
            </span>
          );

          const convictionOrStrategies = editMode ? (
            <WatchStrategyEditPicker
              ticker={item.ticker}
              portfolioId={selectedSource.id}
              strategies={appliedStrategies}
              holding={holding}
              onToggle={(strategyId, enabled) =>
                setTickerEnabledForStrategy(
                  selectedSource.id,
                  item.ticker,
                  strategyId,
                  enabled,
                )
              }
            />
          ) : (
            <span className="watch-conviction-box">
              <WatchConvictionHead
                resolved={item.resolved}
                fallbackStatus={item.status}
              />
              <span className="watch-conviction-meter">
                <span className="watch-conviction-track">
                  <span
                    className="watch-conviction-fill"
                    style={{ width: `${item.conviction}%` }}
                  />
                </span>
                <span className="watch-conviction-score">{formatDecimals(item.conviction)}</span>
              </span>
            </span>
          );

          return (
            <li key={item.ticker}>
              <div className={cardClassEditing}>
                {editMode ? (
                  <div className="watch-select">
                    {head}
                    <span className="watch-body">
                      {metrics}
                      {convictionOrStrategies}
                    </span>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="watch-select"
                    onClick={() => {
                      if (readOnly) {
                        setLocalSelected(item.ticker);
                        onSelectTicker?.(item.ticker);
                      } else {
                        selectTicker(item.ticker);
                      }
                    }}
                    aria-pressed={isActive}
                  >
                    {head}
                    <span className="watch-body">
                      {metrics}
                      {convictionOrStrategies}
                    </span>
                  </button>
                )}
                {editMode ? null : !readOnly && isWatchlistSource ? (
                  <button
                    type="button"
                    className="watch-remove"
                    onClick={() => handleRemove(item.ticker)}
                    aria-label={`Remove ${item.ticker} from watchlist`}
                  >
                    &times;
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
        {items.length === 0 ? (
          <li className="watch-empty">
            No names yet — add a ticker to start this watchlist.
          </li>
        ) : null}
      </ul>
      {editMode
        ? (() => {
            // Desktop: Forge modal Cancel link + solid Update (text + icon).
            // Mobile: My Strategies dock — icon squares, lifted out of Embla.
            const footer = (
              <ActionFooter
                className={
                  isMobile
                    ? "watch-edit-actions strategy-footer--icons strategy-dock"
                    : "watch-edit-actions"
                }
              >
                {isMobile ? (
                  <>
                    <button
                      type="button"
                      className="btn btn--small"
                      onClick={requestCancelEdit}
                      aria-label="Cancel editing"
                    >
                      <X size={16} weight="bold" aria-hidden />
                      <span className="btn-label">Cancel</span>
                    </button>
                    <button
                      type="button"
                      className="btn btn--small btn--solid"
                      onClick={requestUpdateOrders}
                      disabled={!editIsDirty}
                      aria-label="Update holdings"
                    >
                      <Plus size={16} weight="regular" aria-hidden />
                      <span className="btn-label">Update</span>
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      className="btn btn--small btn--link forge-cancel-btn"
                      onClick={requestCancelEdit}
                    >
                      <X aria-hidden weight="bold" /> Cancel
                    </button>
                    <button
                      type="button"
                      className="btn btn--small btn--solid"
                      onClick={requestUpdateOrders}
                      disabled={!editIsDirty}
                    >
                      <Plus aria-hidden weight="regular" /> Update
                    </button>
                  </>
                )}
              </ActionFooter>
            );
            if (!isMobile || typeof document === "undefined") return footer;
            const dockHost =
              document.querySelector("main.app-main") ?? document.body;
            return createPortal(footer, dockHost);
          })()
        : null}
      {discardConfirmOpen ? (
        <ForgeTableModal
          title="Unsaved changes"
          titleId="watch-discard-title"
          onCancel={() => setDiscardConfirmOpen(false)}
          onDone={confirmDiscardEdit}
          doneLabel="Discard"
          intro="You have unsaved changes on this watch. Discard them and leave edit mode?"
        />
      ) : null}
      {pendingOrders ? (
        <ForgeTableModal
          title="Review quantity changes"
          titleId="qty-order-review-title"
          onCancel={() => setPendingOrders(null)}
          onDone={confirmPendingOrders}
          doneLabel="Confirm"
          intro={`Fill times use the ${formatFillTimestampEst(pendingOrders[0]?.filledAt ?? estimateFillTimestamp())} candle (15m). Adjust fill prices before confirming.`}
        >
          <div className="forge-table watch-qty-order-table" role="table">
            {pendingOrders.map((order, index) => (
              <div
                key={order.ticker}
                className="forge-table-row watch-qty-order-row"
                role="row"
              >
                <div className="forge-table-cell" role="cell">
                  <span className="watch-field-label">
                    {order.side === "buy" ? "Buy Order" : "Sell Order"}
                  </span>
                  <span className="watch-figure watch-figure--strong">
                    {order.ticker}
                  </span>
                </div>
                <label className="forge-table-cell" role="cell">
                  <span className="watch-field-label">
                    Qty {order.side === "buy" ? "bought" : "sold"}
                  </span>
                  <input
                    type="number"
                    className="input watch-qty-input"
                    min={1}
                    step={1}
                    value={order.deltaShares}
                    onChange={(event) => {
                      const next = Number.parseInt(event.target.value, 10);
                      if (!Number.isFinite(next) || next < 1) return;
                      setPendingOrders((current) =>
                        current
                          ? current.map((row, i) =>
                              i !== index
                                ? row
                                : {
                                    ...row,
                                    deltaShares: next,
                                    sharesAfter:
                                      row.side === "buy"
                                        ? row.sharesBefore + next
                                        : Math.max(0, row.sharesBefore - next),
                                  },
                            )
                          : current,
                      );
                    }}
                  />
                </label>
                <label className="forge-table-cell" role="cell">
                  <span className="watch-field-label">Total qty</span>
                  <input
                    type="number"
                    className="input watch-qty-input"
                    min={0}
                    step={1}
                    value={order.sharesAfter}
                    onChange={(event) => {
                      const after = Number.parseInt(event.target.value, 10);
                      if (!Number.isFinite(after) || after < 0) return;
                      const delta = after - order.sharesBefore;
                      const side = qtySideFromDelta(delta);
                      if (!side) return;
                      setPendingOrders((current) =>
                        current
                          ? current.map((row, i) =>
                              i !== index
                                ? row
                                : {
                                    ...row,
                                    side,
                                    deltaShares: Math.abs(delta),
                                    sharesAfter: after,
                                  },
                            )
                          : current,
                      );
                    }}
                  />
                </label>
                <label className="forge-table-cell" role="cell">
                  <span className="watch-field-label">Fill price</span>
                  <input
                    type="number"
                    className="input watch-qty-input"
                    min={0}
                    step={0.01}
                    value={order.fillPrice}
                    onChange={(event) => {
                      const price = Number.parseFloat(event.target.value);
                      if (!Number.isFinite(price) || price < 0) return;
                      setPendingOrders((current) =>
                        current
                          ? current.map((row, i) =>
                              i !== index ? row : { ...row, fillPrice: price },
                            )
                          : current,
                      );
                    }}
                  />
                </label>
              </div>
            ))}
          </div>
        </ForgeTableModal>
      ) : null}
    </section>
  );
}
