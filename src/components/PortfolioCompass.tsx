import bullCompass from "../assets/bull-skull-compass.webp";
import bearCompass from "../assets/bear-skull-compass.webp";
import { compassVariant } from "../lib/forge/status";
import type { StatusType } from "../types";

export function PortfolioCompass({ status }: { status: StatusType }) {
  const variant = compassVariant(status);

  if (variant === "bear") {
    return (
      <div className="compass compass--risk">
        <img className="compass-img" src={bearCompass} alt="" />
      </div>
    );
  }

  if (variant === "bull") {
    return (
      <div className="compass">
        <img className="compass-img" src={bullCompass} alt="" />
      </div>
    );
  }

  return (
    <div className="compass compass--placeholder">
      <img className="compass-img" src={bullCompass} alt="" />
    </div>
  );
}
