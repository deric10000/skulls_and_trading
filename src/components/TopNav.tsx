import brandLogo from "../assets/st-logo.png";
import brandWordmark from "../assets/st-wordmark.svg";
import {
  ChartBar,
  Hammer,
  House,
  type Icon,
  Sailboat,
  Sparkle,
  UserCircle,
} from "../lib/icons";
import {
  CLOSED_BETA_LABEL,
  CLOSED_BETA_TRUST,
} from "../lib/closedBeta";
import { useAppState } from "../state/AppState";
import type { PageId } from "../types";
import { LinkButton } from "./LinkButton";
import { Tooltip } from "./Tooltip";

// `icon` drives the mobile glass-pill nav (Figma node 100:1092); the text
// `label` drives the desktop/tablet nav and the icon's accessible name.
const NAV_ITEMS: { id: PageId; label: string; icon: Icon }[] = [
  { id: "home", label: "Home", icon: House },
  { id: "dashboard", label: "Dashboard", icon: ChartBar },
  { id: "strategy-forge", label: "Strategy Forge", icon: Hammer },
  { id: "ships", label: "Ships", icon: Sailboat },
  { id: "captain-profile", label: "Captain Profile", icon: UserCircle },
];

export function TopNav() {
  const { activePage, setActivePage, demoMode, userProfile, signOut } =
    useAppState();
  const chipLabel = demoMode
    ? "Demo"
    : userProfile?.role === "admin"
      ? "Admin"
      : "Beta";

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
          <Tooltip title={CLOSED_BETA_LABEL} body={CLOSED_BETA_TRUST} wide>
            <span className="chip chip--soon">
              <Sparkle aria-hidden />
              {chipLabel}
            </span>
          </Tooltip>
          <LinkButton className="site-account-link" onClick={signOut}>
            Sign Out
          </LinkButton>
        </div>

        {/* Mobile-only global nav: a liquid-glass pill with icon primary-nav on
            the left and Sign Out on the right (Figma node 100:1092). Shown only
            at <=767px; the desktop/tablet text nav + account link hide there. */}
        <div className="mobile-nav-pill">
          <nav className="mobile-nav-icons" aria-label="Primary">
            {NAV_ITEMS.map((item) => {
              const ItemIcon = item.icon;
              const isActive = item.id === activePage;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={
                    isActive
                      ? "mobile-nav-icon mobile-nav-icon--active"
                      : "mobile-nav-icon"
                  }
                  aria-label={item.label}
                  aria-current={isActive ? "page" : undefined}
                  onClick={() => setActivePage(item.id)}
                >
                  <ItemIcon aria-hidden />
                </button>
              );
            })}
          </nav>
          <button
            type="button"
            className="mobile-nav-signout"
            onClick={signOut}
          >
            Sign Out
          </button>
        </div>
      </div>
    </header>
  );
}
