import { Info, STATUS_ICON } from "../lib/icons";
import {
  GO_TO_CASH_SICADFU,
  STATUS_TONE,
  statusChipLabel,
} from "../lib/status";
import { formatDecimals } from "../lib/format";
import type { ResolvedStatus, StatusType } from "../types";
import { InfoTip, Tooltip } from "./Tooltip";

export const CONVICTION_NO_SCORE_TIP =
  "Scoring conviction based on strategy cadence. The next check will fill this in.";

export function StatusBadge({ status }: { status: StatusType }) {
  const Icon = STATUS_ICON[status];
  return (
    <span className={`chip status--${STATUS_TONE[status]}`}>
      <Icon aria-hidden />
      {statusChipLabel(status)}
      {status === "Go to Cash" ? (
        <InfoTip
          label="What SICADFU means"
          title="SICADFU"
          body={GO_TO_CASH_SICADFU}
        />
      ) : null}
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
  hideStatuses = false,
}: {
  resolved?: ResolvedStatus;
  fallbackStatus: StatusType;
  /** When true, only the "Strategy Conviction" label shows (detail view
      already lists statuses in the plan block below the meter). */
  hideStatuses?: boolean;
}) {
  const primary = resolved?.primary ?? fallbackStatus;
  const secondary =
    resolved?.categoryFlags.filter((flag) => flag !== primary) ?? [];

  return (
    <div className="watch-conviction-head">
      <div className="watch-conviction-head-row">
        <span className="watch-field-label">Strategy Conviction</span>
        {hideStatuses ? null : <WatchAlignLabel status={primary} />}
      </div>
      {!hideStatuses && secondary.length > 0 ? (
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

/** Meter + score, or pending cadence check (stock Tooltip + Info icon). */
export function WatchConvictionMeter({
  conviction,
  scoreReady,
}: {
  conviction: number;
  scoreReady: boolean;
}) {
  if (!scoreReady) {
    return (
      <Tooltip title="Score pending next check" body={CONVICTION_NO_SCORE_TIP}>
        <span
          className="watch-conviction-meter watch-conviction-meter--pending"
          tabIndex={0}
        >
          <span className="watch-conviction-score watch-conviction-score--pending">
            <Info aria-hidden weight="regular" />
            Score Pending Next Check
          </span>
        </span>
      </Tooltip>
    );
  }
  return (
    <span className="watch-conviction-meter">
      <span className="watch-conviction-track">
        <span
          className="watch-conviction-fill"
          style={{ width: `${conviction}%` }}
        />
      </span>
      <span className="watch-conviction-score">
        {formatDecimals(conviction)}
      </span>
    </span>
  );
}
