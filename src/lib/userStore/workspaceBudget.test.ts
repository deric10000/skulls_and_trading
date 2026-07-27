import { describe, expect, it } from "vitest";
import {
  emptyWorkspace,
  workspacePayloadBytes,
  WORKSPACE_PAYLOAD_BUDGET_BYTES,
} from "./index";

describe("workspace payload budget", () => {
  it("keeps a seeded workspace well below the persistence ceiling", () => {
    expect(workspacePayloadBytes(emptyWorkspace())).toBeLessThan(
      WORKSPACE_PAYLOAD_BUDGET_BYTES,
    );
  });
});

