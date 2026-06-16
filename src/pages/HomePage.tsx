import { useEffect, useRef, useState } from "react";
import { HeroCard } from "../components/HeroCard";
import { MarketFlowWidget } from "../components/MarketFlowWidget";
import { Tabs, type TabItem } from "../components/Tabs";
import { WatchlistWidget } from "../components/WatchlistWidget";

type HomeTabId = "about" | "market-weather" | "current-watch";

const HOME_TABS: TabItem[] = [
  { id: "about", label: "About" },
  { id: "market-weather", label: "Market Weather" },
  { id: "current-watch", label: "Current Watch" },
];

export function HomePage() {
  const [activeTab, setActiveTab] = useState<HomeTabId>("about");
  const deckRef = useRef<HTMLDivElement | null>(null);
  const aboutRef = useRef<HTMLElement | null>(null);
  const weatherRef = useRef<HTMLElement | null>(null);
  const watchRef = useRef<HTMLElement | null>(null);
  const programmaticScrollRef = useRef(false);
  const programmaticUnlockTimerRef = useRef<number | null>(null);

  function clearProgrammaticScrollLock() {
    programmaticScrollRef.current = false;
    if (programmaticUnlockTimerRef.current !== null) {
      window.clearTimeout(programmaticUnlockTimerRef.current);
      programmaticUnlockTimerRef.current = null;
    }
  }

  function scheduleProgrammaticScrollUnlock() {
    if (programmaticUnlockTimerRef.current !== null) {
      window.clearTimeout(programmaticUnlockTimerRef.current);
    }

    programmaticUnlockTimerRef.current = window.setTimeout(() => {
      programmaticScrollRef.current = false;
      programmaticUnlockTimerRef.current = null;
    }, 120);
  }

  function scrollDeckToTab(tabId: HomeTabId, behavior: ScrollBehavior = "smooth") {
    setActiveTab(tabId);

    const deck = deckRef.current;
    if (!deck) return;

    const target =
      tabId === "about"
        ? aboutRef.current
        : tabId === "market-weather"
          ? weatherRef.current
          : watchRef.current;

    if (!target) return;

    const left = Math.max(0, target.offsetLeft);
    programmaticScrollRef.current = true;
    scheduleProgrammaticScrollUnlock();
    deck.scrollTo({ left, behavior });
  }

  function scrollToTab(tabId: HomeTabId) {
    scrollDeckToTab(tabId);
  }

  useEffect(() => {
    const deck = deckRef.current;
    if (!deck || typeof window === "undefined") return;

    const media = window.matchMedia("(max-width: 1023px)");
    if (!media.matches) return;

    const slides = [aboutRef.current, weatherRef.current, watchRef.current].filter(
      Boolean,
    ) as HTMLElement[];
    if (slides.length === 0) return;

    const handleScroll = () => {
      if (!programmaticScrollRef.current) return;
      scheduleProgrammaticScrollUnlock();
    };

    const observer = new IntersectionObserver(
      (entries) => {
        if (programmaticScrollRef.current) return;

        const topEntry = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

        if (!topEntry) return;

        const nextTab = topEntry.target.getAttribute("data-home-tab") as HomeTabId | null;
        if (nextTab) {
          setActiveTab(nextTab);
        }
      },
      {
        root: deck,
        threshold: [0.45, 0.6, 0.75],
      },
    );

    slides.forEach((slide) => observer.observe(slide));
    deck.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      observer.disconnect();
      deck.removeEventListener("scroll", handleScroll);
      clearProgrammaticScrollLock();
    };
  }, []);

  return (
    <div className="page home-page">
      <div className="home-tabs-shell">
        <Tabs
          items={HOME_TABS}
          value={activeTab}
          onChange={(tabId) => scrollToTab(tabId as HomeTabId)}
          ariaLabel="Home sections"
          className="home-tabs"
        />
      </div>
      <div className="home-grid" ref={deckRef}>
        <section className="home-slide home-slide--about" data-home-tab="about" ref={aboutRef}>
          <HeroCard variant="center" />
        </section>
        <section
          className="home-slide home-slide--market"
          data-home-tab="market-weather"
          ref={weatherRef}
        >
          <MarketFlowWidget />
        </section>
        <section
          className="home-slide home-slide--watch"
          data-home-tab="current-watch"
          ref={watchRef}
        >
          <WatchlistWidget />
        </section>
      </div>
    </div>
  );
}
