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
  const [carouselMode, setCarouselMode] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const [deckWidth, setDeckWidth] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const gestureRef = useRef({
    pointerId: -1,
    startX: 0,
    startY: 0,
    deltaX: 0,
    deltaY: 0,
    horizontal: false,
    active: false,
  });

  const activeIndex = HOME_TABS.findIndex((tab) => tab.id === activeTab);

  function setSlide(tabId: HomeTabId) {
    setActiveTab(tabId);
    setDragOffset(0);
    setIsDragging(false);
  }

  function scrollToTab(tabId: HomeTabId) {
    setSlide(tabId);
  }

  useEffect(() => {
    if (typeof window === "undefined") return;

    const media = window.matchMedia("(max-width: 1023px)");
    const update = () => setCarouselMode(media.matches);

    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!carouselMode || typeof window === "undefined") return;

    const deck = deckRef.current;
    if (!deck) return;

    const updateWidth = () => {
      setDeckWidth(deck.clientWidth);
    };

    updateWidth();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateWidth);
      return () => window.removeEventListener("resize", updateWidth);
    }

    const observer = new ResizeObserver(updateWidth);
    observer.observe(deck);

    return () => observer.disconnect();
  }, [carouselMode]);

  function isSwipeBlocked(target: EventTarget | null) {
    if (!(target instanceof HTMLElement)) return false;

    return Boolean(
      target.closest(
        "button, input, textarea, select, a, [role='button'], [role='tab'], [data-no-swipe]",
      ),
    );
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!carouselMode || event.pointerType === "mouse" || isSwipeBlocked(event.target)) {
      return;
    }

    gestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      deltaX: 0,
      deltaY: 0,
      horizontal: false,
      active: true,
    };

    setIsDragging(false);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function finishSwipe(event: React.PointerEvent<HTMLDivElement>) {
    const gesture = gestureRef.current;
    if (!gesture.active || gesture.pointerId !== event.pointerId) return;

    const width = deckWidth || deckRef.current?.clientWidth || 0;
    const threshold = Math.max(48, width * 0.18);
    const dx = gesture.deltaX;
    const isHorizontal = gesture.horizontal;

    gestureRef.current = {
      pointerId: -1,
      startX: 0,
      startY: 0,
      deltaX: 0,
      deltaY: 0,
      horizontal: false,
      active: false,
    };

    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture may already be gone on some browsers.
    }

    setDragOffset(0);
    setIsDragging(false);

    if (!isHorizontal) return;

    if (dx <= -threshold) {
      setSlide(HOME_TABS[Math.min(activeIndex + 1, HOME_TABS.length - 1)].id as HomeTabId);
    } else if (dx >= threshold) {
      setSlide(HOME_TABS[Math.max(activeIndex - 1, 0)].id as HomeTabId);
    }
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const gesture = gestureRef.current;
    if (!carouselMode || !gesture.active || gesture.pointerId !== event.pointerId) return;

    gesture.deltaX = event.clientX - gesture.startX;
    gesture.deltaY = event.clientY - gesture.startY;

    if (!gesture.horizontal) {
      const startThreshold = 8;
      if (Math.abs(gesture.deltaX) < startThreshold && Math.abs(gesture.deltaY) < startThreshold) {
        return;
      }

      if (Math.abs(gesture.deltaX) <= Math.abs(gesture.deltaY)) {
        return;
      }

      gesture.horizontal = true;
      setIsDragging(true);
    }

    event.preventDefault();

    const width = deckWidth || deckRef.current?.clientWidth || 1;
    const maxOffset = width * 0.38;
    const atStart = activeIndex === 0 && gesture.deltaX > 0;
    const atEnd = activeIndex === HOME_TABS.length - 1 && gesture.deltaX < 0;

    let offset = Math.max(-maxOffset, Math.min(maxOffset, gesture.deltaX));
    if (atStart || atEnd) {
      offset *= 0.35;
    }

    setDragOffset(offset);
  }

  function handlePointerCancel(event: React.PointerEvent<HTMLDivElement>) {
    finishSwipe(event);
  }

  const carouselTranslate = carouselMode
    ? { transform: `translate3d(${-(activeIndex * (deckWidth || 0)) + dragOffset}px, 0, 0)` }
    : undefined;
  const carouselTransition = carouselMode && isDragging ? "none" : "transform 280ms ease";

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
      <div
        className="home-grid"
        ref={deckRef}
        style={carouselMode ? { ...carouselTranslate, transition: carouselTransition } : undefined}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishSwipe}
        onPointerCancel={handlePointerCancel}
      >
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
