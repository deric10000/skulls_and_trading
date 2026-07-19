export interface ForgeSectionTab {
  id: string;
  label: string;
}

/**
 * Forge in-card / in-modal section tabs (`.forge-section-tabs`).
 * Distinct from the page-level `Tabs` component (auth / age / Configure↔Preview).
 */
export function ForgeSectionTabs({
  tabs,
  active,
  onChange,
  ariaLabel,
}: {
  tabs: ForgeSectionTab[];
  active: string;
  onChange: (id: string) => void;
  ariaLabel: string;
}) {
  return (
    <div className="forge-section-tabs" role="tablist" aria-label={ariaLabel}>
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={isActive ? "forge-section-tab is-active" : "forge-section-tab"}
            onClick={() => onChange(tab.id)}
          >
            <span className="forge-section-tab-label">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}
