/**
 * Persist tickers that failed GICS sector/industry mapping so we can normalize
 * Yahoo → taxonomy aliases later. Upserts hit_count / last_seen_at.
 */

import { getSupabase } from "../auth/supabaseClient";

export type TaxonomyGapReason = "missing_provider" | "unmapped_yahoo";

/** Session dedupe so one missing ticker does not spam writes every render. */
const reportedThisSession = new Set<string>();

export async function reportTaxonomyGap(input: {
  ticker: string;
  reason: TaxonomyGapReason;
  yahooSector?: string | null;
  yahooIndustry?: string | null;
}): Promise<void> {
  const ticker = input.ticker.trim().toUpperCase();
  if (!ticker) return;
  const dedupeKey = `${ticker}|${input.reason}`;
  if (reportedThisSession.has(dedupeKey)) return;
  reportedThisSession.add(dedupeKey);

  try {
    const supabase = getSupabase();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;

    const { data: existing, error: selectError } = await supabase
      .from("taxonomy_gap_events")
      .select("id, hit_count")
      .eq("ticker", ticker)
      .eq("reason", input.reason)
      .maybeSingle();

    if (selectError) {
      console.warn("taxonomy_gap_events select failed", selectError.message);
      return;
    }

    if (existing?.id != null) {
      const { error } = await supabase
        .from("taxonomy_gap_events")
        .update({
          last_seen_at: new Date().toISOString(),
          hit_count: Number(existing.hit_count ?? 1) + 1,
          yahoo_sector: input.yahooSector ?? null,
          yahoo_industry: input.yahooIndustry ?? null,
        })
        .eq("id", existing.id);
      if (error) {
        console.warn("taxonomy_gap_events update failed", error.message);
      }
      return;
    }

    const { error } = await supabase.from("taxonomy_gap_events").insert({
      ticker,
      reason: input.reason,
      yahoo_sector: input.yahooSector ?? null,
      yahoo_industry: input.yahooIndustry ?? null,
    });
    if (error) {
      console.warn("taxonomy_gap_events insert failed", error.message);
    }
  } catch (err) {
    console.warn("taxonomy_gap_events write failed", err);
  }
}

/** Test helper — clear session dedupe. */
export function resetTaxonomyGapSessionDedupe(): void {
  reportedThisSession.clear();
}
