import { describe, expect, it, vi } from "vitest";
import {
  combineSubscriptionAuthoritySymbols,
  commitPublishedCycle,
  handleMarketCycleApi,
  hasCompleteFundamentals,
  hasCompleteFundamentalsShard,
  hasCompleteTechnicalShard,
  MAX_GLOBAL_SYMBOLS,
  MAX_SYMBOLS_PER_USER,
  mergeRegistrySymbols,
  resolveRegistryWriteMode,
  selectActiveGlobalSymbols,
  shardCapacityPlan,
} from "./marketCycle";

describe("market cycle scale and completeness", () => {
  it("deterministically accepts 20 durable 40-symbol subscriptions", () => {
    const updatedAt = "2026-07-27T20:00:00.000Z";
    const entries = Array.from({ length: 20 }, (_, account) => ({
      updatedAt,
      symbols: Array.from(
        { length: 40 },
        (_, offset) => `T${String(account * 40 + offset).padStart(4, "0")}`,
      ),
    }));

    const symbols = selectActiveGlobalSymbols(entries);

    expect(symbols).toHaveLength(MAX_GLOBAL_SYMBOLS);
    expect(symbols).toEqual([...symbols].sort());
    expect(new Set(symbols).size).toBe(800);
  });

  it("rejects global overflow instead of truncating it", () => {
    const entries = Array.from({ length: 21 }, (_, account) => ({
      updatedAt: "2026-07-27T20:00:00.000Z",
      symbols: Array.from(
        { length: 40 },
        (_, offset) => `T${String(account * 40 + offset).padStart(4, "0")}`,
      ),
    }));
    expect(() => selectActiveGlobalSymbols(entries)).toThrow(
      `${MAX_GLOBAL_SYMBOLS}`,
    );
  });

  it("packs 800 symbols with two retry minutes and stays below 50 fetches", () => {
    expect(shardCapacityPlan(800)).toEqual({
      shardSize: 30,
      shardCount: 27,
      retrySlotsPerPhase: 2,
      maxExternalSubrequestsPerShard: 30,
    });
  });

  it("treats partial shard markers as retryable", () => {
    expect(
      hasCompleteTechnicalShard(["AAPL", "MSFT"], {
        quotes: { AAPL: {} as never },
        technicals: { AAPL: {} },
        byTimeframe: { AAPL: {} },
      }),
    ).toBe(false);
    expect(
      hasCompleteFundamentalsShard(["AAPL", "MSFT"], {
        values: { AAPL: {} },
      }),
    ).toBe(false);
    expect(
      hasCompleteFundamentalsShard(["AAPL", "MSFT"], {
        values: { AAPL: {}, MSFT: {} },
      }),
    ).toBe(true);
  });

  it("requires a fundamentals value for every cycle symbol", () => {
    const manifest = { symbols: ["AAPL", "MSFT"] };
    expect(
      hasCompleteFundamentals(["AAPL", "MSFT"], manifest, {
        AAPL: { asOf: "2026-07-27" },
      }),
    ).toBe(false);
    expect(
      hasCompleteFundamentals(["AAPL", "MSFT"], manifest, {
        AAPL: { asOf: "2026-07-27" },
        MSFT: { asOf: "2026-07-27" },
      }),
    ).toBe(true);
  });

  it("rejects a 41-symbol user subscription without writing", async () => {
    const put = vi.fn();
    const env = {
      MARKET_CACHE: {
        list: vi.fn().mockResolvedValue({
          keys: [],
          list_complete: true,
          cacheStatus: null,
        }),
        get: vi.fn().mockResolvedValue(null),
        put,
      },
    };
    const response = await handleMarketCycleApi(
      new Request("https://example.test/api/market/registry", {
        method: "POST",
        body: JSON.stringify({
          symbols: Array.from(
            { length: MAX_SYMBOLS_PER_USER + 1 },
            (_, index) => `S${index}`,
          ),
        }),
      }),
      env as never,
      "/api/market/registry",
      "user-a",
    );
    expect(response?.status).toBe(409);
    expect(put).not.toHaveBeenCalled();
  });

  it("persists subscriptions without an offline-expiry TTL", async () => {
    const put = vi.fn().mockResolvedValue(undefined);
    const env = {
      MARKET_CACHE: {
        list: vi.fn().mockResolvedValue({
          keys: [],
          list_complete: true,
          cacheStatus: null,
        }),
        get: vi.fn().mockResolvedValue(null),
        put,
      },
    };
    const response = await handleMarketCycleApi(
      new Request("https://example.test/api/market/registry", {
        method: "POST",
        body: JSON.stringify({ symbols: ["AAPL", "MSFT"] }),
      }),
      env as never,
      "/api/market/registry",
      "user-a",
    );
    expect(response?.status).toBe(200);
    expect(put).toHaveBeenCalled();
    const registryPut = put.mock.calls.find((call) =>
      String(call[0]).startsWith("market:registry:"),
    );
    expect(registryPut).toBeTruthy();
    expect(registryPut).toHaveLength(2);
  });

  it("publishes an immutable complete payload before dispatching its reference", async () => {
    const order: string[] = [];
    const payload = {
      schemaVersion: 1 as const,
      complete: true as const,
      cycleKey: "market:cycle:complete:immutable",
      cycleAsOf: "2026-07-27T20:00:00.000Z",
      completedAt: "2026-07-27T20:59:00.000Z",
      publishedAt: "2026-07-27T21:00:00.000Z",
      nextCycleAt: "2026-07-27T22:00:00.000Z",
      symbols: ["AAPL"],
      quotes: {},
      fundamentals: {},
      technicals: {},
      byTimeframe: {},
      context: {},
      weatherBenchmarks: {
        status: "insufficient" as const,
        expectedSymbols: [],
        freshSymbols: [],
        missingSymbols: [],
        benchmarks: {},
        sectorSpdrOutperformingFreshCount: 0,
        sectorSpdrAboveSma50FreshCount: 0,
      },
      errors: [],
    };
    const env = {
      MARKET_CACHE: {
        put: vi.fn(async (key: string) => {
          order.push(`put:${key}`);
        }),
      },
      CONVICTION_CYCLE_QUEUE: {
        send: vi.fn(async (reference: { cycleKey: string }) => {
          order.push(`queue:${reference.cycleKey}`);
        }),
      },
    };
    await commitPublishedCycle(env as never, payload, false);
    expect(order[0]).toBe(`put:${payload.cycleKey}`);
    expect(order.at(-1)).toBe(`queue:${payload.cycleKey}`);

    order.length = 0;
    await commitPublishedCycle(env as never, payload, true);
    expect(order).not.toContain(`put:${payload.cycleKey}`);
    expect(order.at(-1)).toBe(`queue:${payload.cycleKey}`);
  });

  it("filters a published 800-symbol cycle to one user's 40 symbols", async () => {
    const allSymbols = Array.from(
      { length: 800 },
      (_, index) => `T${String(index).padStart(4, "0")}`,
    );
    const allowed = allSymbols.slice(320, 360);
    const values = Object.fromEntries(
      allSymbols.map((symbol) => [symbol, { symbol }]),
    );
    const cycle = {
      schemaVersion: 1,
      complete: true,
      cycleKey: "market:cycle:complete:test",
      cycleAsOf: "2026-07-27T20:00:00.000Z",
      completedAt: "2026-07-27T20:59:00.000Z",
      publishedAt: "2026-07-27T21:00:00.000Z",
      nextCycleAt: "2026-07-27T22:00:00.000Z",
      symbols: allSymbols,
      quotes: values,
      fundamentals: values,
      technicals: values,
      byTimeframe: values,
      context: {},
      weatherBenchmarks: {
        status: "complete",
        expectedSymbols: [],
        freshSymbols: [],
        missingSymbols: [],
        benchmarks: {},
        sectorSpdrOutperformingFreshCount: 11,
        sectorSpdrAboveSma50FreshCount: 11,
      },
      errors: ["T0000: hidden", "T0320: visible"],
    };
    const env = {
      MARKET_CACHE: {
        get: vi.fn(async (key: string) =>
          key === "market:cycle:published"
            ? cycle
            : { symbols: allowed, updatedAt: "2026-07-01T00:00:00.000Z" },
        ),
      },
    };
    const response = await handleMarketCycleApi(
      new Request("https://example.test/api/market/cycle"),
      env as never,
      "/api/market/cycle",
      "user-8",
    );
    const body = (await response?.json()) as {
      cycle: { symbols: string[]; quotes: Record<string, unknown>; errors: string[] };
    };
    expect(body.cycle.symbols).toEqual(allowed);
    expect(Object.keys(body.cycle.quotes)).toEqual(allowed);
    expect(body.cycle.errors).toEqual(["T0320: visible"]);
  });

  it("merges singleton registry adds instead of replacing the account list", () => {
    expect(
      mergeRegistrySymbols(["GOOG", "NVDA"], ["CRWV"], "add").sort(),
    ).toEqual(["CRWV", "GOOG", "NVDA"]);
    expect(mergeRegistrySymbols(["GOOG", "NVDA"], ["CRWV"], "replace")).toEqual([
      "CRWV",
    ]);
    expect(resolveRegistryWriteMode(undefined, 1)).toBe("add");
    expect(resolveRegistryWriteMode(undefined, 3)).toBe("replace");
    expect(resolveRegistryWriteMode("remove", 1)).toBe("remove");
  });

  it("unions subscription snapshot with registry expedite symbols", () => {
    expect(
      combineSubscriptionAuthoritySymbols(["GOOG", "MO"], ["CRWV", "GOOG"]).sort(),
    ).toEqual(["CRWV", "GOOG", "MO"]);
    expect(combineSubscriptionAuthoritySymbols(null, ["ACHR"])).toEqual(["ACHR"]);
  });

  it("expedites new registry symbols into an existing subscriptions snapshot", async () => {
    const put = vi.fn().mockResolvedValue(undefined);
    const env = {
      SYMBOL_AUTHORITY: "supabase",
      MARKET_CACHE: {
        list: vi.fn().mockResolvedValue({
          keys: [],
          list_complete: true,
          cacheStatus: null,
        }),
        get: vi.fn(async (key: string) => {
          if (key === "market:subscriptions:snapshot") {
            return {
              revision: "sha:1:GOOG",
              asOf: "2026-07-29T00:00:00.000Z",
              symbols: ["GOOG"],
              source: "supabase",
            };
          }
          return null;
        }),
        put,
      },
    };
    const response = await handleMarketCycleApi(
      new Request("https://example.test/api/market/registry", {
        method: "POST",
        body: JSON.stringify({ symbols: ["CRWV"], mode: "add" }),
      }),
      env as never,
      "/api/market/registry",
      "user-a",
    );
    expect(response?.status).toBe(200);
    const snapshotPut = put.mock.calls.find(
      (call) => call[0] === "market:subscriptions:snapshot",
    );
    expect(snapshotPut).toBeTruthy();
    const body = JSON.parse(String(snapshotPut?.[1])) as { symbols: string[] };
    expect(body.symbols.sort()).toEqual(["CRWV", "GOOG"]);
  });
});
