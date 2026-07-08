import { STATUS_ICON } from "../lib/icons";
import { STATUS_TONE } from "../lib/status";
import type { ResolvedStatus, StatusType } from "../types";

export function StatusBadge({ status }: { status: StatusType }) {
  const Icon = STATUS_ICON[status];
  return (
    <span className={`chip status--${STATUS_TONE[status]}`}>
      <Icon aria-hidden />
      {status}
    </span>
  );
}

export function StatusStack({ resolved }: { resolved: ResolvedStatus }) {
  const secondary = resolved.categoryFlags.filter(
    (flag) => flag !== resolved.primary,
  );

  return (
    <div className="status-stack">
      <StatusBadge status={resolved.primary} />
      {secondary.length > 0 ? (
        <div className="status-flags" aria-label="Category diagnostics">
          {secondary.map((flag) => (
            <StatusBadge key={flag} status={flag} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
