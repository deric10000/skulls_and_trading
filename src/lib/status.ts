import type { SignalTone, StatusType } from "../types";

// Single source for alignment-status → tone. Drives the status chip
// (StatusBadge / StatusStack — portfolio snapshot only), the inline
// watch-align labels (WatchAlignLabel / WatchAlignStack — ticker rows), so they
// always agree. Tone names map to the chip/text tone classes in index.css.
export const STATUS_TONE: Record<StatusType, SignalTone> = {
  "High Alignment": "positive",
  Aligned: "positive",
  Watch: "neutral",
  Review: "warning",
  "Watch Setup": "neutral",
  "Hold Plan": "neutral",
  "Trim Review": "warning",
  "Exit Review": "warning",
  "Review Risk": "warning",
  "Risk Drift": "warning",
  "Risk Check": "warning",
  "Thesis Check": "warning",
  "Rule Conflict": "negative",
  "Rule Break": "negative",
  "Concentration Review": "warning",
  "Patience Review": "warning",
};
