import type { CandleTime, TimeframedIndicatorsPayload } from "./indicators";
import {
  fetchCronFundamentals,
  fetchCronMarketContext,
  fetchCronTechnicalBundle,
  type MarketEnv,
  type QuotePayload,
} from "./market";

const REGISTRY_PREFIX = "market:registry:";
const CYCLE_MANIFEST_PREFIX = "market:cycle:manifest:";
const TECH_SHARD_PREFIX = "market:cycle:tech:";
const CONTEXT_PREFIX = "market:cycle:context:";
const FUNDY_MANIFEST_PREFIX = "market:fundy:manifest:";
const FUNDY_SHARD_PREFIX = "market:fundy:shard:";
const PUBLISHED_CYCLE_KEY = "market:cycle:published";
const MAX_SYMBOLS_PER_USER = 40;
const MAX_GLOBAL_SYMBOLS = 800;
const SHARD_SIZE = 28;
const MAX_CONCURRENCY = 6;
const HOUR_MS = 60 * 60_000;
const SHARD_TTL_SECONDS = 3 * 24 * 60 * 60;
const REGISTRY_TTL_SECONDS = 35 * 24 * 60 * 60;
const REGISTRY_ACTIVE_MS = 30 * 24 * 60 * 60_000;

export interface MarketCycleEnv extends MarketEnv {
  MARKET_CACHE: KVNamespace;
}

interface RegistryEntry {
  symbols: string[];
  updatedAt: string;
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
  errors: string[];
}

interface ContextShard {
  completedAt: string;
  context: Record<string, unknown> | null;
  errors: string[];
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

export interface MarketCyclePayload {
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
  errors: string[];
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
  ].slice(0, MAX_SYMBOLS_PER_USER);
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

async function registeredSymbols(env: MarketCycleEnv): Promise<string[]> {
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
  const activeAfter = Date.now() - REGISTRY_ACTIVE_MS;
  return [
    ...new Set(
      entries
        .filter(
          (entry) => entry && Date.parse(entry.updatedAt) >= activeAfter,
        )
        .flatMap((entry) => entry?.symbols ?? [])
        .map((symbol) => symbol.toUpperCase()),
    ),
  ]
    .sort()
    .slice(0, MAX_GLOBAL_SYMBOLS);
}

async function registerSymbols(
  request: Request,
  env: MarketCycleEnv,
  userId: string,
): Promise<Response> {
  let body: { symbols?: unknown };
  try {
    body = (await request.json()) as { symbols?: unknown };
  } catch {
    return json({ error: "invalid json" }, 400);
  }
  const symbols = normalizeSymbols(body.symbols);
  await env.MARKET_CACHE.put(
    `${REGISTRY_PREFIX}${userId}`,
    JSON.stringify({ symbols, updatedAt: new Date().toISOString() }),
    { expirationTtl: REGISTRY_TTL_SECONDS },
  );
  return json({ registered: symbols.length, symbols });
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
  }
  await env.MARKET_CACHE.put(
    techShardKey(manifest.cycleAsOf, index),
    JSON.stringify(shard),
    { expirationTtl: SHARD_TTL_SECONDS },
  );
}

async function firstMissingTechnicalShard(
  env: MarketCycleEnv,
  manifest: CycleManifest,
  throughIndex: number,
): Promise<number | null> {
  const end = Math.min(throughIndex, manifest.shardCount - 1);
  for (let index = 0; index <= end; index += 1) {
    const exists = await env.MARKET_CACHE.get(
      techShardKey(manifest.cycleAsOf, index),
    );
    if (!exists) return index;
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
    existing.symbols.every((symbol, offset) => symbol === symbols[offset])
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
  const manifest = await env.MARKET_CACHE.get<CycleManifest>(
    `${CYCLE_MANIFEST_PREFIX}${keyTime(cycleAsOfMs)}`,
    "json",
  );
  if (!manifest) return;
  const techShards = await readAllShards<TechnicalShard>(
    manifest.shardCount,
    (index) => techShardKey(manifest.cycleAsOf, index),
    env,
  );
  const context = await env.MARKET_CACHE.get<ContextShard>(
    contextKey(manifest.cycleAsOf),
    "json",
  );
  if (!techShards || !context?.context) return;

  const previous = await env.MARKET_CACHE.get<MarketCyclePayload>(
    PUBLISHED_CYCLE_KEY,
    "json",
  );
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
  const fundamentalsReady =
    manifest.symbols.length === 0 ||
    (fundyManifest != null &&
      fundyShards != null &&
      manifest.symbols.every(
        (symbol) =>
          fundyManifest.symbols.includes(symbol) &&
          fundyShards.some((shard) => shard.symbols.includes(symbol)),
      ));
  if (!fundamentalsReady) return;

  const payload: MarketCyclePayload = {
    cycleAsOf: manifest.cycleAsOf,
    completedAt: [
      ...techShards.map((shard) => shard.completedAt),
      context.completedAt,
    ].sort().at(-1)!,
    publishedAt: new Date(now).toISOString(),
    nextCycleAt: new Date(hourBoundary(now) + HOUR_MS).toISOString(),
    symbols: manifest.symbols,
    quotes: Object.assign({}, ...techShards.map((shard) => shard.quotes)),
    fundamentals: Object.assign(
      {},
      previous?.fundamentals ?? {},
      ...(fundyShards?.map((shard) => shard.values) ?? []),
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
    errors: [
      ...techShards.flatMap((shard) => shard.errors),
      ...context.errors,
      ...(fundyShards?.flatMap((shard) => shard.errors) ?? []),
    ],
  };
  await env.MARKET_CACHE.put(PUBLISHED_CYCLE_KEY, JSON.stringify(payload));
}

/**
 * Deterministic minute ownership avoids mutable KV locks:
 * 00–28 technical shards, then context, then 30–58 daily fundamentals.
 * The next hour publishes only when every expected technical shard exists.
 */
export async function runScheduledMarketCycle(
  env: MarketCycleEnv,
  scheduledTime: number,
): Promise<void> {
  if (!isMarketWeek(scheduledTime)) return;
  const boundary = hourBoundary(scheduledTime);
  const minute = new Date(scheduledTime).getUTCMinutes();

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

  const missingTechnical = await firstMissingTechnicalShard(
    env,
    manifest,
    minute <= 28 ? minute : manifest.shardCount - 1,
  );
  if (missingTechnical != null) {
    await writeTechnicalShard(env, manifest, missingTechnical);
    return;
  }
  if (minute >= 29) {
    const existing = await env.MARKET_CACHE.get(
      contextKey(manifest.cycleAsOf),
    );
    if (!existing) {
      await writeContextShard(env, manifest);
      return;
    }
  }
  if (minute >= 30 && minute <= 58) {
    await writeFundamentalsShard(env, fundyManifest, minute - 30);
  }
}
