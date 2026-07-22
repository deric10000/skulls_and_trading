import type { OnboardingBadgeDef } from "../../lib/forge/onboardingBadges";
import { Tooltip } from "../Tooltip";

/**
 * Compact milestone badge (icon-btn family, larger). Earned = full look;
 * incomplete = muted but still hoverable/tappable (not HTML-disabled).
 * Stock Tooltip: desktop/tablet hover+focus; mobile tap-to-toggle sheet.
 */
export function OnboardingBadge({
  badge,
  earned,
}: {
  badge: OnboardingBadgeDef;
  earned: boolean;
}) {
  const Icon = badge.icon;
  const tipBody = earned
    ? badge.description
    : `Not earned yet — ${badge.description}`;

  return (
    <Tooltip title={badge.name} body={tipBody}>
      <span className="onboarding-badge-wrap">
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
      </span>
    </Tooltip>
  );
}
