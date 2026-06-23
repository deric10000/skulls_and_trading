import { useEffect, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { HeroCard } from "../components/HeroCard";
import { MarketFlowWidget } from "../components/MarketFlowWidget";
import { Tabs, type TabItem } from "../components/Tabs";
import { WatchlistWidget } from "../components/WatchlistWidget";

type HomeTabId = "about" | "market-weather" | "current-watch";

const HOME_TABS: TabItem[] = [
  { id: "about", label: "About" },
  { id: "current-watch", label: "Current Watch" },
  { id: "market-weather", label: "Market Weather" },
];

export function HomePage() {
  const [activeTab, setActiveTab] = useState<HomeTabId>("about");
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
    if (!emblaApi) return;

    const onSelect = () => {
      const nextTab = HOME_TABS[emblaApi.selectedScrollSnap()]?.id;
      if (nextTab) setActiveTab(nextTab as HomeTabId);
    };

    emblaApi.on("select", onSelect);
    emblaApi.on("reInit", onSelect);
    onSelect();

    return () => {
      emblaApi.off("select", onSelect);
      emblaApi.off("reInit", onSelect);
    };
  }, [emblaApi]);

  useEffect(() => {
    if (!carouselEnabled || !emblaApi) return;

    const nextIndex = HOME_TABS.findIndex((tab) => tab.id === activeTab);
    if (nextIndex >= 0) {
      emblaApi.scrollTo(nextIndex);
    }
  }, [activeTab, emblaApi, carouselEnabled]);

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
      <div className="home-grid" ref={emblaRef}>
        <div className="home-grid__track">
          <section className="home-slide home-slide--about" data-home-tab="about">
            <HeroCard variant="center" />
          </section>
          <section className="home-slide home-slide--watch" data-home-tab="current-watch">
            <WatchlistWidget readOnly onSelectTicker={setWeatherFocusTicker} />
          </section>
          <section className="home-slide home-slide--market" data-home-tab="market-weather">
            <MarketFlowWidget focusTicker={weatherFocusTicker} />
          </section>
        </div>
      </div>
    </div>
  );
}
