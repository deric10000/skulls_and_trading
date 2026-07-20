import type { OnboardingBadgeDef } from "../../lib/forge/onboardingBadges";
import { useIsMobile } from "../../lib/useIsMobile";
import { Tooltip } from "../Tooltip";

/**
 * Compact milestone badge (icon-btn family, larger). Earned = full look;
 * incomplete = muted but still hoverable (not HTML-disabled). Desktop/tablet:
 * stock Tooltip on hover. Mobile: no tooltip; click inert until destinations ship.
 */
export function OnboardingBadge({
  badge,
  earned,
}: {
  badge: OnboardingBadgeDef;
  earned: boolean;
}) {
  const isMobile = useIsMobile();
  const Icon = badge.icon;
  const tipBody = earned
    ? badge.description
    : `Not earned yet — ${badge.description}`;

  const control = (
    <button
      type="button"
      className={
        earned
          ? "onboarding-badge"
          : "onboarding-badge onboarding-badge--incomplete"
      }
      aria-label={badge.name}
      aria-disabled={!earned || undefined}
    >
      <Icon aria-hidden weight={earned ? "fill" : "regular"} />
    </button>
  );

  if (isMobile) {
    return (
      <span className="onboarding-badge-wrap">
        {control}
      </span>
    );
  }

  return (
    <Tooltip title={badge.name} body={tipBody}>
      <span className="onboarding-badge-wrap">{control}</span>
    </Tooltip>
  );
}
