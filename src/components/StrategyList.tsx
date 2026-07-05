import type { Strategy } from "../types";
import { StrategyActions } from "./StrategyActions";
import { StrategyCard } from "./StrategyCard";

export function StrategyList({
  strategies,
  selectedId,
  onSelect,
  onCreate,
  onDuplicate,
  onDelete,
  showActions = true,
}: {
  strategies: Strategy[];
  selectedId: string;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  /** Render the action row inside the card. Off on mobile, where the actions
      live in a viewport-sticky dock (see StrategyForgePage). */
  showActions?: boolean;
}) {
  const selected = strategies.find((strategy) => strategy.id === selectedId);

  return (
    <section className="panel strategy-list-panel" aria-labelledby="strategy-list-title">
      <div className="panel-head">
        <h2 id="strategy-list-title">My Strategies</h2>
        <span className="panel-tag">{strategies.length} total</span>
      </div>
      <p className="panel-intro">Add, configure, and remove strategies below.</p>

      <ul className="strategy-list">
        {strategies.map((strategy) => (
          <li key={strategy.id}>
            <StrategyCard
              strategy={strategy}
              isActive={strategy.id === selectedId}
              onSelect={() => onSelect(strategy.id)}
            />
          </li>
        ))}
      </ul>

      {showActions && (
        <StrategyActions
          selectedId={selectedId}
          canDelete={!!selected && !selected.isDefault}
          onDelete={() => selectedId && onDelete(selectedId)}
          onDuplicate={() => selectedId && onDuplicate(selectedId)}
          onCreate={onCreate}
        />
      )}
    </section>
  );
}
