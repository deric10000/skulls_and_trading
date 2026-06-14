import { useAppState } from "../state/AppState";
import type { PageId } from "../types";

const NAV_ITEMS: { id: PageId; label: string }[] = [
  { id: "home", label: "Home" },
  { id: "dashboard", label: "Dashboard" },
  { id: "strategy-forge", label: "Strategy Forge" },
];

export function TopNav() {
  const { activePage, setActivePage } = useAppState();

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <button
          type="button"
          className="brand"
          onClick={() => setActivePage("home")}
          aria-label="Skulls and Trading home"
        >
          <span className="brand-mark" aria-hidden="true">
            &#9763;
          </span>
          <span className="brand-text">
            Skulls <span className="brand-amp">&amp;</span> Trading
          </span>
        </button>
        <nav className="site-nav" aria-label="Primary">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={
                item.id === activePage ? "nav-link nav-link--active" : "nav-link"
              }
              aria-current={item.id === activePage ? "page" : undefined}
              onClick={() => setActivePage(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </div>
    </header>
  );
}
