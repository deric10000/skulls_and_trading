import { describe, expect, it } from "vitest";
import { isMarketPullOpen, nextMarketPullAt } from "./marketPullWindow";

/** Format helper — asserts the ET wall clock of an ISO instant. */
function etLabel(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
}

describe("marketPullWindow", () => {
  it("opens Sunday overnight and closes Friday after-hours", () => {
    // Sun 2026-08-02 19:59 ET (EDT = UTC-4)
    expect(isMarketPullOpen(Date.parse("2026-08-02T23:59:00.000Z"))).toBe(
      false,
    );
    // Sun 20:00 ET
    expect(isMarketPullOpen(Date.parse("2026-08-03T00:00:00.000Z"))).toBe(
      true,
    );
    // Fri 20:00 ET (EDT)
    expect(isMarketPullOpen(Date.parse("2026-08-01T00:00:00.000Z"))).toBe(
      true,
    );
    // Fri 20:01 ET → 2026-08-01T00:01Z
    expect(isMarketPullOpen(Date.parse("2026-08-01T00:01:00.000Z"))).toBe(
      false,
    );
    // Saturday midday ET
    expect(isMarketPullOpen(Date.parse("2026-08-01T16:00:00.000Z"))).toBe(
      false,
    );
  });

  it("maps closed windows to the next Sunday 20:00 ET pull", () => {
    // Fri after close
    expect(etLabel(nextMarketPullAt(Date.parse("2026-08-01T00:30:00.000Z")))).toBe(
      "Sun 20:00",
    );
    // Saturday
    expect(etLabel(nextMarketPullAt(Date.parse("2026-08-01T16:00:00.000Z")))).toBe(
      "Sun 20:00",
    );
    // Sunday afternoon
    expect(etLabel(nextMarketPullAt(Date.parse("2026-08-02T19:00:00.000Z")))).toBe(
      "Sun 20:00",
    );
  });

  it("uses the next UTC hour while the pull window is open", () => {
    // Mon 10:20 ET = 14:20 UTC → next hour 15:00 UTC
    expect(nextMarketPullAt(Date.parse("2026-08-03T14:20:00.000Z"))).toBe(
      "2026-08-03T15:00:00.000Z",
    );
  });

  it("maps Friday close edge to Sunday overnight without an hourly fallback", () => {
    // Fri 20:00 ET — still open for this minute; next hour is closed → Sun 20:00
    expect(nextMarketPullAt(Date.parse("2026-08-01T00:00:00.000Z"))).toBe(
      "2026-08-03T00:00:00.000Z",
    );
  });
});
