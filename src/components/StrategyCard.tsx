import type { Strategy } from "../types";

export function StrategyCard({
  strategy,
  isActive,
  onSelect,
}: {
  strategy: Strategy;
  isActive: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={isActive ? "strategy-card strategy-card--active" : "strategy-card"}
      onClick={onSelect}
      aria-pressed={isActive}
    >
      <span className="strategy-card-head">
        <span className="strategy-card-name">{strategy.name}</span>
        <span className={strategy.isDefault ? "chip" : "chip chip--soon"}>
          {strategy.isDefault ? "Default" : "Custom"}
        </span>
      </span>
      <span className="strategy-card-desc">{strategy.description}</span>
      <span className="strategy-card-tags">
        {strategy.tags.map((tag) => (
          <span key={tag} className="chip">
            {tag}
          </span>
        ))}
        {!strategy.enabled ? (
          <span className="chip status--warning">Disabled</span>
        ) : null}
      </span>
    </button>
  );
}
