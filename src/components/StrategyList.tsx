import type { Strategy } from "../types";
import { StrategyCard } from "./StrategyCard";

export function StrategyList({
  strategies,
  selectedId,
  onSelect,
  onCreate,
  onDuplicate,
  onReset,
  onDelete,
}: {
  strategies: Strategy[];
  selectedId: string;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDuplicate: (id: string) => void;
  onReset: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const selected = strategies.find((strategy) => strategy.id === selectedId);

  return (
    <section className="panel strategy-list-panel" aria-labelledby="strategy-list-title">
      <div className="panel-head">
        <h2 id="strategy-list-title">Strategies</h2>
        <span className="panel-tag">{strategies.length} total</span>
      </div>
      <p className="panel-intro">
        Pick a strategy to configure it on the right. Create, duplicate, reset, or
        delete from here.
      </p>

      <div className="strategy-toolbar">
        <button type="button" className="btn btn--small btn--primary" onClick={onCreate}>
          New
        </button>
        <button
          type="button"
          className="btn btn--small"
          onClick={() => selectedId && onDuplicate(selectedId)}
          disabled={!selectedId}
        >
          Duplicate
        </button>
        <button
          type="button"
          className="btn btn--small"
          onClick={() => selectedId && onReset(selectedId)}
          disabled={!selected?.isDefault}
        >
          Reset
        </button>
        <button
          type="button"
          className="btn btn--small btn--ghost"
          onClick={() => selectedId && onDelete(selectedId)}
          disabled={!selected || selected.isDefault}
        >
          Delete
        </button>
      </div>

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
    </section>
  );
}
