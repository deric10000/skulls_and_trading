/**
 * Icon system — Phosphor Icons (fill weight), the design system's single icon
 * source. Import icons from here (not directly from the package) so the set
 * stays curated and consistent. The global fill weight is set via
 * `IconContext` in `main.tsx`.
 */
import {
  CaretLeft,
  CheckCircle,
  Clock,
  Eye,
  type Icon,
  LockKey,
  ShieldStar,
  Skull,
  Strategy,
  Sparkle,
  TrendUp,
  Warning,
  WarningOctagon,
} from "@phosphor-icons/react";
import type { StatusType } from "../types";

export type { Icon };

export {
  CaretLeft,
  CheckCircle,
  Clock,
  Eye,
  LockKey,
  ShieldStar,
  Skull,
  Sparkle,
  Strategy,
  TrendUp,
  Warning,
  WarningOctagon,
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
