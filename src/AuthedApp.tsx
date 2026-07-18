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
  const { needsLegalAck, acknowledgeLegal, budgetToast, clearBudgetToast } =
    useAppState();

  return (
    <AppShell>
      {needsLegalAck ? (
        <ComingSoonOverlay variant="legal" onAcknowledge={acknowledgeLegal} />
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
