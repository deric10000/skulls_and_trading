import { Warning } from "../lib/icons";
import { Tooltip } from "./Tooltip";

/** Layer 3 critical-gap flag — never invent a value; mark for review. */
export function NeedsDataReviewFlag({
  label = "null",
}: {
  label?: string;
}) {
  return (
    <Tooltip body="Needs Data Review.">
      <span className="needs-data-review" role="status">
        <Warning className="needs-data-review-icon" weight="fill" aria-hidden />
        <span className="needs-data-review-label">{label}</span>
      </span>
    </Tooltip>
  );
}
