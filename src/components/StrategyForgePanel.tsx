import {
  DECISION_SIGNAL_OPTIONS,
  EXIT_RULE_OPTIONS,
  TAG_OPTIONS,
  TIMEFRAME_OPTIONS,
} from "../data";
import { useAppState } from "../state/AppState";
import type {
  DecisionSignal,
  ExitRule,
  Strategy,
  Timeframe,
} from "../types";

function toggleValue<T>(values: T[], value: T): T[] {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
}

function ChipGroup<T extends string>({
  title,
  options,
  active,
  onToggle,
}: {
  title: string;
  options: readonly T[];
  active: T[];
  onToggle: (value: T) => void;
}) {
  return (
    <div className="config-group">
      <h3>{title}</h3>
      <div className="config-chips">
        {options.map((option) => {
          const on = active.includes(option);
          return (
            <button
              key={option}
              type="button"
              className={on ? "config-chip config-chip--on" : "config-chip"}
              aria-pressed={on}
              onClick={() => onToggle(option)}
            >
              {option}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function StrategyForgePanel({ strategy }: { strategy: Strategy | undefined }) {
  const { updateStrategy, resetStrategy, deleteStrategy } = useAppState();

  if (!strategy) {
    return (
      <section className="panel strategy-config" aria-labelledby="config-title">
        <div className="panel-head">
          <h2 id="config-title">Configure</h2>
        </div>
        <p className="panel-intro">Select a strategy to configure it.</p>
      </section>
    );
  }

  const id = strategy.id;

  return (
    <section className="panel strategy-config" aria-labelledby="config-title">
      <div className="panel-head">
        <h2 id="config-title">Configure</h2>
        <span className={strategy.isDefault ? "chip" : "chip chip--soon"}>
          {strategy.isDefault ? "Default" : "Custom"}
        </span>
      </div>

      <label className="config-field">
        <span className="config-label">Strategy name</span>
        <input
          className="input"
          value={strategy.name}
          onChange={(event) => updateStrategy(id, { name: event.target.value })}
        />
      </label>

      <label className="config-field">
        <span className="config-label">Description</span>
        <textarea
          className="input log-textarea"
          rows={2}
          value={strategy.description}
          onChange={(event) =>
            updateStrategy(id, { description: event.target.value })
          }
        />
      </label>

      <label className="config-toggle">
        <input
          type="checkbox"
          checked={strategy.enabled}
          onChange={(event) => updateStrategy(id, { enabled: event.target.checked })}
        />
        <span>Enabled (counts toward Dashboard signals)</span>
      </label>

      <ChipGroup<Timeframe>
        title="Timeframe"
        options={TIMEFRAME_OPTIONS}
        active={strategy.timeframe}
        onToggle={(value) =>
          updateStrategy(id, { timeframe: toggleValue(strategy.timeframe, value) })
        }
      />

      <ChipGroup<string>
        title="Strategy Tags"
        options={TAG_OPTIONS}
        active={strategy.tags}
        onToggle={(value) =>
          updateStrategy(id, { tags: toggleValue(strategy.tags, value) })
        }
      />

      <ChipGroup<DecisionSignal>
        title="Key Decision Signals"
        options={DECISION_SIGNAL_OPTIONS}
        active={strategy.decisionSignals}
        onToggle={(value) =>
          updateStrategy(id, {
            decisionSignals: toggleValue(strategy.decisionSignals, value),
          })
        }
      />

      <ChipGroup<ExitRule>
        title="Exit Logic"
        options={EXIT_RULE_OPTIONS}
        active={strategy.exitLogic}
        onToggle={(value) =>
          updateStrategy(id, { exitLogic: toggleValue(strategy.exitLogic, value) })
        }
      />

      <div className="config-actions">
        {strategy.isDefault ? (
          <button
            type="button"
            className="btn btn--small btn--ghost"
            onClick={() => resetStrategy(id)}
          >
            Reset to default
          </button>
        ) : (
          <button
            type="button"
            className="btn btn--small btn--ghost"
            onClick={() => deleteStrategy(id)}
          >
            Delete strategy
          </button>
        )}
      </div>
    </section>
  );
}
