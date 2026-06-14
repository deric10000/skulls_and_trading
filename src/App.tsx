import { AppShell } from "./components/AppShell";
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

function App() {
  return (
    <AppStateProvider>
      <AppShell>
        <ActivePage />
      </AppShell>
    </AppStateProvider>
  );
}

export default App;
