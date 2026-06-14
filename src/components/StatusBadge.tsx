import type { StatusType } from "../types";

const STATUS_TONE: Record<StatusType, string> = {
  Bullish: "status--positive",
  Breakout: "status--positive",
  Watching: "status--neutral",
  Caution: "status--warning",
  Pullback: "status--negative",
  Bearish: "status--negative",
};

export function StatusBadge({ status }: { status: StatusType }) {
  return <span className={`chip ${STATUS_TONE[status]}`}>{status}</span>;
}
