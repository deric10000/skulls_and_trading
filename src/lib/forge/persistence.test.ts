import { describe, expect, it, vi } from "vitest";
import { debounce } from "./persistence";

describe("debounce", () => {
  it("flushes the latest pending workspace snapshot before Edit Mode pauses", () => {
    vi.useFakeTimers();
    const save = vi.fn<(value: string) => void>();
    const debounced = debounce(save, 500);

    debounced("older");
    debounced("latest");
    debounced.flush();
    vi.advanceTimersByTime(500);

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith("latest");
    vi.useRealTimers();
  });
});
