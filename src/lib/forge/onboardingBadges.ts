import type { Icon } from "../icons";
import {
  Briefcase,
  ChartBar,
  Hammer,
  ListBullets,
  MapTrifold,
  Strategy,
  UserCircle,
  Waves,
} from "../icons";
import type { Portfolio, Strategy as StrategyModel } from "../../types";
import type { UserFlags } from "../userStore";

/**
 * Helm onboarding milestone badges. Earn state is derived from live workspace
 * data (+ persisted weather-layer visits); congratulations toasts are one-shot
 * via `UserFlags.badgeToastsSeen`. Entries flagged `underConstruction` stay
 * hidden until that surface ships.
 */

export type OnboardingBadgeId =
  | "first-portfolio"
  | "first-watchlist"
  | "first-strategy-applied"
  | "first-custom-strategy"
  | "weather-reader"
  | "onboarding-complete"
  | "first-dashboard"
  | "first-captain-profile";

/** The five starter milestones — Onboarding Complete unlocks when all are earned. */
export const STARTER_ONBOARDING_BADGE_IDS: readonly OnboardingBadgeId[] = [
  "first-portfolio",
  "first-watchlist",
  "first-strategy-applied",
  "first-custom-strategy",
  "weather-reader",
] as const;

export type WeatherReaderLayer = "market" | "sector" | "industry" | "stock";

export const WEATHER_READER_LAYERS: WeatherReaderLayer[] = [
  "market",
  "sector",
  "industry",
  "stock",
];

export interface OnboardingBadgeContext {
  portfolios: Portfolio[];
  strategies: StrategyModel[];
  weatherReaderLayers?: UserFlags["weatherReaderLayers"];
}

export interface OnboardingBadgeDef {
  id: OnboardingBadgeId;
  name: string;
  /** Desktop hover tooltip body. */
  description: string;
  /** Success toast when the badge first earns in-session (after silent backfill). */
  congratulate: string;
  icon: Icon;
  underConstruction?: boolean;
  isEarned: (ctx: OnboardingBadgeContext) => boolean;
}

function hasWeatherReader(ctx: OnboardingBadgeContext): boolean {
  const visited = new Set(ctx.weatherReaderLayers ?? []);
  return WEATHER_READER_LAYERS.every((layer) => visited.has(layer));
}

function hasOnboardingComplete(ctx: OnboardingBadgeContext): boolean {
  return STARTER_ONBOARDING_BADGE_IDS.every((id) => {
    const badge = ONBOARDING_BADGES.find((entry) => entry.id === id);
    return badge != null && !badge.underConstruction && badge.isEarned(ctx);
  });
}

export const ONBOARDING_BADGES: OnboardingBadgeDef[] = [
  {
    id: "first-portfolio",
    name: "First Portfolio",
    description: "Create a portfolio book to track sized holdings against your plan.",
    congratulate:
      "Congratulations — your first portfolio is on the books. Solid start, Captain.",
    icon: Briefcase,
    isEarned: (ctx) => ctx.portfolios.some((p) => p.type === "portfolio"),
  },
  {
    id: "first-watchlist",
    name: "First Watchlist",
    description: "Start a watchlist to track names without paper size.",
    congratulate:
      "Congratulations — your first watchlist is live. Keep the watch tight.",
    icon: ListBullets,
    isEarned: (ctx) => ctx.portfolios.some((p) => p.type === "watchlist"),
  },
  {
    id: "first-strategy-applied",
    name: "First Strategy Applied",
    description:
      "Apply a strategy (default or custom) to at least one portfolio or watchlist.",
    congratulate:
      "Congratulations — a strategy is applied. Conviction can now follow your rules.",
    icon: Strategy,
    isEarned: (ctx) =>
      ctx.strategies.some((s) => (s.appliedPortfolioIds?.length ?? 0) > 0),
  },
  {
    id: "first-custom-strategy",
    name: "First Custom Strategy",
    description: "Forge your own strategy — not just a seeded default.",
    congratulate:
      "Congratulations — you forged a custom strategy. Make the rules yours.",
    icon: Hammer,
    isEarned: (ctx) => ctx.strategies.some((s) => !s.isDefault),
  },
  {
    id: "weather-reader",
    name: "Weather Reader",
    description:
      "Open Market, Sector, Industry, and a Stock detail in Market Weather.",
    congratulate:
      "Congratulations — Weather Reader earned. You read the full stack from Market to Stock.",
    icon: Waves,
    isEarned: hasWeatherReader,
  },
  {
    id: "onboarding-complete",
    name: "Onboarding Complete",
    description:
      "Earn all five starter badges — First Portfolio, Watchlist, Strategy Applied, Custom Strategy, and Weather Reader.",
    congratulate:
      "Congratulations — Onboarding Complete. The five starters are yours; keep the voyage steady.",
    icon: MapTrifold,
    isEarned: hasOnboardingComplete,
  },
  {
    id: "first-dashboard",
    name: "First Dashboard Visit",
    description: "Open the Dashboard once it ships for Closed Beta.",
    congratulate: "Congratulations — you opened the Dashboard.",
    icon: ChartBar,
    underConstruction: true,
    isEarned: () => false,
  },
  {
    id: "first-captain-profile",
    name: "Captain Profile",
    description: "Complete your Captain Profile once that surface ships.",
    congratulate: "Congratulations — Captain Profile is set.",
    icon: UserCircle,
    underConstruction: true,
    isEarned: () => false,
  },
];

export function visibleOnboardingBadges(): OnboardingBadgeDef[] {
  return ONBOARDING_BADGES.filter((badge) => !badge.underConstruction);
}

export function earnedOnboardingBadgeIds(
  ctx: OnboardingBadgeContext,
): OnboardingBadgeId[] {
  return visibleOnboardingBadges()
    .filter((badge) => badge.isEarned(ctx))
    .map((badge) => badge.id);
}

export function onboardingBadgeById(
  id: string,
): OnboardingBadgeDef | undefined {
  return ONBOARDING_BADGES.find((badge) => badge.id === id);
}
