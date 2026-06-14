import { HeroCard } from "../components/HeroCard";
import { MarketFlowWidget } from "../components/MarketFlowWidget";
import { WatchlistWidget } from "../components/WatchlistWidget";

export function HomePage() {
  return (
    <div className="page home-page">
      <div className="home-grid">
        <div className="home-hero">
          <HeroCard variant="center" />
        </div>
        <div className="home-flow">
          <MarketFlowWidget />
        </div>
        <div className="home-watch">
          <WatchlistWidget />
        </div>
      </div>
    </div>
  );
}
