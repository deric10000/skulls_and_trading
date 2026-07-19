import { lazy, Suspense } from "react";
import { AppShell } from "./components/AppShell";
import { ComingSoonOverlay } from "./components/ComingSoonOverlay";
import { MarketBudgetToasts } from "./components/MarketBudgetToasts";
import { HomePage } from "./pages/HomePage";
import { useAppState } from "./state/AppState";

// Pages are lazy by default (performance-budget.md). Home stays eager: it is
// the default landing, so it ships with this authed chunk and needs no second
// fetch after sign-in.
const DashboardPage = lazy(() =>
  import("./pages/DashboardPage").then((m) => ({ default: m.DashboardPage })),
);
const StrategyForgePage = lazy(() =>
  import("./pages/StrategyForgePage").then((m) => ({
    default: m.StrategyForgePage,
  })),
);
const ShipsPage = lazy(() =>
  import("./pages/ShipsPage").then((m) => ({ default: m.ShipsPage })),
);
const CaptainProfilePage = lazy(() =>
  import("./pages/CaptainProfilePage").then((m) => ({
    default: m.CaptainProfilePage,
  })),
);
// First-login-only surface — most sessions never mount it, so it stays lazy
// (performance-budget.md: big secondary UI loads on demand).
const HelmModal = lazy(() =>
  import("./components/HelmModal").then((m) => ({ default: m.HelmModal })),
);

function ActivePage() {
  const { activePage } = useAppState();

  if (activePage === "dashboard") return <DashboardPage />;
  if (activePage === "strategy-forge") return <StrategyForgePage />;
  if (activePage === "ships") return <ShipsPage />;
  if (activePage === "captain-profile") return <CaptainProfilePage />;
  return <HomePage />;
}

/**
 * Everything behind the auth gate. Loaded lazily from App.tsx so the
 * signed-out login screen never downloads the app shell, pages, or the
 * forge/watchlist/weather modules (performance-budget.md).
 */
export default function AuthedApp() {
  const {
    needsLegalAck,
    acknowledgeLegal,
    needsHelm,
    budgetToast,
    clearBudgetToast,
  } = useAppState();

  return (
    <AppShell>
      {needsLegalAck ? (
        <ComingSoonOverlay variant="legal" onAcknowledge={acknowledgeLegal} />
      ) : null}
      {/* The Helm (first login) waits behind the legal gate so the two
          full-viewport surfaces never stack. */}
      {!needsLegalAck && needsHelm ? (
        <Suspense fallback={null}>
          <HelmModal />
        </Suspense>
      ) : null}
      <MarketBudgetToasts />
      {budgetToast ? (
        <div className="budget-cap-toast" role="status">
          <p>{budgetToast}</p>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={clearBudgetToast}
          >
            Dismiss
          </button>
        </div>
      ) : null}
      <Suspense fallback={null}>
        <ActivePage />
      </Suspense>
    </AppShell>
  );
}
