interface ChoiceGroupProps<T extends string> {
  label: string;
  options: readonly T[];
  value: T | T[];
  onChange: (next: T) => void;
  multiple?: boolean;
  hint?: string;
}

export function ChoiceGroup<T extends string>({
  label,
  options,
  value,
  onChange,
  multiple = false,
  hint,
}: ChoiceGroupProps<T>) {
  const isSelected = (option: T) =>
    Array.isArray(value) ? value.includes(option) : value === option;

  return (
    <div className="choice-group">
      <div className="choice-group-head">
        <span className="choice-group-label">{label}</span>
        {hint ? <span className="choice-group-hint">{hint}</span> : null}
      </div>
      <div
        className="choice-options"
        role={multiple ? "group" : "radiogroup"}
        aria-label={label}
      >
        {options.map((option) => {
          const selected = isSelected(option);
          return (
            <button
              key={option}
              type="button"
              role={multiple ? undefined : "radio"}
              aria-pressed={multiple ? selected : undefined}
              aria-checked={multiple ? undefined : selected}
              className={
                selected ? "choice-chip choice-chip--selected" : "choice-chip"
              }
              onClick={() => onChange(option)}
            >
              {option}
            </button>
          );
        })}
      </div>
    </div>
  );
}
