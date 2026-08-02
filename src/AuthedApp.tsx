import { lazy, Suspense, useEffect, useState } from "react";
import { AppShell } from "./components/AppShell";
import { ForgeToast } from "./components/forge/ForgeToast";
import { HomePage } from "./pages/HomePage";
import { preloadWeatherV2, isWeatherV2Ready } from "./lib/datasource/freeTier";
import { useUiState } from "./state/AppState";

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
const OnboardingModal = lazy(() =>
  import("./components/OnboardingModal").then((m) => ({
    default: m.OnboardingModal,
  })),
);
const ComingSoonOverlay = lazy(() =>
  import("./components/ComingSoonOverlay").then((m) => ({
    default: m.ComingSoonOverlay,
  })),
);
// Budget notifications are non-blocking chrome and can hydrate after Home.
const MarketBudgetToasts = lazy(() =>
  import("./components/MarketBudgetToasts").then((module) => ({
    default: module.MarketBudgetToasts,
  })),
);

function ActivePage() {
  const { activePage } = useUiState();

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
    onboardingModalOpen,
    budgetToast,
    clearBudgetToast,
    cadenceToast,
    clearCadenceToast,
    previewStrategyCheckToast,
  } = useUiState();
  const [weatherV2Ready, setWeatherV2Ready] = useState(() => isWeatherV2Ready());

  useEffect(() => {
    let cancelled = false;
    void preloadWeatherV2().then(() => {
      if (!cancelled) setWeatherV2Ready(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // One-shot preview: ?previewCadenceToast=1 (or DEV window hook).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("previewCadenceToast") === "1") {
      previewStrategyCheckToast();
      params.delete("previewCadenceToast");
      const next = params.toString();
      const url = `${window.location.pathname}${next ? `?${next}` : ""}${window.location.hash}`;
      window.history.replaceState({}, "", url);
    }
    if (import.meta.env.DEV) {
      (
        window as Window & { __previewStrategyCheckToast?: () => void }
      ).__previewStrategyCheckToast = previewStrategyCheckToast;
      return () => {
        delete (
          window as Window & { __previewStrategyCheckToast?: () => void }
        ).__previewStrategyCheckToast;
      };
    }
    return undefined;
  }, [previewStrategyCheckToast]);

  return (
    <AppShell>
      {/* First login: Onboarding leads and carries the disclaimer as its last
          step (Acknowledge clears the legal gate too). If the user closes it
          early, the standalone legal modal pops next — the disclaimer is
          never skippable. Returning users get the legal gate as before, and
          can reopen the walkthrough on demand (Home hero) once legal is
          cleared, in which case closing just dismisses. */}
      {onboardingModalOpen ? (
        <Suspense fallback={null}>
          <OnboardingModal />
        </Suspense>
      ) : needsLegalAck ? (
        <Suspense fallback={null}>
          <ComingSoonOverlay variant="legal" onAcknowledge={acknowledgeLegal} />
        </Suspense>
      ) : null}
      <Suspense fallback={null}>
        <MarketBudgetToasts />
      </Suspense>
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
      {cadenceToast ? (
        <div className="cadence-toast-host" aria-live="polite">
          <ForgeToast
            tone="info"
            onDismiss={clearCadenceToast}
            dismissLabel="Dismiss strategy check notification"
          >
            <p>{cadenceToast}</p>
          </ForgeToast>
        </div>
      ) : null}
      <Suspense fallback={null}>
        {weatherV2Ready ? <ActivePage /> : null}
      </Suspense>
    </AppShell>
  );
}
