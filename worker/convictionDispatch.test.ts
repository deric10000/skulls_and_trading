import { describe, expect, it, vi } from "vitest";
import {
  dispatchConvictionCycle,
  isConvictionCycleReference,
  type ConvictionCycleReference,
} from "./convictionDispatch";

const reference: ConvictionCycleReference = {
  version: 1,
  cycleKey: "market:cycle:complete:2026-07-27T200000000Z",
  cycleAsOf: "2026-07-27T20:00:00.000Z",
};

describe("conviction cycle dispatch", () => {
  it("accepts only immutable complete-cycle references", () => {
    expect(isConvictionCycleReference(reference)).toBe(true);
    expect(
      isConvictionCycleReference({
        ...reference,
        cycleKey: "market:cycle:published",
      }),
    ).toBe(false);
  });

  it("dispatches the same reference unchanged for idempotent retries", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('{"ok":true}', { status: 200 }),
    );
    const env = {
      SUPABASE_CONVICTION_FUNCTION_URL:
        "https://example.supabase.co/functions/v1/process-conviction-cycle",
      INTERNAL_SCORING_SECRET: "test-secret",
    };

    await dispatchConvictionCycle(reference, env, fetcher);
    await dispatchConvictionCycle(reference, env, fetcher);

    expect(fetcher).toHaveBeenCalledTimes(2);
    for (const call of fetcher.mock.calls) {
      expect(JSON.parse(String(call[1]?.body))).toEqual(reference);
    }
  });

  it("fails closed so the queue can retry", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("unavailable", { status: 503 }),
    );
    await expect(
      dispatchConvictionCycle(
        reference,
        {
          SUPABASE_CONVICTION_FUNCTION_URL: "https://example.test/function",
          INTERNAL_SCORING_SECRET: "test-secret",
        },
        fetcher,
      ),
    ).rejects.toThrow("503");
  });
});
