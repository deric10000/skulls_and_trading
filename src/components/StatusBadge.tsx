import { STATUS_ICON } from "../lib/icons";
import { STATUS_TONE } from "../lib/status";
import type { StatusType } from "../types";

export function StatusBadge({ status }: { status: StatusType }) {
  const Icon = STATUS_ICON[status];
  return (
    <span className={`chip status--${STATUS_TONE[status]}`}>
      <Icon aria-hidden />
      {status}
    </span>
  );
}
