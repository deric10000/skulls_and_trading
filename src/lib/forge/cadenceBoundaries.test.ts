import { describe, expect, it } from "vitest";
import type { CheckInterval } from "../../types";
import {
  getEtCalendarParts,
  latestCadenceBoundaryMs,
  nextCadenceBoundaryMs,
  SESSION_CLOSE_ET_MINUTES,
} from "./cadenceBoundaries";
import {
  boundaryForInterval,
  nextCheckAt,
  overdueCheckAt,
} from "./scheduler";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

function isLegacyBoundary(interval: CheckInterval, atMs: number): boolean {
  if (interval === "1h") return atMs % HOUR_MS === 0;
  const parts = getEtCalendarParts(new Date(atMs));
  const mins = parts.hour * 60 + parts.minute;
  if (interval.startsWith("close-")) {
    return (
      parts.weekday !== 0 &&
      parts.weekday !== 6 &&
      mins ===
        SESSION_CLOSE_ET_MINUTES[
          interval as keyof typeof SESSION_CLOSE_ET_MINUTES
        ]
    );
  }
  if (interval === "2h" || interval === "4h") {
    const hours = interval === "2h" ? 2 : 4;
    return parts.minute === 0 && parts.hour % hours === 0;
  }
  if (interval === "1D") {
    return parts.weekday !== 0 && parts.weekday !== 6 && mins === 16 * 60;
  }
  if (interval === "1W") return parts.weekday === 5 && mins === 16 * 60;
  return false;
}

function legacyMinuteWalk(interval: CheckInterval, fromMs: number): number {
  let candidate = Math.floor(fromMs / MINUTE_MS) * MINUTE_MS + MINUTE_MS;
  const limit = fromMs + 8 * 24 * HOUR_MS;
  while (candidate <= limit) {
    if (isLegacyBoundary(interval, candidate)) return candidate;
    candidate += MINUTE_MS;
  }
  throw new Error(`Reference walk did not find ${interval}`);
}

describe("bounded cadence boundary arithmetic", () => {
  it("matches the former minute walk for representative cadence walls", () => {
    const fixtures: Array<[CheckInterval, string]> = [
      ["1h", "2026-07-21T20:28:17.000Z"],
      ["2h", "2026-07-21T20:28:17.000Z"],
      ["4h", "2026-07-21T20:28:17.000Z"],
      ["1D", "2026-07-24T21:10:00.000Z"],
      ["1W", "2026-07-21T20:28:17.000Z"],
      ["close-premarket", "2026-07-21T12:00:00.000Z"],
      ["close-regular", "2026-07-24T21:10:00.000Z"],
      ["close-afterhours", "2026-07-21T20:28:17.000Z"],
      ["close-overnight", "2026-07-21T06:00:00.000Z"],
    ];
    for (const [interval, from] of fixtures) {
      const fromMs = Date.parse(from);
      expect(nextCadenceBoundaryMs(interval, fromMs)).toBe(
        legacyMinuteWalk(interval, fromMs),
      );
    }
  });

  it("skips the nonexistent 2am wall at the spring DST transition", () => {
    // 01:30 EST -> next real even ET wall is 04:00 EDT.
    expect(
      new Date(
        nextCadenceBoundaryMs("2h", Date.parse("2026-03-08T06:30:00.000Z")),
      ).toISOString(),
    ).toBe("2026-03-08T08:00:00.000Z");
    // At 03:30 EDT, the latest real even ET wall is 00:00 EST.
    expect(
      new Date(
        latestCadenceBoundaryMs("2h", Date.parse("2026-03-08T07:30:00.000Z")),
      ).toISOString(),
    ).toBe("2026-03-08T05:00:00.000Z");
  });

  it("keeps ET walls stable through fall DST and weekends", () => {
    // 00:30 EDT on fall-back Sunday -> 04:00 EST.
    expect(
      new Date(
        nextCadenceBoundaryMs("4h", Date.parse("2026-11-01T04:30:00.000Z")),
      ).toISOString(),
    ).toBe("2026-11-01T09:00:00.000Z");
    // Friday close before spring-forward -> Monday close after it.
    expect(
      new Date(
        nextCadenceBoundaryMs("1D", Date.parse("2026-03-06T21:00:00.000Z")),
      ).toISOString(),
    ).toBe("2026-03-09T20:00:00.000Z");
  });

  it("uses the final weekday close for month boundaries", () => {
    expect(
      new Date(
        nextCadenceBoundaryMs("1M", Date.parse("2026-01-01T00:00:00.000Z")),
      ).toISOString(),
    ).toBe("2026-01-30T21:00:00.000Z");
    expect(
      boundaryForInterval("1M", "2026-03-02T15:00:00.000Z"),
    ).toBe("2026-02-27T21:00:00.000Z");
  });

  it("jumps directly across stale histories without catch-up caps", () => {
    const nowMs = Date.parse("2026-07-27T21:17:00.000Z");
    expect(nextCheckAt("1h", "2020-01-01T00:00:00.000Z", nowMs)).toBe(
      "2026-07-27T22:00:00.000Z",
    );
    expect(overdueCheckAt("1h", "2020-01-01T00:00:00.000Z", nowMs)).toBe(
      "2026-07-27T21:00:00.000Z",
    );
    expect(overdueCheckAt("1M", "2020-01-01T00:00:00.000Z", nowMs)).toBe(
      "2026-06-30T20:00:00.000Z",
    );
  });
});
