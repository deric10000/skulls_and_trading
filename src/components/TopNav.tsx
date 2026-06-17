import brandLogo from "../assets/st-logo.png";
import brandWordmark from "../assets/st-wordmark.svg";
import { Sparkle } from "../lib/icons";
import { useAppState } from "../state/AppState";
import type { PageId } from "../types";
import { LinkButton } from "./LinkButton";

const NAV_ITEMS: { id: PageId; label: string }[] = [
  { id: "home", label: "Home" },
  { id: "dashboard", label: "Dashboard" },
  { id: "strategy-forge", label: "Strategy Forge" },
  { id: "ships", label: "Ships" },
  { id: "captain-profile", label: "Captain Profile" },
];

export function TopNav() {
  const { activePage, setActivePage, demoMode, signOut } = useAppState();

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <button
          type="button"
          className="brand"
          onClick={() => setActivePage("home")}
          aria-label="Skulls and Trading home"
        >
          <img className="brand-logo" src={brandLogo} alt="" aria-hidden="true" />
          <img
            className="brand-wordmark"
            src={brandWordmark}
            alt=""
            aria-hidden="true"
          />
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
        <div className="site-account">
          {demoMode ? (
            <span className="chip chip--soon">
              <Sparkle aria-hidden />
              Demo
            </span>
          ) : null}
          <LinkButton className="site-account-link" onClick={signOut}>
            Sign Out
          </LinkButton>
        </div>
      </div>
    </header>
  );
}
