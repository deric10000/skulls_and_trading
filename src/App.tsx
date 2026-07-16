import { AppShell } from "./components/AppShell";
import { LoginScreen } from "./components/auth/LoginScreen";
import { Onboarding } from "./components/auth/Onboarding";
import { LegalDisclaimerModal } from "./components/LegalDisclaimerModal";
import { MarketBudgetToasts } from "./components/MarketBudgetToasts";
import { CaptainProfilePage } from "./pages/CaptainProfilePage";
import { DashboardPage } from "./pages/DashboardPage";
import { HomePage } from "./pages/HomePage";
import { ShipsPage } from "./pages/ShipsPage";
import { StrategyForgePage } from "./pages/StrategyForgePage";
import { AppStateProvider, useAppState } from "./state/AppState";

function ActivePage() {
  const { activePage } = useAppState();

  if (activePage === "dashboard") return <DashboardPage />;
  if (activePage === "strategy-forge") return <StrategyForgePage />;
  if (activePage === "ships") return <ShipsPage />;
  if (activePage === "captain-profile") return <CaptainProfilePage />;
  return <HomePage />;
}

function AuthGate() {
  const {
    isAuthenticated,
    needsOnboarding,
    needsLegalAck,
    acknowledgeLegal,
    budgetToast,
    clearBudgetToast,
  } = useAppState();

  if (!isAuthenticated) return <LoginScreen />;
  if (needsOnboarding) return <Onboarding />;

  return (
    <AppShell>
      <LegalDisclaimerModal
        open={needsLegalAck}
        onAcknowledge={acknowledgeLegal}
      />
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
      <ActivePage />
    </AppShell>
  );
}

function App() {
  return (
    <AppStateProvider>
      <AuthGate />
    </AppStateProvider>
  );
}

export default App;
