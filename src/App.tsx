import { lazy, Suspense, useEffect } from "react";
import { LoginScreen } from "./components/auth/LoginScreen";
import { Onboarding } from "./components/auth/Onboarding";
import { AppStateProvider, useAppState } from "./state/AppState";

// The entire authenticated app loads on demand so the signed-out first paint
// stays light (performance-budget.md). LoginScreen + Onboarding stay eager —
// they ARE the signed-out surface.
const AuthedApp = lazy(() => import("./AuthedApp"));

function AuthGate() {
  const { isAuthenticated, needsOnboarding } = useAppState();

  // Warm the authed chunks in the background while the user types their
  // credentials, so sign-in stays instant without weighing down first paint.
  useEffect(() => {
    if (isAuthenticated) return;
    const timer = window.setTimeout(() => {
      void import("./AuthedApp");
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [isAuthenticated]);

  if (!isAuthenticated) return <LoginScreen />;
  if (needsOnboarding) return <Onboarding />;

  return (
    <Suspense fallback={null}>
      <AuthedApp />
    </Suspense>
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
