import { useEffect, useMemo, useState } from "react";
import { useAppState } from "../state/AppState";
import { dataSource } from "../lib/datasource";
import { formatChange, formatPrice } from "../lib/format";
import { formatChipCondition, formatObservedBreach } from "../lib/forge/metrics";
import {
  categoriesForStatus,
  isExamplePlan,
  isLayer3Status,
} from "../lib/forge/myPlan";
import { LAYER3_ZONES, type Layer3ZoneId } from "../lib/forge/layer3Zones";
import type { ChipResult, StockAlignment } from "../lib/forge/scoring";
import { STATUS_TONE } from "../lib/status";
import { StatusStack, WatchAlignLabel, WatchConvictionHead } from "./StatusBadge";
import { ForgePill } from "./ForgePill";
import { PortfolioCompass } from "./PortfolioCompass";
import { Dropdown } from "./Dropdown";
import { CaretDown, CaretLeft } from "../lib/icons";
import type {
  LogEntry,
  RuleCategory,
  RuleChip,
  RuleTag,
  StatusType,
  Strategy,
  WatchlistItem,
} from "../types";

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
          <span className="watch-conviction-score">{conviction}</span>
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
  /** Every strategy currently applied to this ticker's portfolio(s) (see
      AppState.getAppliedStrategiesForTicker), each with its OWN rule-chip
      breakdown — not just the one bucket happens to score it with. Drives
      both the strategy-name chip stack and the "calculating"/"excluded"
      sections below, so the two always agree. */
  strategyBreakdowns: StrategyBreakdown[];
}) {
  const analysis = dataSource.getTickerAnalysis(item.ticker);
  const latestLog = logs[0];

  const owned = item.shares > 0;
  const marketValue = item.price * item.shares;
  const totalPnl = (item.price - item.avgPrice) * item.shares;
  const changeUp = item.changePct >= 0;
  const changeClass = changeUp ? "watch-change--up" : "watch-change--down";

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
                      {item.conviction}
                    </span>
                  </span>
                </div>
              )}
            </div>
          </span>
        </div>
      </div>

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
        const activeResults = results.filter((result) => result.outcome !== "no-data");
        const excludedResults = results.filter((result) => result.outcome === "no-data");
        return (
          <div key={strategy.id} className="watch-summary-chips">
            <span className="watch-summary-chips-strategy">{strategy.name}</span>
            <div className="watch-summary-chip-group">
              <span className="config-label forge-label">Calculating Conviction</span>
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
                  <span className="forge-box-empty">No rule chips have data yet.</span>
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
                  <span className="forge-box-empty">Every rule chip has data.</span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const PORTFOLIOS = dataSource.getPortfolios();
const DEFAULT_SOURCE_ID = PORTFOLIOS[0]?.id ?? "";

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
    getPortfolioAlignment,
    getAppliedStrategiesForTicker,
    getStrategyChipBreakdown,
  } = useAppState();
  const [draft, setDraft] = useState("");
  // Read-only (home) selection is local to this widget so it never mutates the
  // global selected ticker that drives the dashboard. Defaults to none selected.
  const [localSelected, setLocalSelected] = useState<string | null>(null);
  // Which portfolio/watchlist is shown. Portfolios (live-connected accounts) are
  // read-only; only a watchlist can add/remove tickers.
  const [portfolio, setPortfolio] = useState(DEFAULT_SOURCE_ID);
  const selectedSource =
    PORTFOLIOS.find((option) => option.id === portfolio) ?? PORTFOLIOS[0];
  const isWatchlistSource = selectedSource.type === "watchlist";
  const isDefaultSource = selectedSource.id === DEFAULT_SOURCE_ID;

  // A watchlist is user-editable, so its (mock) list lives in local state and is
  // re-seeded whenever the selected source changes — keeps add/remove from
  // mutating the read-only portfolio data.
  const [watchlistItems, setWatchlistItems] = useState<WatchlistItem[]>(() =>
    dataSource.getWatchlistForPortfolio(selectedSource.id),
  );
  useEffect(() => {
    if (isWatchlistSource) {
      setWatchlistItems(dataSource.getWatchlistForPortfolio(selectedSource.id));
    }
  }, [isWatchlistSource, selectedSource]);

  // The list to render: the default portfolio mirrors live app state (already
  // decorated with computed alignment); a watchlist uses its editable local
  // list; any other portfolio is derived (read-only) from its holdings. For the
  // non-default sources we overlay the Forge-computed conviction/status here so
  // every source reflects the engine (default is decorated upstream in AppState).
  const items = useMemo<WatchlistItem[]>(() => {
    if (isDefaultSource) return watchlist;
    const base = isWatchlistSource
      ? watchlistItems
      : dataSource.getWatchlistForPortfolio(selectedSource.id);
    const byTicker = getPortfolioAlignment(selectedSource.id).byTicker;
    return base.map((item) => {
      const aligned = byTicker[item.ticker];
      return aligned
        ? { ...item, conviction: aligned.conviction, status: aligned.status }
        : item;
    });
  }, [
    isDefaultSource,
    isWatchlistSource,
    watchlist,
    watchlistItems,
    selectedSource,
    getPortfolioAlignment,
  ]);

  const activeTicker = readOnly ? localSelected : selectedTicker;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = draft.trim().toUpperCase();
    if (!next) return;
    setWatchlistItems((current) =>
      current.some((item) => item.ticker === next)
        ? current
        : [
            ...current,
            {
              ticker: next,
              name: "New position · Pending research",
              price: 0,
              changePct: 0,
              status: "Thesis Check",
              conviction: 40,
              shares: 0,
              avgPrice: 0,
              reason: "Pending research — assign a strategy and log your thesis.",
            },
          ],
    );
    setDraft("");
  }

  function handleRemove(ticker: string) {
    setWatchlistItems((current) => current.filter((item) => item.ticker !== ticker));
  }

  // Read-only detail view: a condensed, read-only summary of the selected ticker
  // (drawn from the dashboard's signal / analysis / log data, no CRUD).
  const summaryItem =
    readOnly && localSelected
      ? items.find((item) => item.ticker === localSelected)
      : undefined;

  // Every strategy applied to this ticker (via appliedPortfolioIds), each
  // with its own chip breakdown — computed once here so the strategy-name
  // chip stack and the "calculating"/"excluded" sections always agree.
  const strategyBreakdowns = useMemo(() => {
    if (!summaryItem) return [];
    return getAppliedStrategiesForTicker(summaryItem.ticker).map((strategy) => ({
      strategy,
      alignment: getStrategyChipBreakdown(
        strategy.id,
        summaryItem.ticker,
        selectedSource.id,
      ),
    }));
  }, [summaryItem, selectedSource.id, getAppliedStrategiesForTicker, getStrategyChipBreakdown]);

  // Snapshot chip reflects the selected portfolio's market-value-weighted
  // alignment (not the first watchlist row's status).
  const portfolioAlignment = getPortfolioAlignment(selectedSource.id);
  const snapshotResolved = portfolioAlignment.portfolio.resolved;

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
    <section className="panel watchlist" aria-labelledby="watchlist-title">
      <div className="panel-head">
        <h2 id="watchlist-title">Current Watch</h2>
        <span className="panel-tag watchlist-tag">{items.length} stocks</span>
      </div>
      <div className="portfolio-switcher">
        <Dropdown
          id="portfolio-select"
          label="Switch portfolio or watchlist"
          value={portfolio}
          onChange={setPortfolio}
          options={PORTFOLIOS.map((option) => ({
            value: option.id,
            label: option.label,
          }))}
        />
      </div>
      {readOnly ? (
        // Snapshot headline reflects the selected source's lead alignment. The
        // emblem is a static placeholder until driven by live insights.
        <div className="watchlist-snapshot">
          <PortfolioCompass status={snapshotResolved.primary} />
          <div className="watchlist-snapshot-body">
            <span className="watchlist-snapshot-label">
              Portfolio Strategy Alignment
            </span>
            <StatusStack resolved={snapshotResolved} />
          </div>
        </div>
      ) : isWatchlistSource ? (
        // Only a (user-curated) watchlist can add tickers. Portfolios are
        // live-connected accounts, so their holdings come from the connection.
        <form className="watchlist-add" onSubmit={handleSubmit}>
          <label className="visually-hidden" htmlFor="add-ticker">
            Add a ticker
          </label>
          <input
            id="add-ticker"
            className="input"
            placeholder="Add ticker (e.g. TSLA)"
            value={draft}
            maxLength={6}
            onChange={(event) => setDraft(event.target.value)}
          />
          <button type="submit" className="btn btn--small">
            Add
          </button>
        </form>
      ) : null}
      <ul className="watchlist-items">
        {items.map((item) => {
          const isActive = item.ticker === activeTicker;
          const owned = item.shares > 0;
          const marketValue = item.price * item.shares;
          const totalPnl = (item.price - item.avgPrice) * item.shares;
          const changeUp = item.changePct >= 0;
          const changeClass = changeUp ? "watch-change--up" : "watch-change--down";
          return (
            <li key={item.ticker}>
              <div
                className={
                  isActive
                    ? "watch-item select-card is-selected"
                    : "watch-item select-card"
                }
              >
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
                        <span className="watch-conviction-score">
                          {item.conviction}
                        </span>
                      </span>
                    </span>
                  </span>
                </button>
                {/* Removing names is only valid on a user-curated watchlist.
                    Portfolios are (future) live-connected accounts, so their
                    holdings can't be hand-removed. */}
                {!readOnly && isWatchlistSource ? (
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
    </section>
  );
}
