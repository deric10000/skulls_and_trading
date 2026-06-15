import { AppShell } from "./components/AppShell";
import { LoginScreen } from "./components/auth/LoginScreen";
import { Onboarding } from "./components/auth/Onboarding";
import { DashboardPage } from "./pages/DashboardPage";
import { HomePage } from "./pages/HomePage";
import { StrategyForgePage } from "./pages/StrategyForgePage";
import { AppStateProvider, useAppState } from "./state/AppState";

function ActivePage() {
  const { activePage } = useAppState();

  if (activePage === "dashboard") return <DashboardPage />;
  if (activePage === "strategy-forge") return <StrategyForgePage />;
  return <HomePage />;
}

function AuthGate() {
  const { isAuthenticated, needsOnboarding } = useAppState();

  if (!isAuthenticated) return <LoginScreen />;
  if (needsOnboarding) return <Onboarding />;

  return (
    <AppShell>
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
