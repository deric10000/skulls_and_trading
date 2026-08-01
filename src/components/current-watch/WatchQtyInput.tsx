import { useId, useState } from "react";
import {
  formatFractionalQuantityInput,
  roundQuantity,
} from "../../lib/finance/currentWatchTransactions";
import { FractionalSharesButton } from "./FractionalSharesButton";

/** Edit-only quantity field with an explicit fractional-share mode. */
export function WatchQtyInput({
  ticker,
  shares,
  fractional,
  onFractionalChange,
  onCommit,
}: {
  ticker: string;
  shares: number;
  fractional: boolean;
  onFractionalChange: (enabled: boolean) => void;
  onCommit: (shares: number) => boolean;
}) {
  const inputId = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const display =
    draft ??
    (fractional ? formatFractionalQuantityInput(shares) : String(shares));

  function commit(raw: string): boolean {
    const next = raw.trim() === "" ? 0 : Number(raw);
    const value = Number.isFinite(next)
      ? Math.max(0, fractional ? roundQuantity(next) : Math.floor(next))
      : 0;
    return onCommit(value);
  }

  return (
    <div className="watch-qty-edit">
      <label className="visually-hidden" htmlFor={inputId}>
        Share quantity for {ticker}
      </label>
      <input
        key={fractional ? "fractional" : "whole"}
        id={inputId}
        type="number"
        className="input watch-qty-input"
        min={0}
        step={fractional ? 0.000001 : 1}
        inputMode="decimal"
        autoComplete="off"
        value={display}
        onFocus={() => setDraft(display)}
        onChange={(event) => {
          const raw = event.target.value;
          const pattern = fractional ? /^\d*(?:\.\d{0,6})?$/ : /^\d+$/;
          if (raw !== "" && !pattern.test(raw)) return;
          setDraft(raw);
          if (raw !== "" && !commit(raw)) setDraft(String(shares));
        }}
        onBlur={(event) => {
          if (!commit(event.target.value)) {
            setDraft(String(shares));
            return;
          }
          setDraft(null);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
      />
      <FractionalSharesButton
        fractional={fractional}
        onToggle={() => onFractionalChange(!fractional)}
      />
    </div>
  );
}
