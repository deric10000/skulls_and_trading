import type { ReactNode } from "react";
import { TopNav } from "./TopNav";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="app">
      <TopNav />
      <main className="app-main">{children}</main>
      <footer className="site-footer">
        <p>Skulls &amp; Trading · Built for conviction, discipline, and the setup.</p>
      </footer>
    </div>
  );
}
