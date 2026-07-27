import type { Bucket, Portfolio, Strategy } from "../../types";
import {
  getLiveCacheRevision,
} from "../market/liveCache";
import { measureSync, perfCount } from "../performance/marks";
import {
  computePortfolioAlignment,
  type PortfolioAlignment,
} from "./alignment";

interface CacheEntry {
  buckets: Bucket[];
  strategies: Strategy[];
  revision: string;
  value: PortfolioAlignment;
}

let cache = new WeakMap<Portfolio, CacheEntry[]>();

function sameRefs<T>(left: T[], right: T[]): boolean {
  return (
    left === right ||
    (left.length === right.length &&
      left.every((item, index) => item === right[index]))
  );
}

export function currentAlignmentRevision(): string {
  return [
    getLiveCacheRevision("scoreInputs"),
    getLiveCacheRevision("scoreReadiness"),
  ].join(":");
}

export function getPortfolioAlignmentCached(
  portfolio: Portfolio,
  buckets: Bucket[],
  strategies: Strategy[],
  options: { revision?: string; caller?: string } = {},
): PortfolioAlignment {
  const revision = options.revision ?? currentAlignmentRevision();
  const entries = cache.get(portfolio) ?? [];
  const hit = entries.find(
    (entry) =>
      sameRefs(entry.buckets, buckets) &&
      sameRefs(entry.strategies, strategies) &&
      entry.revision === revision,
  );
  if (hit) {
    perfCount("portfolio-alignment-cache-hit", 1, {
      caller: options.caller ?? "unknown",
    });
    return hit.value;
  }

  const caller = options.caller ?? "unknown";
  perfCount("portfolio-alignment", 1, { caller });
  const value = measureSync(
    "portfolio-alignment",
    () => computePortfolioAlignment(portfolio, buckets, strategies, { caller }),
    { caller },
  );
  entries.push({ buckets, strategies, revision, value });
  // Keep only the latest few identity/revision combinations per live portfolio.
  if (entries.length > 8) entries.splice(0, entries.length - 8);
  cache.set(portfolio, entries);
  return value;
}

export function clearPortfolioAlignmentCache(portfolio?: Portfolio): void {
  if (portfolio) cache.delete(portfolio);
  else cache = new WeakMap<Portfolio, CacheEntry[]>();
}

