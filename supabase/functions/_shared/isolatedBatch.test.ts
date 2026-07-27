import { describe, expect, it, vi } from "vitest";
import { runIsolatedBatch } from "./isolatedBatch";

describe("isolated Edge scoring batches", () => {
  it("does not let one user's failure block later users", async () => {
    const processed: string[] = [];
    const failures: string[] = [];
    const users = Array.from({ length: 20 }, (_, index) => `user-${index}`);

    const outcomes = await runIsolatedBatch(
      users,
      4,
      async (user) => {
        if (user === "user-3") throw new Error("synthetic workspace failure");
        processed.push(user);
      },
      async (user) => {
        failures.push(user);
      },
    );

    expect(processed).toHaveLength(19);
    expect(processed).toContain("user-19");
    expect(failures).toEqual(["user-3"]);
    expect(outcomes.filter((outcome) => outcome.ok)).toHaveLength(19);
    expect(outcomes.find((outcome) => outcome.item === "user-3")).toMatchObject({
      ok: false,
      error: "synthetic workspace failure",
    });
  });

  it("records failure-write errors without rejecting the whole batch", async () => {
    const afterFailure = vi.fn();
    const outcomes = await runIsolatedBatch(
      ["bad", "good"],
      1,
      async (value) => {
        if (value === "bad") throw new Error("score failed");
        afterFailure();
      },
      async () => {
        throw new Error("fail RPC failed");
      },
    );
    expect(afterFailure).toHaveBeenCalledOnce();
    expect(outcomes[0]).toMatchObject({
      ok: false,
      error: "score failed; failure write: fail RPC failed",
    });
    expect(outcomes[1]?.ok).toBe(true);
  });
});
