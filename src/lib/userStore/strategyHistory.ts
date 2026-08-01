import type { Strategy } from "../../types";
import { getSupabase } from "../auth/supabaseClient";

interface PendingHistoryWrite {
  previous: Strategy | null;
  next: Strategy;
  timer: ReturnType<typeof window.setTimeout>;
}

const pending = new Map<string, PendingHistoryWrite>();

async function persist(previous: Strategy | null, next: Strategy): Promise<void> {
  const { error } = await getSupabase().rpc("record_strategy_evolution", {
    p_previous: previous,
    p_next: next,
    p_effective_at: new Date().toISOString(),
  });
  if (error && error.code !== "42883") {
    console.warn("strategy history write failed", error.message);
  }
}

function appliedScopeChanged(previous: Strategy | null, next: Strategy): boolean {
  const before = [...(previous?.appliedPortfolioIds ?? [])].sort();
  const after = [...(next.appliedPortfolioIds ?? [])].sort();
  return JSON.stringify(before) !== JSON.stringify(after);
}

/**
 * Coalesces typing into one immutable version while recording application
 * changes immediately enough to preserve their effective boundary.
 */
export function scheduleStrategyHistory(
  previous: Strategy | null,
  next: Strategy,
): void {
  if (typeof window === "undefined") return;
  const existing = pending.get(next.id);
  if (existing) window.clearTimeout(existing.timer);
  const delay = appliedScopeChanged(previous, next) ? 0 : 1_000;
  const firstPrevious = existing?.previous ?? previous;
  const timer = window.setTimeout(() => {
    pending.delete(next.id);
    void persist(firstPrevious, next);
  }, delay);
  pending.set(next.id, { previous: firstPrevious, next, timer });
}
