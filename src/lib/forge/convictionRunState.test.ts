import { describe, expect, it } from "vitest";
import {
  canonicalStrategyIds,
  categorizeRunError,
  isSnapshotEligibleRunStatus,
  presentConvictionRun,
} from "./convictionRunState";

describe("convictionRunState", () => {
  it("keeps Score Pending only for pending-like states", () => {
    const scheduled = presentConvictionRun({
      dbStatus: "pending",
      scoreReady: false,
    });
    expect(scheduled.isPendingLike).toBe(true);
    expect(scheduled.label).toContain("Pending");

    const failed = presentConvictionRun({
      dbStatus: "failed",
      attemptCount: 5,
      error: "retry_exhausted",
      scoreReady: false,
    });
    expect(failed.isPendingLike).toBe(false);
    expect(failed.state).toBe("failed");
    expect(failed.label.toLowerCase()).toContain("failed");
  });

  it("maps missing-symbol failures to waiting_for_data before retry exhaustion", () => {
    const waiting = presentConvictionRun({
      dbStatus: "failed",
      attemptCount: 1,
      error: "cycle_missing_symbol:CRWV,CELH",
      scoreReady: false,
      affectedTickers: ["CRWV", "CELH"],
    });
    expect(waiting.state).toBe("waiting_for_data");
    expect(waiting.isPendingLike).toBe(true);
  });

  it("only allows complete runs into snapshots", () => {
    expect(isSnapshotEligibleRunStatus("complete")).toBe(true);
    expect(isSnapshotEligibleRunStatus("failed")).toBe(false);
    expect(isSnapshotEligibleRunStatus("superseded")).toBe(false);
    expect(isSnapshotEligibleRunStatus("waiting_for_data")).toBe(false);
  });

  it("canonicalizes strategy ids for combined-result identity", () => {
    expect(canonicalStrategyIds(["b", "a", "a"])).toEqual(["a", "b"]);
    expect(categorizeRunError("dispatch failed")).toBe("dispatch_failed");
  });
});
