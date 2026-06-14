import { HeroCard } from "../components/HeroCard";
import { MarketFlowWidget } from "../components/MarketFlowWidget";
import { WatchlistWidget } from "../components/WatchlistWidget";

export function HomePage() {
  return (
    <div className="page home-page">
      <HeroCard />
      <div className="home-secondary">
        <MarketFlowWidget />
        <WatchlistWidget />
      </div>
    </div>
  );
}
