import { useEffect, useRef, useState } from "react";
import { ForgeToast } from "./forge/ForgeToast";
import {
  getProviderBudgets,
  subscribeLiveCache,
  type ProviderBudget,
} from "../lib/market/liveCache";

const WARN_RATIO = 0.2;
const HARD_REMAINING = 5;

/**
 * App-level quota toasts from Worker-reported provider budgets.
 * Debounced: one toast per provider per reset window.
 */
export function MarketBudgetToasts() {
  const [toast, setToast] = useState<{
    tone: "warning" | "error";
    message: string;
  } | null>(null);
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
        const exhausted = budget.remaining <= 0;
        setToast({
          tone: exhausted ? "error" : "warning",
          message: exhausted
            ? `${labelFor(budget.id)} limit reached — showing last cached data when available. Shared Demo budget.`
            : `${labelFor(budget.id)} nearing limit — ${budget.remaining} of ${budget.limit} calls left this minute. Shared Demo budget.`,
        });
      }
    };

    evaluate(getProviderBudgets());
    return subscribeLiveCache(() => evaluate(getProviderBudgets()));
  }, []);

  if (!toast) return null;

  return (
    <div className="market-budget-toast-host" aria-live="polite">
      <ForgeToast tone={toast.tone} onDismiss={() => setToast(null)}>
        {toast.message}
      </ForgeToast>
    </div>
  );
}

function labelFor(id: string): string {
  if (id === "finnhub") return "Finnhub";
  if (id === "fred") return "FRED";
  if (id === "stooq") return "Stooq";
  if (id === "yahoo") return "Yahoo";
  return id;
}
