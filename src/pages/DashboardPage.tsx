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
      <MarketFlowBar />
      <div className="dashboard-body">
        <div className="db-col db-col-watch">
          <WatchlistWidget />
        </div>
        <div className="db-col db-col-center">
          <SignalWidget />
          <ChartCard />
        </div>
        <div className="db-col db-col-right">
          <div className="db-item db-item-summary">
            <StockSummaryPanel />
          </div>
          <div className="db-item db-item-log">
            <CaptainLogWidget />
          </div>
          <div className="db-item db-item-assign">
            <StrategyAssignmentWidget />
          </div>
        </div>
      </div>
    </div>
  );
}
