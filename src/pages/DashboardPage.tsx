import { CaptainLogWidget } from "../components/CaptainLogWidget";
import { ChartCard } from "../components/ChartCard";
import { StockSummaryPanel } from "../components/StockSummaryPanel";
import { WatchlistWidget } from "../components/WatchlistWidget";
import { useAppState } from "../state/AppState";

export function DashboardPage() {
  const { selectedItem } = useAppState();

  if (!selectedItem) {
    return (
      <div className="page dashboard-page">
        <div className="dashboard-grid dashboard-grid--empty">
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
        <WatchlistWidget />
        <div className="dashboard-center">
          <StockSummaryPanel />
          <ChartCard />
        </div>
        <CaptainLogWidget />
      </div>
    </div>
  );
}
