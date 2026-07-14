/**
 * Icon system — Phosphor Icons (fill weight), the design system's single icon
 * source. Import icons from here (not directly from the package) so the set
 * stays curated and consistent. The global fill weight is set via
 * `IconContext` in `main.tsx`.
 */
import { forwardRef } from "react";
import {
  Anchor,
  ArrowCounterClockwise,
  ArrowFatLineUp,
  ArrowsClockwise,
  BookmarkSimple,
  CaretDown,
  CaretLeft,
  CaretRight,
  CaretUpDown,
  ChartBar,
  CheckCircle,
  Clock,
  CloudLightning,
  Coins,
  Copy,
  CurrencyDollar,
  Eye,
  FloppyDisk,
  Hammer,
  HardHat,
  House,
  Hurricane,
  type Icon,
  type IconProps,
  Info,
  LockKey,
  MagnifyingGlass,
  PencilSimple,
  Plus,
  Sailboat,
  Scissors,
  SealPercent,
  ShieldStar,
  Siren,
  Skull,
  Strategy,
  Sparkle,
  Trash,
  TrendDown,
  TrendUp,
  UserCircle,
  Warning,
  WarningOctagon,
  WaveTriangle,
  Waves,
  Wind,
  X,
} from "@phosphor-icons/react";
import type { StatusType } from "../types";

export type { Icon };

// Headwind = wind blowing the opposite way to Breakout Wind. Same Phosphor
// glyph, mirrored on the X axis so the gust points back at the viewer.
export const WindReversed: Icon = forwardRef<SVGSVGElement, IconProps>(
  (props, ref) => (
    <Wind
      ref={ref}
      {...props}
      style={{ transform: "scaleX(-1)", ...props.style }}
    />
  ),
);
WindReversed.displayName = "WindReversed";

export {
  Anchor,
  ArrowCounterClockwise,
  ArrowFatLineUp,
  ArrowsClockwise,
  BookmarkSimple,
  CaretDown,
  CaretLeft,
  CaretRight,
  CaretUpDown,
  ChartBar,
  CheckCircle,
  Clock,
  CloudLightning,
  Coins,
  Copy,
  CurrencyDollar,
  Eye,
  FloppyDisk,
  Hammer,
  HardHat,
  House,
  Hurricane,
  Info,
  LockKey,
  MagnifyingGlass,
  PencilSimple,
  Plus,
  Sailboat,
  Scissors,
  SealPercent,
  ShieldStar,
  Siren,
  Skull,
  Sparkle,
  Strategy,
  Trash,
  TrendDown,
  TrendUp,
  UserCircle,
  Warning,
  WarningOctagon,
  WaveTriangle,
  Waves,
  Wind,
  X,
};

/** Status taxonomy → status chip icon. Tone color comes from the chip class. */
export const STATUS_ICON: Record<StatusType, Icon> = {
  "High Alignment": TrendUp,
  Aligned: CheckCircle,
  Watch: Eye,
  Review: Warning,
  "Watch Setup": Eye,
  "Hold Plan": Anchor,
  "Trim Review": Warning,
  "Exit Review": Warning,
  "Review Risk": WarningOctagon,
  "Risk Drift": TrendDown,
  "Risk Check": WarningOctagon,
  "Thesis Check": Warning,
  "Rule Conflict": WarningOctagon,
  "Rule Break": WarningOctagon,
  "Concentration Review": ChartBar,
  "Patience Review": Clock,
  // Layer 3 — user-driven zones (Trim/Add ticker; Go to Cash portfolio)
  "Trim Zone": Scissors,
  "Add Zone": Coins,
  "Go to Cash": CurrencyDollar,
};
