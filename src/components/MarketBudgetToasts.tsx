import { useEffect, useRef, useState } from "react";
import { ForgeToast } from "./forge/ForgeToast";
import {
  getProviderBudgets,
  subscribeLiveCache,
  type ProviderBudget,
  type ProviderId,
} from "../lib/market/liveCache";

const WARN_RATIO = 0.2;
const HARD_REMAINING = 5;

/** What each provider budget gates in Beta 0 FreeTier. */
const PROVIDER_LIMITS: Record<
  ProviderId,
  { headline: string; actions: string[] }
> = {
  yahoo: {
    headline: "Yahoo market data",
    actions: [
      "Live last prices on Current Watch",
      "Ticker search when editing a portfolio / watchlist",
      "Fundamentals & technicals (Forge conviction chips)",
      "Index inputs that feed Market Weather",
    ],
  },
  finnhub: {
    headline: "Finnhub quotes",
    actions: ["Backup live quote path when Yahoo is unavailable"],
  },
  fred: {
    headline: "FRED macro (rates / credit)",
    actions: [
      "10Y Treasury & high-yield spread for risk chips",
      "Macro inputs for Market Weather",
    ],
  },
  stooq: {
    headline: "Stooq quotes",
    actions: ["Backup daily close quotes when other feeds fail"],
  },
};

interface ApiBudgetToast {
  tone: "warning" | "error";
  providerId: ProviderId;
  remaining: number;
  limit: number;
  resetAt: number;
}

/**
 * App-level quota toasts from Worker-reported provider budgets.
 * Debounced: one toast per provider per reset window.
 */
export function MarketBudgetToasts() {
  const [toast, setToast] = useState<ApiBudgetToast | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const warned = useRef<Set<string>>(new Set());

  useEffect(() => {
    const evaluate = (budgets: ProviderBudget[]) => {
      for (const budget of budgets) {
        const key = `${budget.id}:${budget.resetAt}`;
        const ratio =
          budget.limit > 0 ? budget.remaining / budget.limit : 1;
        const near =
          budget.remaining <= HARD_REMAINING || ratio <= WARN_RATIO;
        if (!near) continue;
        if (warned.current.has(key)) continue;
        warned.current.add(key);
        setToast({
          tone: budget.remaining <= 0 ? "error" : "warning",
          providerId: budget.id,
          remaining: budget.remaining,
          limit: budget.limit,
          resetAt: budget.resetAt,
        });
      }
    };

    evaluate(getProviderBudgets());
    return subscribeLiveCache(() => evaluate(getProviderBudgets()));
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [toast]);

  if (!toast) return null;

  const meta = PROVIDER_LIMITS[toast.providerId];
  const label = labelFor(toast.providerId);
  const exhausted = toast.remaining <= 0;
  const title = exhausted
    ? `${label} limit reached — showing last cached data when available.`
    : `${label} nearing limit — ${toast.remaining} of ${toast.limit} calls left this minute.`;
  const waitCopy = formatResetWait(toast.resetAt, nowMs);

  return (
    <div className="market-budget-toast-host" aria-live="polite">
      <ForgeToast
        tone={toast.tone}
        onDismiss={() => setToast(null)}
        className="forge-toast--api-budget"
      >
        <p className="api-budget-toast-title">{title}</p>
        <p className="api-budget-toast-meta">
          Shared Demo budget · {meta.headline}
        </p>
        <p className="api-budget-toast-section-label">Limited right now</p>
        <ul className="api-budget-toast-list">
          {meta.actions.map((action) => (
            <li key={action}>{action}</li>
          ))}
        </ul>
        <p className="api-budget-toast-wait">{waitCopy}</p>
        <p className="api-budget-toast-hint">
          Rough guide: ~3 Yahoo calls per ticker on a full pull (price +
          fundamentals + technicals). Search costs extra. Cached prices stay
          visible; new live pulls wait until the window resets.
        </p>
      </ForgeToast>
    </div>
  );
}

function labelFor(id: ProviderId): string {
  if (id === "finnhub") return "Finnhub";
  if (id === "fred") return "FRED";
  if (id === "stooq") return "Stooq";
  return "Yahoo";
}

function formatResetWait(resetAt: number, nowMs: number): string {
  if (!resetAt || resetAt <= 0) {
    return "Next window: about 1 minute from the last burst of calls.";
  }
  const msLeft = resetAt - nowMs;
  if (msLeft <= 0) {
    return "Next window: ready now — dismiss and retry live pulls / search.";
  }
  const seconds = Math.max(1, Math.ceil(msLeft / 1000));
  if (seconds < 60) {
    return `Next live pulls / search: in about ${seconds}s.`;
  }
  const minutes = Math.ceil(seconds / 60);
  return `Next live pulls / search: in about ${minutes} min.`;
}
