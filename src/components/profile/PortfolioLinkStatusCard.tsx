import { Clock } from "../../lib/icons";
import { useAppState } from "../../state/AppState";
import type { PortfolioLinkStatus } from "../../types";

const STATUS_TONE: Record<PortfolioLinkStatus, string> = {
  Manual: "status--neutral",
  "CSV (soon)": "status--warning",
  "Brokerage (soon)": "status--warning",
  Connected: "status--positive",
  "Needs Review": "status--negative",
};

const OPTIONS: { value: PortfolioLinkStatus; label: string; soon?: boolean }[] = [
  { value: "Manual", label: "Manual entry" },
  { value: "CSV (soon)", label: "CSV import", soon: true },
  { value: "Brokerage (soon)", label: "Brokerage link", soon: true },
];

export function PortfolioLinkStatusCard() {
  const { captain, updateCaptain } = useAppState();

  return (
    <section className="panel link-card" aria-labelledby="link-title">
      <div className="panel-head">
        <h2 id="link-title">Portfolio Link</h2>
        <span className={`chip ${STATUS_TONE[captain.portfolioLink]}`}>
          {captain.portfolioLink}
        </span>
      </div>
      <p className="panel-intro">
        Choose how your positions get into the Treasure Ledger. We never place trades
        and brokerage data stays private to you.
      </p>
      <div className="link-options">
        {OPTIONS.map((option) => {
          const active = captain.portfolioLink === option.value;
          return (
            <button
              key={option.value}
              type="button"
              className={active ? "link-option link-option--active" : "link-option"}
              onClick={() => updateCaptain({ portfolioLink: option.value })}
              disabled={option.soon}
            >
              <span>{option.label}</span>
              {option.soon ? (
                <span className="chip chip--soon">
                  <Clock aria-hidden />
                  Coming soon
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}
