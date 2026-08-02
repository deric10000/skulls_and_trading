/**
 * Shared Current Watch review/commit event order.
 *
 * Server `commit_current_watch_edit` replays by `filledAt`, then array ordinal.
 * On equal timestamps, cash must precede qty so a same-second deposit funds
 * buys (new portfolio / first funding). Keep review stamps and the emitted
 * transaction array on this order or the RPC raises invalid_*_math.
 */
export function compareCurrentWatchTimelineEvents(
  left: { filledAt: string; kind: "qty" | "cash" },
  right: { filledAt: string; kind: "qty" | "cash" },
): number {
  const byTime = Date.parse(left.filledAt) - Date.parse(right.filledAt);
  if (byTime !== 0) return byTime;
  if (left.kind === right.kind) return 0;
  return left.kind === "cash" ? -1 : 1;
}
