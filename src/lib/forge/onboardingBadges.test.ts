import { describe, expect, it } from "vitest";
import type { Portfolio, Strategy } from "../../types";
import {
  earnedOnboardingBadgeIds,
  STARTER_ONBOARDING_BADGE_IDS,
  visibleOnboardingBadges,
  type OnboardingBadgeContext,
} from "./onboardingBadges";

function portfolio(partial: Partial<Portfolio> & Pick<Portfolio, "id" | "type">): Portfolio {
  return {
    name: partial.name ?? partial.id,
    holdings: partial.holdings ?? [],
    ...partial,
  };
}

function strategy(
  partial: Partial<Strategy> & Pick<Strategy, "id" | "name">,
): Strategy {
  return {
    isDefault: false,
    appliedPortfolioIds: [],
    ...partial,
  } as Strategy;
}

function fullStarterCtx(): OnboardingBadgeContext {
  return {
    portfolios: [
      portfolio({ id: "p1", type: "portfolio" }),
      portfolio({ id: "w1", type: "watchlist" }),
    ],
    strategies: [
      strategy({
        id: "s1",
        name: "Custom",
        isDefault: false,
        appliedPortfolioIds: ["p1"],
      }),
    ],
    weatherReaderLayers: ["market", "sector", "industry", "stock"],
  };
}

describe("onboarding complete badge", () => {
  it("lists Onboarding Complete after the five starters", () => {
    const visible = visibleOnboardingBadges().map((b) => b.id);
    expect(visible.slice(0, 5)).toEqual([...STARTER_ONBOARDING_BADGE_IDS]);
    expect(visible[5]).toBe("onboarding-complete");
  });

  it("stays locked until every starter is earned", () => {
    const partial = fullStarterCtx();
    partial.weatherReaderLayers = ["market"];
    expect(earnedOnboardingBadgeIds(partial)).not.toContain(
      "onboarding-complete",
    );
  });

  it("earns when all five starters are collected", () => {
    expect(earnedOnboardingBadgeIds(fullStarterCtx())).toEqual([
      ...STARTER_ONBOARDING_BADGE_IDS,
      "onboarding-complete",
    ]);
  });
});
