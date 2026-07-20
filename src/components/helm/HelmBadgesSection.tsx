import { useEffect, useMemo, useRef, useState } from "react";
import {
  earnedOnboardingBadgeIds,
  onboardingBadgeById,
  visibleOnboardingBadges,
  type OnboardingBadgeId,
} from "../../lib/forge/onboardingBadges";
import { useAppState } from "../../state/AppState";
import { OnboardingBadge } from "../badges/OnboardingBadge";
import { ForgeToast } from "../forge/ForgeToast";
import { HelmMetrics } from "./HelmMetrics";

const TOAST_MS = 6000;

/**
 * The Helm — onboarding milestone badges + one-shot congratulations toasts.
 * Earn state is derived; toast IDs persist in `user_state.flags.badgeToastsSeen`.
 * Metrics slot below is reserved empty for a later pass.
 */
export function HelmBadgesSection() {
  const { portfolios, strategies, flags, markBadgeToastsSeen } = useAppState();
  const [toastQueue, setToastQueue] = useState<string[]>([]);
  const prevEarnedRef = useRef<Set<string> | null>(null);

  const ctx = useMemo(
    () => ({
      portfolios,
      strategies,
      weatherReaderLayers: flags.weatherReaderLayers,
    }),
    [portfolios, strategies, flags.weatherReaderLayers],
  );
  const badges = useMemo(() => visibleOnboardingBadges(), []);
  const earnedList = useMemo(
    () => earnedOnboardingBadgeIds(ctx),
    [ctx],
  );
  const earnedIds = useMemo(() => new Set(earnedList), [earnedList]);
  const toasted = useMemo(
    () => new Set(flags.badgeToastsSeen ?? []),
    [flags.badgeToastsSeen],
  );

  useEffect(() => {
    const earnedSet = new Set<string>(earnedList);

    if (prevEarnedRef.current === null) {
      // Hydrate: silent-backfill already-earned milestones (no toast flood).
      prevEarnedRef.current = earnedSet;
      const silent = earnedList.filter((id) => !toasted.has(id));
      if (silent.length > 0) markBadgeToastsSeen(silent);
      return;
    }

    const newly = earnedList.filter(
      (id) => !prevEarnedRef.current!.has(id) && !toasted.has(id),
    ) as OnboardingBadgeId[];
    prevEarnedRef.current = earnedSet;

    if (newly.length === 0) return;

    markBadgeToastsSeen(newly);
    const messages = newly
      .map((id) => onboardingBadgeById(id)?.congratulate)
      .filter((msg): msg is string => Boolean(msg));
    if (messages.length > 0) {
      setToastQueue((current) => [...current, ...messages]);
    }
  }, [earnedList, toasted, markBadgeToastsSeen]);

  useEffect(() => {
    if (toastQueue.length === 0) return;
    const timer = window.setTimeout(() => {
      setToastQueue((current) => current.slice(1));
    }, TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [toastQueue]);

  const activeToast = toastQueue[0] ?? null;

  return (
    <div className="helm-badges-block">
      {activeToast ? (
        <div className="helm-badge-toast-slot">
          <ForgeToast
            tone="success"
            onDismiss={() => setToastQueue((current) => current.slice(1))}
          >
            {activeToast}
          </ForgeToast>
        </div>
      ) : null}
      <section className="helm-badges" aria-labelledby="helm-badges-title">
        <div className="forge-section-head">
          <h3 id="helm-badges-title" className="forge-section-title">
            Badge Collection
          </h3>
        </div>
        <div className="helm-badges-row">
          {badges.map((badge) => (
            <OnboardingBadge
              key={badge.id}
              badge={badge}
              earned={earnedIds.has(badge.id)}
            />
          ))}
        </div>
      </section>
      <div className="helm-metrics-slot">
        <HelmMetrics />
      </div>
    </div>
  );
}
