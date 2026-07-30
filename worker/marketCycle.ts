import type { CandleTime, TimeframedIndicatorsPayload } from "./indicators";
import {
  fetchCronFundamentals,
  fetchCronMarketContext,
  fetchCronTechnicalBundle,
  getProviderBudgetSnapshot,
  type MarketEnv,
  type QuotePayload,
} from "./market";
import {
  COMPLETE_CYCLE_PREFIX,
  type ConvictionCycleReference,
} from "./convictionDispatch";
import {
  derivePublishedWeatherBenchmarks,
  deriveWeatherSymbolObservables,
  planWeatherBenchmarkFetch,
  WEATHER_BENCHMARK_FETCH_ORDER,
  weatherBenchmarkMissingSymbols,
  type PublishedWeatherBenchmarks,
  type WeatherBenchmarkObservable,
  type WeatherSymbolObservable,
} from "./weatherBenchmarks";

const REGISTRY_PREFIX = "market:registry:";
const SUBSCRIPTIONS_SNAPSHOT_KEY = "market:subscriptions:snapshot";
const CYCLE_MANIFEST_PREFIX = "market:cycle:manifest:";
const TECH_SHARD_PREFIX = "market:cycle:tech:";
const CONTEXT_PREFIX = "market:cycle:context:";
const WEATHER_BENCHMARK_PREFIX = "market:cycle:weather-benchmarks:";
const FUNDY_MANIFEST_PREFIX = "market:fundy:manifest:";
const FUNDY_SHARD_PREFIX = "market:fundy:shard:";
const PUBLISHED_CYCLE_KEY = "market:cycle:published";
const PUBLISHED_CYCLE_REFERENCE_KEY = "market:cycle:published:key";
export const MAX_SYMBOLS_PER_USER = 40;
export const MAX_GLOBAL_SYMBOLS = 800;
export const SHARD_SIZE = 30;
export const SHARD_MINUTES_PER_PHASE = 29;
const MAX_CONCURRENCY = 6;
const HOUR_MS = 60 * 60_000;
const SHARD_TTL_SECONDS = 3 * 24 * 60 * 60;

export type RegistryWriteMode = "add" | "remove" | "replace";

export interface MarketCycleEnv extends MarketEnv {
  MARKET_CACHE: KVNamespace;
  CONVICTION_CYCLE_QUEUE: Queue<ConvictionCycleReference>;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  /** supabase = subscriptions snapshot authority; kv_legacy = registry-only */
  SYMBOL_AUTHORITY?: string;
}

interface RegistryEntry {
  symbols: string[];
  updatedAt: string;
}

interface SubscriptionsSnapshot {
  revision: string;
  asOf: string;
  symbols: string[];
  source: "supabase" | "kv_registry";
}

interface CycleManifest {
  cycleAsOf: string;
  symbols: string[];
  shardCount: number;
}

interface TechnicalShard {
  index: number;
  completedAt: string;
  quotes: Record<string, QuotePayload>;
  technicals: Record<string, Record<string, unknown>>;
  byTimeframe: Record<
    string,
    Partial<Record<CandleTime, TimeframedIndicatorsPayload>>
  >;
  weatherSymbolObservables: Record<string, WeatherBenchmarkObservable>;
  errors: string[];
}

interface ContextShard {
  completedAt: string;
  context: Record<string, unknown> | null;
  errors: string[];
}

export interface WeatherBenchmarkShard {
  schemaVersion: 1;
  completedAt: string;
  expectedSymbols: string[];
  values: Record<string, WeatherBenchmarkObservable>;
  attemptCount: number;
  budgetSkippedSymbols: string[];
  errors: string[];
}

export function weatherBenchmarkRunMode(
  minute: number,
  shard: WeatherBenchmarkShard | null,
): "initial" | "retry" | null {
  if (!shard) return minute >= 29 ? "initial" : null;
  return minute === 59 &&
      weatherBenchmarkMissingSymbols(shard.values).length > 0
    ? "retry"
    : null;
}

interface FundamentalsManifest {
  dayKey: string;
  symbols: string[];
  shardCount: number;
}

interface FundamentalsShard {
  index: number;
  completedAt: string;
  symbols: string[];
  values: Record<string, Record<string, unknown>>;
  errors: string[];
}

export function hasCompleteTechnicalShard(
  expected: string[],
  shard: Pick<TechnicalShard, "quotes" | "technicals" | "byTimeframe"> | null,
): boolean {
  return (
    shard != null &&
    expected.every(
      (symbol) =>
        shard.quotes[symbol] &&
        shard.technicals[symbol] &&
        shard.byTimeframe[symbol],
    )
  );
}

export function hasCompleteFundamentalsShard(
  expected: string[],
  shard: Pick<FundamentalsShard, "values"> | null,
): boolean {
  return shard != null && expected.every((symbol) => shard.values[symbol]);
}

export function hasCompleteFundamentals(
  symbols: string[],
  manifest: Pick<FundamentalsManifest, "symbols"> | null,
  values: Record<string, Record<string, unknown>>,
): boolean {
  return (
    symbols.length === 0 ||
    (manifest != null &&
      symbols.every((symbol) => {
        const value = values[symbol];
        return (
          manifest.symbols.includes(symbol) &&
          value != null &&
          typeof value === "object"
        );
      }))
  );
}

export interface MarketCyclePayload {
  schemaVersion: 1;
  complete: true;
  cycleKey: string;
  cycleAsOf: string;
  completedAt: string;
  publishedAt: string;
  nextCycleAt: string;
  symbols: string[];
  quotes: Record<string, QuotePayload>;
  fundamentals: Record<string, Record<string, unknown>>;
  technicals: Record<string, Record<string, unknown>>;
  byTimeframe: Record<
    string,
    Partial<Record<CandleTime, TimeframedIndicatorsPayload>>
  >;
  context: Record<string, unknown> | null;
  weatherBenchmarks: PublishedWeatherBenchmarks;
  weatherSymbolObservables: Record<string, WeatherSymbolObservable>;
  errors: string[];
}

export async function commitPublishedCycle(
  env: Pick<MarketCycleEnv, "MARKET_CACHE" | "CONVICTION_CYCLE_QUEUE">,
  payload: MarketCyclePayload,
  immutableAlreadyExists: boolean,
): Promise<void> {
  const serialized = JSON.stringify(payload);
  if (!immutableAlreadyExists) {
    await env.MARKET_CACHE.put(payload.cycleKey, serialized, {
      expirationTtl: SHARD_TTL_SECONDS,
    });
  }
  await Promise.all([
    env.MARKET_CACHE.put(PUBLISHED_CYCLE_KEY, serialized),
    env.MARKET_CACHE.put(PUBLISHED_CYCLE_REFERENCE_KEY, payload.cycleKey),
  ]);
  await env.CONVICTION_CYCLE_QUEUE.send(
    {
      version: 1,
      cycleKey: payload.cycleKey,
      cycleAsOf: payload.cycleAsOf,
    },
    { contentType: "json" },
  );
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "private, no-store",
    },
  });
}

function normalizeSymbols(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return [
    ...new Set(
      input
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim().toUpperCase())
        .filter((value) => /^[A-Z^][A-Z0-9.^-]{0,14}$/.test(value)),
    ),
  ];
}

function hourBoundary(time: number): number {
  return Math.floor(time / HOUR_MS) * HOUR_MS;
}

function keyTime(time: number | string): string {
  const ms = typeof time === "number" ? time : Date.parse(time);
  return new Date(ms).toISOString().replaceAll(":", "").replaceAll(".", "");
}

function etDayKey(time: number): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(time));
  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function isMarketWeek(time: number): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(time));
  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const weekday = get("weekday");
  const minutes = Number(get("hour")) * 60 + Number(get("minute"));
  if (weekday === "Sat") return false;
  if (weekday === "Sun") return minutes >= 20 * 60;
  if (weekday === "Fri") return minutes <= 20 * 60;
  return true;
}

async function mapWithConcurrency<T>(
  values: string[],
  run: (value: string) => Promise<T>,
): Promise<T[]> {
  const results = new Array<T>(values.length);
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(MAX_CONCURRENCY, values.length) },
    async () => {
      while (cursor < values.length) {
        const index = cursor;
        cursor += 1;
        results[index] = await run(values[index]!);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

export function mergeRegistrySymbols(
  existing: string[] | null | undefined,
  incoming: string[],
  mode: RegistryWriteMode,
): string[] {
  const prior = normalizeSymbols(existing ?? []);
  const next = normalizeSymbols(incoming);
  if (mode === "replace") return next;
  if (mode === "remove") {
    const drop = new Set(next);
    return prior.filter((symbol) => !drop.has(symbol));
  }
  return normalizeSymbols([...prior, ...next]);
}

export function resolveRegistryWriteMode(
  raw: unknown,
  symbolCount: number,
): RegistryWriteMode {
  if (raw === "replace" || raw === "add" || raw === "remove") return raw;
  return symbolCount <= 1 ? "add" : "replace";
}

/**
 * Supabase snapshot is authoritative, but per-user registry writes must still
 * expedite new symbols into the next cycle until the hourly snapshot refreshes.
 */
export function combineSubscriptionAuthoritySymbols(
  snapshotSymbols: readonly string[] | null | undefined,
  registrySymbols: readonly string[],
): string[] {
  return normalizeSymbols([...(snapshotSymbols ?? []), ...registrySymbols]);
}

async function listRegistryEntries(
  env: MarketCycleEnv,
): Promise<RegistryEntry[]> {
  const keys: { name: string }[] = [];
  let cursor: string | undefined;
  do {
    const listed = await env.MARKET_CACHE.list({
      prefix: REGISTRY_PREFIX,
      cursor,
      limit: 100,
    });
    keys.push(...listed.keys);
    cursor = listed.list_complete ? undefined : listed.cursor;
  } while (cursor && keys.length < 1_000);
  const entries = await Promise.all(
    keys.map((key) =>
      env.MARKET_CACHE.get<RegistryEntry>(key.name, "json"),
    ),
  );
  return entries.filter((entry): entry is RegistryEntry => entry != null);
}

async function registeredSymbols(env: MarketCycleEnv): Promise<string[]> {
  const entries = await listRegistryEntries(env);
  const registrySymbols = entries.flatMap((entry) => entry.symbols);
  const authority = (env.SYMBOL_AUTHORITY ?? "supabase").toLowerCase();
  if (authority === "kv_legacy") {
    return selectActiveGlobalSymbols(entries);
  }
  const snapshot = await env.MARKET_CACHE.get<SubscriptionsSnapshot>(
    SUBSCRIPTIONS_SNAPSHOT_KEY,
    "json",
  );
  const combined = combineSubscriptionAuthoritySymbols(
    snapshot?.symbols,
    registrySymbols,
  );
  if (combined.length === 0) return [];
  return selectActiveGlobalSymbols([
    {
      symbols: combined,
      updatedAt: snapshot?.asOf || new Date().toISOString(),
    },
  ]);
}

/** Patch snapshot immediately on add/replace so the next minute shard sees new tickers. */
async function expediteSubscriptionsSnapshot(
  env: MarketCycleEnv,
  symbols: string[],
  mode: RegistryWriteMode,
): Promise<void> {
  if ((env.SYMBOL_AUTHORITY ?? "supabase").toLowerCase() === "kv_legacy") {
    return;
  }
  if (mode === "remove" || symbols.length === 0) return;
  const existing = await env.MARKET_CACHE.get<SubscriptionsSnapshot>(
    SUBSCRIPTIONS_SNAPSHOT_KEY,
    "json",
  );
  const merged = combineSubscriptionAuthoritySymbols(
    existing?.symbols,
    symbols,
  );
  if (
    existing &&
    merged.length === existing.symbols.length &&
    merged.every((symbol, index) => symbol === existing.symbols[index])
  ) {
    return;
  }
  const snapshot: SubscriptionsSnapshot = {
    revision: `sha:${merged.length}:${merged.slice(0, 8).join(",")}`,
    asOf: new Date().toISOString(),
    symbols: merged,
    source: existing?.source ?? "supabase",
  };
  await env.MARKET_CACHE.put(
    SUBSCRIPTIONS_SNAPSHOT_KEY,
    JSON.stringify(snapshot),
  );
}

/**
 * Pull active symbols from Supabase market_symbol_subscriptions into KV.
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 */
export async function syncSubscriptionsSnapshot(
  env: MarketCycleEnv,
): Promise<SubscriptionsSnapshot | null> {
  const base = env.SUPABASE_URL?.replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) return null;

  const symbols: string[] = [];
  let offset = 0;
  const pageSize = 1000;
  for (;;) {
    const url =
      `${base}/rest/v1/market_symbol_subscriptions` +
      `?select=ticker&active=eq.true&order=ticker&limit=${pageSize}&offset=${offset}`;
    const response = await fetch(url, {
      headers: {
        apikey: key,
        authorization: `Bearer ${key}`,
        accept: "application/json",
      },
    });
    if (!response.ok) {
      console.error(
        JSON.stringify({
          event: "subscriptions_snapshot_fetch_failed",
          status: response.status,
        }),
      );
      return null;
    }
    const rows = (await response.json()) as Array<{ ticker?: string }>;
    for (const row of rows) {
      if (typeof row.ticker === "string" && row.ticker) symbols.push(row.ticker);
    }
    if (rows.length < pageSize) break;
    offset += pageSize;
  }

  const normalized = normalizeSymbols(symbols);
  selectActiveGlobalSymbols([
    { symbols: normalized, updatedAt: new Date().toISOString() },
  ]);
  const snapshot: SubscriptionsSnapshot = {
    revision: `sha:${normalized.length}:${normalized.slice(0, 8).join(",")}`,
    asOf: new Date().toISOString(),
    symbols: normalized,
    source: "supabase",
  };
  await env.MARKET_CACHE.put(
    SUBSCRIPTIONS_SNAPSHOT_KEY,
    JSON.stringify(snapshot),
  );
  console.log(
    JSON.stringify({
      event: "subscriptions_snapshot_synced",
      count: normalized.length,
      revision: snapshot.revision,
    }),
  );
  return snapshot;
}

export function selectActiveGlobalSymbols(
  entries: RegistryEntry[],
): string[] {
  const symbols = [
    ...new Set(
      entries
        .flatMap((entry) => entry.symbols)
        .map((symbol) => symbol.toUpperCase()),
    ),
  ].sort();
  if (symbols.length > MAX_GLOBAL_SYMBOLS) {
    throw new RangeError(
      `Global market symbol capacity exceeded (${symbols.length}/${MAX_GLOBAL_SYMBOLS})`,
    );
  }
  return symbols;
}

export function shardCapacityPlan(symbolCount: number): {
  shardSize: number;
  shardCount: number;
  retrySlotsPerPhase: number;
  maxExternalSubrequestsPerShard: number;
} {
  const shardCount = Math.ceil(symbolCount / SHARD_SIZE);
  return {
    shardSize: SHARD_SIZE,
    shardCount,
    retrySlotsPerPhase: Math.max(0, SHARD_MINUTES_PER_PHASE - shardCount),
    maxExternalSubrequestsPerShard: SHARD_SIZE,
  };
}

async function registerSymbols(
  request: Request,
  env: MarketCycleEnv,
  userId: string,
): Promise<Response> {
  let body: { symbols?: unknown; mode?: unknown };
  try {
    body = (await request.json()) as { symbols?: unknown; mode?: unknown };
  } catch {
    return json({ error: "invalid json" }, 400);
  }
  const incoming = normalizeSymbols(body.symbols);
  const mode = resolveRegistryWriteMode(body.mode, incoming.length);
  const registryKey = `${REGISTRY_PREFIX}${userId}`;
  const prior = await env.MARKET_CACHE.get<RegistryEntry>(registryKey, "json");
  const symbols = mergeRegistrySymbols(prior?.symbols, incoming, mode);
  if (symbols.length > MAX_SYMBOLS_PER_USER) {
    console.error(
      JSON.stringify({
        event: "market_subscription_cap_rejection",
        scope: "user",
        userId,
        requested: symbols.length,
        limit: MAX_SYMBOLS_PER_USER,
        mode,
      }),
    );
    return json(
      {
        error: "symbol subscription capacity exceeded",
        requested: symbols.length,
        limit: MAX_SYMBOLS_PER_USER,
      },
      409,
    );
  }
  const existingKeys = await env.MARKET_CACHE.list({
    prefix: REGISTRY_PREFIX,
    limit: 1_000,
  });
  const existingEntries = await Promise.all(
    existingKeys.keys
      .filter((key) => key.name !== registryKey)
      .map((key) => env.MARKET_CACHE.get<RegistryEntry>(key.name, "json")),
  );
  try {
    selectActiveGlobalSymbols([
      ...existingEntries.filter((entry): entry is RegistryEntry => entry != null),
      { symbols, updatedAt: new Date().toISOString() },
    ]);
  } catch {
    console.error(
      JSON.stringify({
        event: "market_subscription_cap_rejection",
        scope: "global",
        userId,
        limit: MAX_GLOBAL_SYMBOLS,
        mode,
      }),
    );
    return json(
      {
        error: "global symbol subscription capacity exceeded",
        limit: MAX_GLOBAL_SYMBOLS,
      },
      409,
    );
  }
  await env.MARKET_CACHE.put(
    registryKey,
    JSON.stringify({ symbols, updatedAt: new Date().toISOString() }),
  );
  try {
    await expediteSubscriptionsSnapshot(env, incoming, mode);
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "subscriptions_snapshot_expedite_failed",
        detail: error instanceof Error ? error.message : String(error),
      }),
    );
  }
  return json({ registered: symbols.length, symbols, mode });
}

export async function handleMarketCycleApi(
  request: Request,
  env: MarketCycleEnv,
  pathname: string,
  userId: string,
): Promise<Response | null> {
  if (pathname === "/api/market/registry" && request.method === "POST") {
    return registerSymbols(request, env, userId);
  }
  if (pathname === "/api/market/cycle" && request.method === "GET") {
    const cycle = await env.MARKET_CACHE.get<MarketCyclePayload>(
      PUBLISHED_CYCLE_KEY,
      "json",
    );
    if (!cycle) return json({ cycle: null, state: "warming" }, 202);
    const registry = await env.MARKET_CACHE.get<RegistryEntry>(
      `${REGISTRY_PREFIX}${userId}`,
      "json",
    );
    const allowed = new Set(registry?.symbols ?? []);
    const filter = <T>(values: Record<string, T>): Record<string, T> =>
      Object.fromEntries(
        Object.entries(values).filter(([symbol]) => allowed.has(symbol)),
      );
    return json({
      cycle: {
        ...cycle,
        symbols: cycle.symbols.filter((symbol) => allowed.has(symbol)),
        quotes: filter(cycle.quotes),
        fundamentals: filter(cycle.fundamentals),
        technicals: filter(cycle.technicals),
        byTimeframe: filter(cycle.byTimeframe),
        weatherSymbolObservables: filter(cycle.weatherSymbolObservables ?? {}),
        errors: cycle.errors.filter((error) => {
          if (!error.includes(":")) return true;
          const symbol = error.split(":", 1)[0] ?? "";
          return allowed.has(symbol);
        }),
      },
    });
  }
  return null;
}

function techShardKey(cycleAsOf: string, index: number): string {
  return `${TECH_SHARD_PREFIX}${keyTime(cycleAsOf)}:${index}`;
}

function contextKey(cycleAsOf: string): string {
  return `${CONTEXT_PREFIX}${keyTime(cycleAsOf)}`;
}

function weatherBenchmarkKey(cycleAsOf: string): string {
  return `${WEATHER_BENCHMARK_PREFIX}${keyTime(cycleAsOf)}`;
}

function fundyShardKey(dayKey: string, index: number): string {
  return `${FUNDY_SHARD_PREFIX}${dayKey}:${index}`;
}

async function ensureCycleManifest(
  env: MarketCycleEnv,
  cycleAsOfMs: number,
): Promise<CycleManifest> {
  const key = `${CYCLE_MANIFEST_PREFIX}${keyTime(cycleAsOfMs)}`;
  const existing = await env.MARKET_CACHE.get<CycleManifest>(key, "json");
  if (existing) return existing;
  const symbols = await registeredSymbols(env);
  const manifest: CycleManifest = {
    cycleAsOf: new Date(cycleAsOfMs).toISOString(),
    symbols,
    shardCount: Math.ceil(symbols.length / SHARD_SIZE),
  };
  await env.MARKET_CACHE.put(key, JSON.stringify(manifest), {
    expirationTtl: SHARD_TTL_SECONDS,
  });
  return manifest;
}

async function ensureFundamentalsManifest(
  env: MarketCycleEnv,
  dayKey: string,
  symbols: string[],
): Promise<FundamentalsManifest> {
  const key = `${FUNDY_MANIFEST_PREFIX}${dayKey}`;
  const existing = await env.MARKET_CACHE.get<FundamentalsManifest>(key, "json");
  if (existing) {
    const known = new Set(existing.symbols);
    const merged = [
      ...existing.symbols,
      ...symbols.filter((symbol) => !known.has(symbol)),
    ];
    if (
      merged.length === existing.symbols.length &&
      merged.every((symbol, index) => symbol === existing.symbols[index])
    ) {
      return existing;
    }
    const updated: FundamentalsManifest = {
      dayKey,
      symbols: merged,
      shardCount: Math.ceil(merged.length / SHARD_SIZE),
    };
    await env.MARKET_CACHE.put(key, JSON.stringify(updated), {
      expirationTtl: SHARD_TTL_SECONDS,
    });
    return updated;
  }
  const manifest: FundamentalsManifest = {
    dayKey,
    symbols,
    shardCount: Math.ceil(symbols.length / SHARD_SIZE),
  };
  await env.MARKET_CACHE.put(key, JSON.stringify(manifest), {
    expirationTtl: SHARD_TTL_SECONDS,
  });
  return manifest;
}

async function writeTechnicalShard(
  env: MarketCycleEnv,
  manifest: CycleManifest,
  index: number,
): Promise<void> {
  if (index >= manifest.shardCount) return;
  const symbols = manifest.symbols.slice(
    index * SHARD_SIZE,
    (index + 1) * SHARD_SIZE,
  );
  const rows = await mapWithConcurrency(symbols, async (symbol) => {
    try {
      const bundle = await fetchCronTechnicalBundle(
        symbol,
        Date.parse(manifest.cycleAsOf),
      );
      return bundle
        ? { symbol, bundle, error: null }
        : {
            symbol,
            bundle: null,
            error: `${symbol}: technical data unavailable`,
          };
    } catch {
      return {
        symbol,
        bundle: null,
        error: `${symbol}: technical pull failed`,
      };
    }
  });
  const shard: TechnicalShard = {
    index,
    completedAt: new Date().toISOString(),
    quotes: {},
    technicals: {},
    byTimeframe: {},
    weatherSymbolObservables: {},
    errors: [],
  };
  for (const row of rows) {
    if (!row.bundle) {
      if (row.error) shard.errors.push(row.error);
      continue;
    }
    shard.quotes[row.symbol] = row.bundle.quote;
    shard.technicals[row.symbol] = row.bundle.technicals;
    shard.byTimeframe[row.symbol] = row.bundle.byTimeframe;
    if (row.bundle.weatherBenchmark) {
      shard.weatherSymbolObservables[row.symbol] =
        row.bundle.weatherBenchmark;
    }
  }
  await env.MARKET_CACHE.put(
    techShardKey(manifest.cycleAsOf, index),
    JSON.stringify(shard),
    { expirationTtl: SHARD_TTL_SECONDS },
  );
}

async function firstIncompleteTechnicalShard(
  env: MarketCycleEnv,
  manifest: CycleManifest,
  throughIndex: number,
): Promise<number | null> {
  const end = Math.min(throughIndex, manifest.shardCount - 1);
  for (let index = 0; index <= end; index += 1) {
    const shard = await env.MARKET_CACHE.get<TechnicalShard>(
      techShardKey(manifest.cycleAsOf, index),
      "json",
    );
    const expected = manifest.symbols.slice(
      index * SHARD_SIZE,
      (index + 1) * SHARD_SIZE,
    );
    if (!hasCompleteTechnicalShard(expected, shard)) {
      return index;
    }
  }
  return null;
}

async function writeContextShard(
  env: MarketCycleEnv,
  manifest: CycleManifest,
): Promise<void> {
  try {
    const context = await fetchCronMarketContext(env);
    const shard: ContextShard = {
      completedAt: new Date().toISOString(),
      context,
      errors: [],
    };
    await env.MARKET_CACHE.put(
      contextKey(manifest.cycleAsOf),
      JSON.stringify(shard),
      { expirationTtl: SHARD_TTL_SECONDS },
    );
  } catch {
    // No marker is written: later shards retry, and publication stays atomic.
  }
}

async function writeWeatherBenchmarkShard(
  env: MarketCycleEnv,
  manifest: CycleManifest,
  existing: WeatherBenchmarkShard | null = null,
): Promise<WeatherBenchmarkShard> {
  const values = { ...(existing?.values ?? {}) };
  const budget = getProviderBudgetSnapshot("yahoo");
  const fetchPlan = planWeatherBenchmarkFetch(
    budget.remaining,
    Object.keys(values),
  );
  const shard: WeatherBenchmarkShard = {
    schemaVersion: 1,
    completedAt: "",
    expectedSymbols: [...WEATHER_BENCHMARK_FETCH_ORDER],
    values,
    attemptCount: (existing?.attemptCount ?? 0) + 1,
    budgetSkippedSymbols: fetchPlan.budgetSkippedSymbols,
    errors: [],
  };
  // Sequential priority is intentional. The plan omits IWM before required
  // symbols and preserves two Yahoo units for other Worker traffic.
  for (const symbol of fetchPlan.fetchSymbols) {
    try {
      const bundle = await fetchCronTechnicalBundle(
        symbol,
        Date.parse(manifest.cycleAsOf),
      );
      if (bundle?.weatherBenchmark) {
        shard.values[symbol] = bundle.weatherBenchmark;
      } else {
        shard.errors.push(`${symbol}: weather benchmark unavailable`);
      }
    } catch {
      shard.errors.push(`${symbol}: weather benchmark pull failed`);
    }
  }
  const missing = weatherBenchmarkMissingSymbols(shard.values);
  shard.budgetSkippedSymbols = shard.budgetSkippedSymbols.filter((symbol) =>
    missing.includes(symbol)
  );
  for (const symbol of missing) {
    if (!shard.errors.some((error) => error.startsWith(`${symbol}:`))) {
      shard.errors.push(
        shard.budgetSkippedSymbols.includes(symbol)
          ? `${symbol}: weather benchmark deferred by Yahoo soft budget`
          : `${symbol}: weather benchmark unavailable after retry`,
      );
    }
  }
  shard.completedAt = new Date().toISOString();
  await env.MARKET_CACHE.put(
    weatherBenchmarkKey(manifest.cycleAsOf),
    JSON.stringify(shard),
    { expirationTtl: SHARD_TTL_SECONDS },
  );
  return shard;
}

async function writeFundamentalsShard(
  env: MarketCycleEnv,
  manifest: FundamentalsManifest,
  index: number,
): Promise<void> {
  if (index >= manifest.shardCount) return;
  const symbols = manifest.symbols.slice(
    index * SHARD_SIZE,
    (index + 1) * SHARD_SIZE,
  );
  const key = fundyShardKey(manifest.dayKey, index);
  const existing = await env.MARKET_CACHE.get<FundamentalsShard>(key, "json");
  if (
    existing &&
    existing.symbols.length === symbols.length &&
    existing.symbols.every((symbol, offset) => symbol === symbols[offset]) &&
    hasCompleteFundamentalsShard(symbols, existing)
  ) {
    return;
  }
  const rows = await mapWithConcurrency(symbols, async (symbol) => {
    try {
      const fundamentals = await fetchCronFundamentals(symbol);
      return fundamentals
        ? { symbol, fundamentals, error: null }
        : {
            symbol,
            fundamentals: null,
            error: `${symbol}: fundamentals unavailable`,
          };
    } catch {
      return {
        symbol,
        fundamentals: null,
        error: `${symbol}: fundamentals pull failed`,
      };
    }
  });
  const shard: FundamentalsShard = {
    index,
    completedAt: new Date().toISOString(),
    symbols,
    values: {},
    errors: [],
  };
  for (const row of rows) {
    if (row.fundamentals) shard.values[row.symbol] = row.fundamentals;
    else if (row.error) shard.errors.push(row.error);
  }
  await env.MARKET_CACHE.put(
    key,
    JSON.stringify(shard),
    { expirationTtl: SHARD_TTL_SECONDS },
  );
}

async function firstIncompleteFundamentalsShard(
  env: MarketCycleEnv,
  manifest: FundamentalsManifest,
  throughIndex: number,
): Promise<number | null> {
  const end = Math.min(throughIndex, manifest.shardCount - 1);
  for (let index = 0; index <= end; index += 1) {
    const shard = await env.MARKET_CACHE.get<FundamentalsShard>(
      fundyShardKey(manifest.dayKey, index),
      "json",
    );
    const expected = manifest.symbols.slice(
      index * SHARD_SIZE,
      (index + 1) * SHARD_SIZE,
    );
    if (!hasCompleteFundamentalsShard(expected, shard)) {
      return index;
    }
  }
  return null;
}

async function readAllShards<T extends object>(
  count: number,
  keyFor: (index: number) => string,
  env: MarketCycleEnv,
): Promise<T[] | null> {
  const rows: T[] = [];
  for (let index = 0; index < count; index += 1) {
    const row = await env.MARKET_CACHE.get<T>(keyFor(index), "json");
    if (!row) return null;
    rows.push(row);
  }
  return rows;
}

async function publishCycle(
  env: MarketCycleEnv,
  cycleAsOfMs: number,
  now: number,
): Promise<void> {
  const startedAt = Date.now();
  const logIncomplete = (reason: string, details: Record<string, unknown> = {}) =>
    console.warn(
      JSON.stringify({
        event: "market_cycle_incomplete",
        cycleAsOf: new Date(cycleAsOfMs).toISOString(),
        reason,
        ...details,
      }),
    );
  const manifest = await env.MARKET_CACHE.get<CycleManifest>(
    `${CYCLE_MANIFEST_PREFIX}${keyTime(cycleAsOfMs)}`,
    "json",
  );
  if (!manifest) {
    logIncomplete("manifest_missing");
    return;
  }
  const techShards = await readAllShards<TechnicalShard>(
    manifest.shardCount,
    (index) => techShardKey(manifest.cycleAsOf, index),
    env,
  );
  const context = await env.MARKET_CACHE.get<ContextShard>(
    contextKey(manifest.cycleAsOf),
    "json",
  );
  const weatherShard = await env.MARKET_CACHE.get<WeatherBenchmarkShard>(
    weatherBenchmarkKey(manifest.cycleAsOf),
    "json",
  );
  if (!techShards || !context?.context) {
    logIncomplete(!techShards ? "technical_shards_missing" : "context_missing", {
      expectedTechnicalShards: manifest.shardCount,
    });
    return;
  }
  const technicalsReady = techShards.every((shard, index) =>
    hasCompleteTechnicalShard(
      manifest.symbols.slice(
        index * SHARD_SIZE,
        (index + 1) * SHARD_SIZE,
      ),
      shard,
    ),
  );
  if (!technicalsReady) {
    logIncomplete("technical_symbols_missing", {
      expectedSymbols: manifest.symbols.length,
      actualSymbols: Object.keys(
        Object.assign({}, ...techShards.map((shard) => shard.quotes)),
      ).length,
    });
    return;
  }

  const dayKey = etDayKey(cycleAsOfMs);
  const fundyManifest = await env.MARKET_CACHE.get<FundamentalsManifest>(
    `${FUNDY_MANIFEST_PREFIX}${dayKey}`,
    "json",
  );
  const fundyShards = fundyManifest
    ? await readAllShards<FundamentalsShard>(
        fundyManifest.shardCount,
        (index) => fundyShardKey(fundyManifest.dayKey, index),
        env,
      )
    : null;
  const fundamentalValues = Object.assign(
    {},
    ...(fundyShards?.map((shard) => shard.values) ?? []),
  ) as Record<string, Record<string, unknown>>;
  const fundamentalsReady =
    manifest.symbols.length === 0 ||
    (fundyShards != null &&
      hasCompleteFundamentals(
        manifest.symbols,
        fundyManifest,
        fundamentalValues,
      ));
  if (!fundamentalsReady) {
    logIncomplete("fundamentals_missing", {
      expectedSymbols: manifest.symbols.length,
      actualSymbols: Object.keys(fundamentalValues).length,
    });
    return;
  }

  const cycleKey = `${COMPLETE_CYCLE_PREFIX}${keyTime(manifest.cycleAsOf)}`;
  const existing = await env.MARKET_CACHE.get<MarketCyclePayload>(
    cycleKey,
    "json",
  );
  const priorPublishedCycle = await env.MARKET_CACHE.get<MarketCyclePayload>(
    PUBLISHED_CYCLE_KEY,
    "json",
  );
  const weatherBenchmarks = derivePublishedWeatherBenchmarks(
    weatherShard?.values ?? {},
    weatherShard?.completedAt,
    {
      cycleAsOf: manifest.cycleAsOf,
      prior: priorPublishedCycle?.weatherBenchmarks ?? null,
    },
  );
  const payload: MarketCyclePayload = {
    schemaVersion: 1,
    complete: true,
    cycleKey,
    cycleAsOf: manifest.cycleAsOf,
    completedAt: [
      ...techShards.map((shard) => shard.completedAt),
      context.completedAt,
      ...(weatherShard ? [weatherShard.completedAt] : []),
    ].sort().at(-1)!,
    publishedAt: new Date(now).toISOString(),
    nextCycleAt: new Date(hourBoundary(now) + HOUR_MS).toISOString(),
    symbols: manifest.symbols,
    quotes: Object.assign({}, ...techShards.map((shard) => shard.quotes)),
    fundamentals: Object.assign(
      {},
      fundamentalValues,
    ),
    technicals: Object.assign(
      {},
      ...techShards.map((shard) => shard.technicals),
    ),
    byTimeframe: Object.assign(
      {},
      ...techShards.map((shard) => shard.byTimeframe),
    ),
    context: context.context,
    weatherBenchmarks,
    weatherSymbolObservables: deriveWeatherSymbolObservables(
      Object.assign(
        {},
        ...techShards.map((shard) => shard.weatherSymbolObservables ?? {}),
      ),
      fundamentalValues,
      weatherBenchmarks,
      manifest.cycleAsOf,
    ),
    errors: [
      ...techShards.flatMap((shard) => shard.errors),
      ...context.errors,
      ...(weatherShard?.errors ?? ["weather benchmarks: shard missing"]),
      ...(fundyShards?.flatMap((shard) => shard.errors) ?? []),
    ],
  };
  const completeCycle = existing ?? payload;
  const serialized = JSON.stringify(completeCycle);
  await commitPublishedCycle(env, completeCycle, existing != null);
  console.log(
    JSON.stringify({
      event: "market_cycle_phase",
      phase: "publish",
      durationMs: Date.now() - startedAt,
      payloadBytes: new TextEncoder().encode(serialized).byteLength,
      symbolCount: manifest.symbols.length,
      completed: true,
    }),
  );
}

/**
 * Deterministic minute ownership avoids mutable KV locks:
 * 00–28 technical shards, then context + Weather benchmarks, then fundamentals.
 * The next hour publishes only when every expected shard and every symbol's
 * fundamentals value exist.
 */
export async function runScheduledMarketCycle(
  env: MarketCycleEnv,
  scheduledTime: number,
): Promise<void> {
  const invocationStartedAt = Date.now();
  if (!isMarketWeek(scheduledTime)) return;
  const boundary = hourBoundary(scheduledTime);
  const minute = new Date(scheduledTime).getUTCMinutes();

  // Refresh authoritative subscription snapshot once per hour (minute 0) when
  // service-role credentials are configured. Failures keep the prior snapshot.
  if (minute === 0) {
    try {
      await syncSubscriptionsSnapshot(env);
    } catch (error) {
      console.error(
        JSON.stringify({
          event: "subscriptions_snapshot_sync_error",
          detail: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  const previousBoundary = boundary - HOUR_MS;
  const published = await env.MARKET_CACHE.get<MarketCyclePayload>(
    PUBLISHED_CYCLE_KEY,
    "json",
  );
  if (
    !published ||
    Date.parse(published.cycleAsOf) < previousBoundary
  ) {
    await publishCycle(env, previousBoundary, scheduledTime);
  }

  const manifest = await ensureCycleManifest(env, boundary);
  const dayKey = etDayKey(scheduledTime);
  const fundyManifest = await ensureFundamentalsManifest(
    env,
    dayKey,
    manifest.symbols,
  );

  const missingTechnical = await firstIncompleteTechnicalShard(
    env,
    manifest,
    minute <= 28 ? minute : manifest.shardCount - 1,
  );
  if (missingTechnical != null) {
    await writeTechnicalShard(env, manifest, missingTechnical);
    console.log(
      JSON.stringify({
        event: "market_cycle_phase",
        phase: "technical",
        durationMs: Date.now() - invocationStartedAt,
        symbolCount: manifest.symbols.length,
        completed: true,
      }),
    );
    return;
  }
  if (minute >= 29) {
    const existing = await env.MARKET_CACHE.get(
      contextKey(manifest.cycleAsOf),
    );
    if (!existing) {
      await writeContextShard(env, manifest);
      console.log(
        JSON.stringify({
          event: "market_cycle_phase",
          phase: "context",
          durationMs: Date.now() - invocationStartedAt,
          symbolCount: manifest.symbols.length,
          completed: true,
        }),
      );
      // Minute 29 owns both small post-tech shards. A late context recovery
      // returns here to avoid combining it with a 30-symbol fundy pull.
      if (minute > 29) return;
    }
    const existingWeather = await env.MARKET_CACHE.get<WeatherBenchmarkShard>(
      weatherBenchmarkKey(manifest.cycleAsOf),
      "json",
    );
    const weatherMode = weatherBenchmarkRunMode(minute, existingWeather);
    if (weatherMode) {
      const writtenWeather = await writeWeatherBenchmarkShard(
        env,
        manifest,
        existingWeather,
      );
      console.log(
        JSON.stringify({
          event: "market_cycle_phase",
          phase: "weather_benchmarks",
          durationMs: Date.now() - invocationStartedAt,
          symbolCount: WEATHER_BENCHMARK_FETCH_ORDER.length,
          mode: weatherMode,
          attemptCount: writtenWeather.attemptCount,
          missingSymbols: weatherBenchmarkMissingSymbols(
            writtenWeather.values,
          ),
          budgetSkippedSymbols: writtenWeather.budgetSkippedSymbols,
          completed: true,
        }),
      );
      return;
    }
  }
  if (minute >= 30 && minute <= 58) {
    const incompleteFundamentals = await firstIncompleteFundamentalsShard(
      env,
      fundyManifest,
      minute - 30,
    );
    if (incompleteFundamentals != null) {
      await writeFundamentalsShard(
        env,
        fundyManifest,
        incompleteFundamentals,
      );
      console.log(
        JSON.stringify({
          event: "market_cycle_phase",
          phase: "fundamentals",
          shardIndex: incompleteFundamentals,
          durationMs: Date.now() - invocationStartedAt,
          symbolCount: fundyManifest.symbols.length,
          completed: true,
        }),
      );
    }
  }
}
