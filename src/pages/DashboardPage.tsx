import { CaptainLogWidget } from "../components/CaptainLogWidget";
import { ChartCard } from "../components/ChartCard";
import { MarketFlowBar } from "../components/MarketFlowBar";
import { SignalWidget } from "../components/SignalWidget";
import { StockSummaryPanel } from "../components/StockSummaryPanel";
import { StrategyAssignmentWidget } from "../components/StrategyAssignmentWidget";
import { WatchlistWidget } from "../components/WatchlistWidget";
import { useAppState } from "../state/AppState";

export function DashboardPage() {
  const { selectedItem } = useAppState();

  if (!selectedItem) {
    return (
      <div className="page dashboard-page">
        <MarketFlowBar />
        <div className="dashboard-empty">
          <WatchlistWidget />
          <div className="empty-board panel">
            <h2>Your watch is empty</h2>
            <p>Add a ticker to start building conviction and logging your thesis.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page dashboard-page">
      <div className="dashboard-grid">
        <div className="db-bar">
          <MarketFlowBar />
        </div>
        <div className="db-watch">
          <WatchlistWidget />
        </div>
        <div className="db-signal">
          <SignalWidget />
        </div>
        <div className="db-chart">
          <ChartCard />
        </div>
        <div className="db-summary">
          <StockSummaryPanel />
        </div>
        <div className="db-log">
          <CaptainLogWidget />
        </div>
        <div className="db-assign">
          <StrategyAssignmentWidget />
        </div>
      </div>
    </div>
  );
}
