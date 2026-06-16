export interface TabItem {
  id: string;
  label: string;
  disabled?: boolean;
}

interface TabsProps {
  items: TabItem[];
  value: string;
  onChange: (id: string) => void;
  ariaLabel: string;
  /** Stretch tabs to equal-width segments that fill the container. */
  fill?: boolean;
  className?: string;
  tabClassName?: string;
}

export function Tabs({
  items,
  value,
  onChange,
  ariaLabel,
  fill = false,
  className = "",
  tabClassName = "",
}: TabsProps) {
  return (
    <div
      className={["tabs", fill ? "tabs--fill" : "", className].filter(Boolean).join(" ")}
      role="tablist"
      aria-label={ariaLabel}
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={value === item.id}
          disabled={item.disabled}
          className={[
            "tab",
            value === item.id ? "tab--active" : "",
            tabClassName,
          ]
            .filter(Boolean)
            .join(" ")}
          onClick={() => {
            if (!item.disabled) onChange(item.id);
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
