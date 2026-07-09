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

/** Inline conviction-row label — icon + sentence-case status (watch-conviction-box). */
export function WatchAlignLabel({ status }: { status: StatusType }) {
  const Icon = STATUS_ICON[status];
  return (
    <span className={`watch-align watch-align--${STATUS_TONE[status]}`}>
      <Icon aria-hidden />
      {status}
    </span>
  );
}

/** Ticker conviction row — label left, primary right, secondaries under label. */
export function WatchConvictionHead({
  resolved,
  fallbackStatus,
}: {
  resolved?: ResolvedStatus;
  fallbackStatus: StatusType;
}) {
  const primary = resolved?.primary ?? fallbackStatus;
  const secondary =
    resolved?.categoryFlags.filter((flag) => flag !== primary) ?? [];

  return (
    <div className="watch-conviction-head">
      <div className="watch-conviction-head-row">
        <span className="watch-field-label">Strategy Conviction</span>
        <WatchAlignLabel status={primary} />
      </div>
      {secondary.length > 0 ? (
        <span
          className="watch-align-flags watch-conviction-head-flags"
          aria-label="Category diagnostics"
        >
          {secondary.map((flag) => (
            <WatchAlignLabel key={flag} status={flag} />
          ))}
        </span>
      ) : null}
    </div>
  );
}

/** Primary inline label + secondary inline labels (non-conviction-box contexts). */
export function WatchAlignStack({
  resolved,
  fallbackStatus,
}: {
  resolved?: ResolvedStatus;
  fallbackStatus: StatusType;
}) {
  const primary = resolved?.primary ?? fallbackStatus;
  const secondary =
    resolved?.categoryFlags.filter((flag) => flag !== primary) ?? [];

  return (
    <span className="watch-align-stack">
      <WatchAlignLabel status={primary} />
      {secondary.length > 0 ? (
        <span className="watch-align-flags" aria-label="Category diagnostics">
          {secondary.map((flag) => (
            <WatchAlignLabel key={flag} status={flag} />
          ))}
        </span>
      ) : null}
    </span>
  );
}
