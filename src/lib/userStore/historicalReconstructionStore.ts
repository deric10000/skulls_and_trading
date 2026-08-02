import { getSupabase } from "../auth/supabaseClient";

export interface HistoricalReconstructionJobSummary {
  id: string;
  portfolioId: string;
  status: "queued" | "running" | "retrying" | "complete" | "incomplete" | "superseded" | "failed";
  totalCount: number;
  processedCount: number;
  scoredCount: number;
  unscoredCount: number;
  incompleteCount: number;
  skippedCount: number;
}

export async function loadLatestHistoricalReconstructionJob(
  portfolioId: string,
): Promise<HistoricalReconstructionJobSummary | null> {
  const { data, error } = await getSupabase()
    .from("historical_reconstruction_jobs")
    .select("id,portfolio_id,status,total_count,processed_count,scored_count,unscored_count,incomplete_count,skipped_count")
    .eq("portfolio_id", portfolioId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) {
    if (error && error.code !== "42P01") {
      console.warn("historical reconstruction status fetch failed", error.message);
    }
    return null;
  }
  return {
    id: data.id,
    portfolioId: data.portfolio_id,
    status: data.status,
    totalCount: data.total_count,
    processedCount: data.processed_count,
    scoredCount: data.scored_count,
    unscoredCount: data.unscored_count,
    incompleteCount: data.incomplete_count,
    skippedCount: data.skipped_count,
  } as HistoricalReconstructionJobSummary;
}
