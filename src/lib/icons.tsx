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
  CaretDown,
  CaretLeft,
  CaretRight,
  CaretUpDown,
  ChartBar,
  CheckCircle,
  Clock,
  CloudLightning,
  Copy,
  Eye,
  FloppyDisk,
  Hammer,
  House,
  Hurricane,
  type Icon,
  type IconProps,
  Info,
  LockKey,
  PencilSimple,
  Plus,
  Sailboat,
  SealPercent,
  ShieldStar,
  Siren,
  Skull,
  Strategy,
  Sparkle,
  Trash,
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
  CaretDown,
  CaretLeft,
  CaretRight,
  CaretUpDown,
  ChartBar,
  CheckCircle,
  Clock,
  CloudLightning,
  Copy,
  Eye,
  FloppyDisk,
  Hammer,
  House,
  Hurricane,
  Info,
  LockKey,
  PencilSimple,
  Plus,
  Sailboat,
  SealPercent,
  ShieldStar,
  Siren,
  Skull,
  Sparkle,
  Strategy,
  Trash,
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
  "Risk Check": WarningOctagon,
  "Thesis Check": Warning,
};
