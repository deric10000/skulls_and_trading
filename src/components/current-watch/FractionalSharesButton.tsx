import { Divide } from "../../lib/fractionalShareIcon";
import { Tooltip } from "../Tooltip";

/** Shared whole/fractional quantity-mode action for Current Watch editing. */
export function FractionalSharesButton({
  fractional,
  onToggle,
}: {
  fractional: boolean;
  onToggle: () => void;
}) {
  const label = fractional ? "Use whole shares" : "Use fractional shares";

  return (
    <Tooltip desktopOnly body={label}>
      <button
        type="button"
        className="forge-table-close"
        aria-label={label}
        aria-pressed={fractional}
        onClick={onToggle}
      >
        <Divide aria-hidden weight={fractional ? "bold" : "regular"} />
      </button>
    </Tooltip>
  );
}
