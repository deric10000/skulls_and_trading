import { useEffect, useMemo, useRef, useState } from "react";
import { useAppState } from "../../state/AppState";
import { dataSource } from "../../lib/datasource";
import { CaretDown } from "../../lib/icons";
import { computePortfolioAlignment } from "../../lib/forge/alignment";
import { computeHelmMetrics } from "../../lib/forge/helmMetrics";
import { formatChange, formatDecimals } from "../../lib/format";
import type { SignalTone } from "../../types";

const TONE_LABEL: Record<SignalTone, string> = {
  positive: "On Plan",
  neutral: "Watch",
  warning: "Review",
  negative: "Off Plan",
};

/**
 * The Helm — derived progress metrics for the portfolio selected in Current
 * Watch (mirrored via shared AppState). The strategy scope is Helm-owned: pick
 * a single applied strategy or "All strategies" from the scope dropdown. All
 * values are computed from existing app data; nothing new is fetched or persisted.
 */
export function HelmMetrics() {
  const {
    portfolios,
    strategies,
    buckets,
    getPortfolioAlignment,
    selectedPortfolioId,
  } = useAppState();

  // Resolve the shared selection to a real portfolio (Current Watch can point at
  // a non-portfolio preview source; fall back to the first real portfolio).
  const portfolio = useMemo(
    () =>
      portfolios.find((p) => p.id === selectedPortfolioId) ?? portfolios[0],
    [portfolios, selectedPortfolioId],
  );

  // Strategies applied to the mirrored portfolio — the scope dropdown options.
  const appliedStrategies = useMemo(
    () =>
      portfolio
        ? strategies
            .filter((s) => (s.appliedPortfolioIds ?? []).includes(portfolio.id))
            .sort((a, b) => a.name.localeCompare(b.name))
        : [],
    [strategies, portfolio],
  );

  // Helm-owned strategy scope (null = All strategies).
  const [scopeStrategyId, setScopeStrategyId] = useState<string | null>(null);
  const [scopeOpen, setScopeOpen] = useState(false);
  const scopeRef = useRef<HTMLDivElement>(null);

  // Drop a stale scope when the mirrored portfolio no longer applies it.
  useEffect(() => {
    if (
      scopeStrategyId &&
      !appliedStrategies.some((s) => s.id === scopeStrategyId)
    ) {
      setScopeStrategyId(null);
    }
  }, [appliedStrategies, scopeStrategyId]);

  // Close the dropdown on outside click / Escape.
  useEffect(() => {
    if (!scopeOpen) return;
    const onDoc = (event: MouseEvent) => {
      if (scopeRef.current && !scopeRef.current.contains(event.target as Node)) {
        setScopeOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setScopeOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [scopeOpen]);

  const focusedStrategy = useMemo(
    () =>
      scopeStrategyId
        ? appliedStrategies.find((s) => s.id === scopeStrategyId)
        : undefined,
    [appliedStrategies, scopeStrategyId],
  );

  const alignment = useMemo(() => {
    if (!portfolio) return undefined;
    // Focused strategy → score against just that strategy for a per-lens view;
    // otherwise use the app-wide (all-strategy) memoized alignment.
    return focusedStrategy
      ? computePortfolioAlignment(portfolio, buckets, [focusedStrategy])
      : getPortfolioAlignment(portfolio.id);
  }, [portfolio, focusedStrategy, buckets, getPortfolioAlignment]);

  const metrics = useMemo(() => {
    if (!portfolio || !alignment) return undefined;
    return computeHelmMetrics({
      portfolio,
      alignment,
      priceOf: (ticker) => dataSource.getTickerInfo(ticker)?.lastPrice ?? 0,
    });
  }, [portfolio, alignment]);

  if (!portfolio || !metrics) {
    return (
      <section className="helm-metrics" aria-labelledby="helm-metrics-title">
        <div className="forge-section-head">
          <h3 id="helm-metrics-title" className="forge-section-title">
            Progress
          </h3>
        </div>
        <p className="helm-metrics-empty">
          Apply a strategy to a portfolio to track your progress here.
        </p>
      </section>
    );
  }

  const scopeLabel = focusedStrategy ? focusedStrategy.name : "All strategies";
  const pnlUp = metrics.openPnlPct >= 0;

  return (
    <section className="helm-metrics" aria-labelledby="helm-metrics-title">
      <div className="forge-section-head">
        <h3 id="helm-metrics-title" className="forge-section-title">
          Progress
        </h3>
        <span className="helm-metrics-scope">
          <span className="chip">{portfolio.label}</span>
          <div className="helm-scope-select" ref={scopeRef}>
            <button
              type="button"
              className="chip helm-scope-trigger"
              aria-haspopup="listbox"
              aria-expanded={scopeOpen}
              onClick={() => setScopeOpen((open) => !open)}
            >
              {scopeLabel}
              <CaretDown className="helm-scope-caret" aria-hidden weight="bold" />
            </button>
            {scopeOpen ? (
              <ul
                className="multiselect-menu helm-scope-menu"
                role="listbox"
                aria-label="Strategy scope"
              >
                <li>
                  <button
                    type="button"
                    role="option"
                    aria-selected={!scopeStrategyId}
                    className={
                      scopeStrategyId
                        ? "multiselect-option"
                        : "multiselect-option is-selected"
                    }
                    onClick={() => {
                      setScopeStrategyId(null);
                      setScopeOpen(false);
                    }}
                  >
                    All strategies
                  </button>
                </li>
                {appliedStrategies.map((strategy) => (
                  <li key={strategy.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={scopeStrategyId === strategy.id}
                      className={
                        scopeStrategyId === strategy.id
                          ? "multiselect-option is-selected"
                          : "multiselect-option"
                      }
                      onClick={() => {
                        setScopeStrategyId(strategy.id);
                        setScopeOpen(false);
                      }}
                    >
                      {strategy.name}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </span>
      </div>

      <div className="helm-metrics-grid">
        <div className="select-card helm-metric">
          <span className="helm-metric-label">Conviction</span>
          <span className="helm-metric-value">
            {formatDecimals(metrics.conviction)}
            <span className="helm-metric-unit">/100</span>
          </span>
          <span className="helm-metric-note">Market-value weighted</span>
        </div>

        <div className="select-card helm-metric">
          <span className="helm-metric-label">Strategy Coverage</span>
          <span className="helm-metric-value">
            {metrics.scoredCount}
            <span className="helm-metric-unit">/{metrics.holdingCount}</span>
          </span>
          <span className="helm-metric-note">{metrics.coveragePct}% of holdings</span>
        </div>

        <div className="select-card helm-metric">
          <span className="helm-metric-label">Open P&amp;L</span>
          <span
            className={`helm-metric-value ${
              pnlUp ? "helm-metric-value--up" : "helm-metric-value--down"
            }`}
          >
            {formatChange(metrics.openPnlPct)}
          </span>
          <span className="helm-metric-note">A by-product of discipline</span>
        </div>

        <div className="select-card helm-metric helm-metric--wide">
          <span className="helm-metric-label">Alignment</span>
          {metrics.statusMix.length > 0 ? (
            <div className="helm-metric-chips">
              {metrics.statusMix.map((slice) => (
                <span key={slice.tone} className={`chip status--${slice.tone}`}>
                  {TONE_LABEL[slice.tone]} | {slice.count}
                </span>
              ))}
            </div>
          ) : (
            <span className="helm-metric-note">No scored holdings yet</span>
          )}
        </div>

        <div className="select-card helm-metric helm-metric--wide">
          <span className="helm-metric-label">Composition</span>
          {metrics.composition.length > 0 ? (
            <div className="helm-metric-chips">
              {metrics.composition.map((slice) => (
                <span key={slice.label} className="chip">
                  {slice.label} | {slice.count}
                </span>
              ))}
            </div>
          ) : (
            <span className="helm-metric-note">No scored holdings yet</span>
          )}
        </div>
      </div>
    </section>
  );
}
