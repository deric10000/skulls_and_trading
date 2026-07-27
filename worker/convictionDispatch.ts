export const COMPLETE_CYCLE_PREFIX = "market:cycle:complete:";

export interface ConvictionCycleReference {
  version: 1;
  cycleKey: string;
  cycleAsOf: string;
}

export interface ConvictionDispatchEnv {
  SUPABASE_CONVICTION_FUNCTION_URL?: string;
  INTERNAL_SCORING_SECRET?: string;
}

export function isConvictionCycleReference(
  value: unknown,
): value is ConvictionCycleReference {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ConvictionCycleReference>;
  return (
    candidate.version === 1 &&
    typeof candidate.cycleKey === "string" &&
    candidate.cycleKey.startsWith(COMPLETE_CYCLE_PREFIX) &&
    typeof candidate.cycleAsOf === "string" &&
    !Number.isNaN(Date.parse(candidate.cycleAsOf))
  );
}

export async function dispatchConvictionCycle(
  reference: ConvictionCycleReference,
  env: ConvictionDispatchEnv,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  if (
    !env.SUPABASE_CONVICTION_FUNCTION_URL ||
    !env.INTERNAL_SCORING_SECRET
  ) {
    throw new Error("Conviction scoring dispatch is not configured");
  }

  const response = await fetcher(env.SUPABASE_CONVICTION_FUNCTION_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-internal-scoring-secret": env.INTERNAL_SCORING_SECRET,
    },
    body: JSON.stringify(reference),
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(
      `Conviction scoring dispatch failed (${response.status}): ${detail}`,
    );
  }
}

export async function readInternalCycle(
  request: Request,
  cache: KVNamespace,
  secret: string | undefined,
): Promise<Response> {
  const supplied = request.headers.get("x-internal-scoring-secret") ?? "";
  if (!secret || !(await secretEqual(supplied, secret))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const requested = url.searchParams.get("key");
  const key =
    requested && requested.startsWith(COMPLETE_CYCLE_PREFIX)
      ? requested
      : await cache.get("market:cycle:published:key");
  if (!key) {
    return Response.json({ cycle: null, state: "warming" }, { status: 404 });
  }

  const cycle = await cache.get(key);
  if (!cycle) {
    return Response.json({ cycle: null, state: "expired" }, { status: 404 });
  }
  return new Response(cycle, {
    headers: {
      "content-type": "application/json",
      "cache-control": "private, no-store",
    },
  });
}

async function secretEqual(left: string, right: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right)),
  ]);
  const a = new Uint8Array(leftHash);
  const b = new Uint8Array(rightHash);
  let mismatch = a.length ^ b.length;
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    mismatch |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }
  return mismatch === 0;
}
