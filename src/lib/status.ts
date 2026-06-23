import type { SignalTone, StatusType } from "../types";

// Single source for alignment-status → tone. Drives both the status chip
// (StatusBadge) and the inline "Strategy Check · <status>" label so they always
// agree. Tone names map to the chip/text tone classes in index.css.
export const STATUS_TONE: Record<StatusType, SignalTone> = {
  "High Alignment": "positive",
  Aligned: "positive",
  Watch: "neutral",
  Review: "warning",
  "Risk Check": "warning",
  "Thesis Check": "warning",
};
