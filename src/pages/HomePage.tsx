import { useEffect, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { HeroCard } from "../components/HeroCard";
import { MarketFlowWidget } from "../components/MarketFlowWidget";
import { Tabs, type TabItem } from "../components/Tabs";
import { WatchlistWidget } from "../components/WatchlistWidget";

type HomeTabId = "about" | "market-weather" | "current-watch";

// Desktop/tablet tab order (tabs are visible 768–1023px; hidden >=1024px).
const HOME_TABS: TabItem[] = [
  { id: "about", label: "About" },
  { id: "current-watch", label: "Current Watch" },
  { id: "market-weather", label: "Market Weather" },
];

// Mobile (<=767px) leads with Current Watch. Desktop/tablet are untouched —
// their card layout is fixed by explicit CSS grid placement per .home-slide--*,
// so it ignores DOM order; only the mobile swipe order follows the DOM.
const MOBILE_HOME_TABS: TabItem[] = [
  { id: "current-watch", label: "Current Watch" },
  { id: "market-weather", label: "Market Weather" },
  { id: "about", label: "About" },
];

// DOM order of the <section> slides below (= the mobile swipe order). Embla
// indexes slides by DOM position, so this MUST match the JSX section order.
const SLIDE_ORDER: HomeTabId[] = ["current-watch", "market-weather", "about"];

export function HomePage() {
  // Default selection differs by viewport: Current Watch leads on mobile, About
  // on desktop/tablet (unchanged). Set at mount from the same 767px breakpoint
  // that drives the carousel so the first paint matches.
  const [activeTab, setActiveTab] = useState<HomeTabId>(() =>
    typeof window !== "undefined" &&
    window.matchMedia("(max-width: 767px)").matches
      ? "current-watch"
      : "about",
  );
  // Shared so selecting a name in Current Watch refocuses Market Weather's
  // sector/industry/stock layers (the two live on separate home tabs).
  const [weatherFocusTicker, setWeatherFocusTicker] = useState<string | null>(null);
  const [carouselEnabled, setCarouselEnabled] = useState(false);
  const [emblaRef, emblaApi] = useEmblaCarousel({
    axis: "x",
    active: carouselEnabled,
    align: "start",
    containScroll: "trimSnaps",
    dragFree: false,
    loop: false,
  });

  function scrollToTab(tabId: HomeTabId) {
    setActiveTab(tabId);
  }

  useEffect(() => {
    if (typeof window === "undefined") return;

    const media = window.matchMedia("(max-width: 767px)");
    const update = () => setCarouselEnabled(media.matches);

    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    // Only let the carousel drive the active tab on mobile, where it's active.
    // On desktop/tablet the (inactive) carousel would otherwise force tab 0.
    if (!emblaApi || !carouselEnabled) return;

    const onSelect = () => {
      const nextTab = SLIDE_ORDER[emblaApi.selectedScrollSnap()];
      if (nextTab) setActiveTab(nextTab);
    };

    emblaApi.on("select", onSelect);
    emblaApi.on("reInit", onSelect);
    onSelect();

    return () => {
      emblaApi.off("select", onSelect);
      emblaApi.off("reInit", onSelect);
    };
  }, [emblaApi, carouselEnabled]);

  useEffect(() => {
    if (!carouselEnabled || !emblaApi) return;

    const nextIndex = SLIDE_ORDER.findIndex((id) => id === activeTab);
    if (nextIndex >= 0) {
      emblaApi.scrollTo(nextIndex);
    }
  }, [activeTab, emblaApi, carouselEnabled]);

  return (
    <div className="page home-page">
      <div className="home-tabs-shell">
        <Tabs
          items={carouselEnabled ? MOBILE_HOME_TABS : HOME_TABS}
          value={activeTab}
          onChange={(tabId) => scrollToTab(tabId as HomeTabId)}
          ariaLabel="Home sections"
          className="home-tabs"
        />
      </div>
      <div className="home-grid" ref={emblaRef}>
        <div className="home-grid__track">
          <section className="home-slide home-slide--watch" data-home-tab="current-watch">
            <WatchlistWidget readOnly onSelectTicker={setWeatherFocusTicker} />
          </section>
          <section className="home-slide home-slide--market" data-home-tab="market-weather">
            <MarketFlowWidget focusTicker={weatherFocusTicker} />
          </section>
          <section className="home-slide home-slide--about" data-home-tab="about">
            <HeroCard variant="center" />
          </section>
        </div>
      </div>
    </div>
  );
}
