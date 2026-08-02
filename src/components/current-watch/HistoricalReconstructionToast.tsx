import type { HistoricalReconstructionJobSummary } from "../../lib/userStore/historicalReconstructionStore";
import { ForgeToast } from "../forge/ForgeToast";

function progressCopy(job: HistoricalReconstructionJobSummary): string {
  if (job.status === "complete") {
    return `Historical scoring complete: ${job.scoredCount} scored, ${job.unscoredCount} had no effective strategy assignment, and ${job.skippedCount} were outside the seven-day window.`;
  }
  if (job.status === "incomplete") {
    return `Historical scoring finished: ${job.scoredCount} scored and ${job.incompleteCount} record${job.incompleteCount === 1 ? "" : "s"} lacked reliable market evidence. Incomplete records remain unscored.`;
  }
  if (job.status === "failed") {
    return "Historical scoring paused after repeated processing failures. Imported transactions remain saved and unscored.";
  }
  const minutes = Math.max(
    2,
    Math.ceil((job.totalCount - job.processedCount) / 20) * 2,
  );
  return `Historical scoring: ${job.processedCount} of ${job.totalCount} reviewed · about ${minutes} minutes of processing remaining. Queue time can vary.`;
}

export function HistoricalReconstructionToast({
  job,
  onDismiss,
}: {
  job: HistoricalReconstructionJobSummary;
  onDismiss: () => void;
}) {
  const warning = job.status === "failed" || job.status === "incomplete";
  return (
    <div className="forge-toast-stack watch-schedule-toast">
      <ForgeToast tone={warning ? "warning" : "info"} onDismiss={onDismiss}>
        <p>{progressCopy(job)}</p>
      </ForgeToast>
    </div>
  );
}
