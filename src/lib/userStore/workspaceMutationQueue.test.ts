import { describe, expect, it } from "vitest";
import { serializeWorkspaceMutation } from "./workspaceMutationQueue";

describe("serializeWorkspaceMutation", () => {
  it("does not let a later portfolio mutation pass an older workspace write", async () => {
    const events: string[] = [];
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const userId = "queue-order-user";

    const first = serializeWorkspaceMutation(userId, async () => {
      events.push("save:start");
      await firstGate;
      events.push("save:end");
    });
    const second = serializeWorkspaceMutation(userId, async () => {
      events.push("rpc:start");
      return 2;
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(events).toEqual(["save:start"]);
    releaseFirst();
    await expect(second).resolves.toBe(2);
    await first;
    expect(events).toEqual(["save:start", "save:end", "rpc:start"]);
  });

  it("continues after a failed mutation without hiding that failure", async () => {
    const userId = "queue-failure-user";
    const failed = serializeWorkspaceMutation(userId, async () => {
      throw new Error("write failed");
    });
    const recovered = serializeWorkspaceMutation(userId, async () => "ready");

    await expect(failed).rejects.toThrow("write failed");
    await expect(recovered).resolves.toBe("ready");
  });
});
