/**
 * Icon system — Phosphor Icons (fill weight), the design system's single icon
 * source. Import icons from here (not directly from the package) so the set
 * stays curated and consistent. The global fill weight is set via
 * `IconContext` in `main.tsx`.
 */
import {
  CheckCircle,
  Clock,
  Eye,
  type Icon,
  Skull,
  Sparkle,
  Warning,
  WarningOctagon,
} from "@phosphor-icons/react";
import type { StatusType } from "../types";

export type { Icon };

export { CheckCircle, Clock, Eye, Skull, Sparkle, Warning, WarningOctagon };

/** Status taxonomy → status chip icon. Tone color comes from the chip class. */
export const STATUS_ICON: Record<StatusType, Icon> = {
  Aligned: CheckCircle,
  Watch: Eye,
  Review: Warning,
  "Rule Check": Warning,
  "Risk Check": Warning,
  "Thesis Needed": Warning,
  "Trim Review": Warning,
  "Exit Review": WarningOctagon,
};
