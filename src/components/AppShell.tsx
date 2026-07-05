import { useLayoutEffect } from "react";
import type { ReactNode } from "react";
import { SiteFooter } from "./SiteFooter";
import { TopNav } from "./TopNav";

export function AppShell({ children }: { children: ReactNode }) {
  // On (re-)login the shell mounts fresh, but the browser can retain the prior
  // document scroll position (on mobile the window is the scroller), landing the
  // user mid/bottom of the page. Reset to the top so every page starts at the top.
  useLayoutEffect(() => {
    window.scrollTo(0, 0);
    document.querySelector<HTMLElement>(".app-main")?.scrollTo(0, 0);
  }, []);

  // Expose the live header height so sticky elements below it (e.g. the home
  // section tabs on mobile, where the page scrolls naturally) can offset
  // themselves and pin flush beneath the header instead of overlapping it.
  useLayoutEffect(() => {
    const header = document.querySelector<HTMLElement>(".site-header");
    if (!header) return;

    const root = document.documentElement;
    const setHeight = () =>
      root.style.setProperty("--app-header-h", `${header.offsetHeight}px`);

    setHeight();
    const observer = new ResizeObserver(setHeight);
    observer.observe(header);
    window.addEventListener("resize", setHeight);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", setHeight);
    };
  }, []);

  return (
    <div className="app">
      <TopNav />
      <main className="app-main">{children}</main>
      <SiteFooter />
    </div>
  );
}
