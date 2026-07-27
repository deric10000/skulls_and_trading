/**
 * Dependency-free performance telemetry.
 *
 * Records timings/counts in the browser Performance Timeline only. It never
 * transmits user, portfolio, ticker, strategy, or financial data.
 */

export const PERF_MARK = {
  appStart: "st:app:start",
  authConfigStart: "st:auth:config:start",
  authConfigEnd: "st:auth:config:end",
  authSessionStart: "st:auth:session:start",
  authSessionEnd: "st:auth:session:end",
  authHydrateStart: "st:auth:hydrate:start",
  authHydrateEnd: "st:auth:hydrate:end",
  authReady: "st:auth:ready",
  homeMounted: "st:home:mounted",
  marketBootStart: "st:market:boot:start",
  marketBootEnd: "st:market:boot:end",
  marketCycleApplied: "st:market:cycle:applied",
} as const;

type SafeDetail = Record<string, string | number | boolean | null>;

function hasPerformance(): boolean {
  return typeof performance !== "undefined" && typeof performance.mark === "function";
}

export function perfMark(name: string, detail?: SafeDetail): void {
  if (!hasPerformance()) return;
  performance.mark(name, detail ? { detail } : undefined);
}

export function perfMeasure(
  name: string,
  startMark: string,
  endMark: string,
  detail?: SafeDetail,
): number | null {
  if (!hasPerformance() || typeof performance.measure !== "function") return null;
  try {
    const entry = performance.measure(
      name,
      detail
        ? { start: startMark, end: endMark, detail }
        : { start: startMark, end: endMark },
    );
    return entry.duration;
  } catch {
    return null;
  }
}

export function perfCount(name: string, amount = 1, detail?: SafeDetail): void {
  perfMark(`st:count:${name}`, { amount, ...(detail ?? {}) });
}

export function perfValue(name: string, value: number, detail?: SafeDetail): void {
  if (!Number.isFinite(value)) return;
  perfMark(`st:value:${name}`, { value, ...(detail ?? {}) });
}

export function measureSync<T>(
  name: string,
  run: () => T,
  detail?: SafeDetail,
): T {
  if (!hasPerformance()) return run();
  const startedAt = performance.now();
  try {
    return run();
  } finally {
    perfValue(`duration:${name}`, performance.now() - startedAt, detail);
  }
}

export async function measureAsync<T>(
  name: string,
  run: () => Promise<T>,
  detail?: SafeDetail,
): Promise<T> {
  if (!hasPerformance()) return run();
  const startedAt = performance.now();
  try {
    return await run();
  } finally {
    perfValue(`duration:${name}`, performance.now() - startedAt, detail);
  }
}

export interface PerformanceSummary {
  marks: Record<string, number>;
  counts: Record<string, number>;
  values: Record<string, number[]>;
}

/** Browser-console/test helper; returns aggregate timings without user data. */
export function getPerformanceSummary(): PerformanceSummary {
  const summary: PerformanceSummary = { marks: {}, counts: {}, values: {} };
  if (!hasPerformance()) return summary;

  for (const entry of performance.getEntriesByType("mark")) {
    summary.marks[entry.name] = entry.startTime;
    const detail = (entry as PerformanceMark).detail as SafeDetail | null;
    if (entry.name.startsWith("st:count:")) {
      const name = entry.name.slice("st:count:".length);
      const amount = Number(detail?.amount ?? 1);
      summary.counts[name] = (summary.counts[name] ?? 0) + amount;
    } else if (entry.name.startsWith("st:value:")) {
      const name = entry.name.slice("st:value:".length);
      const value = Number(detail?.value);
      if (Number.isFinite(value)) (summary.values[name] ??= []).push(value);
    }
  }
  return summary;
}

/** Records >50 ms browser tasks without retaining stack, URL, or user data. */
export function observeLongTasks(): () => void {
  if (
    typeof PerformanceObserver === "undefined" ||
    !PerformanceObserver.supportedEntryTypes?.includes("longtask")
  ) {
    return () => undefined;
  }
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      perfValue("long-task-duration", entry.duration);
      perfCount("long-task");
    }
  });
  observer.observe({ type: "longtask", buffered: true });
  return () => observer.disconnect();
}

