import type { StatusType } from "../types";

const STATUS_TONE: Record<StatusType, string> = {
  Aligned: "status--positive",
  Watch: "status--neutral",
  Review: "status--warning",
  "Rule Check": "status--warning",
  "Risk Check": "status--warning",
  "Thesis Needed": "status--warning",
  "Trim Review": "status--warning",
  "Exit Review": "status--negative",
};

export function StatusBadge({ status }: { status: StatusType }) {
  return <span className={`chip ${STATUS_TONE[status]}`}>{status}</span>;
}
