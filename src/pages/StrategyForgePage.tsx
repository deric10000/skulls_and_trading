import { useEffect, useState } from "react";
import { StrategyActions } from "../components/StrategyActions";
import { StrategyForgePanel } from "../components/StrategyForgePanel";
import { StrategyList } from "../components/StrategyList";
import { Tabs, type TabItem } from "../components/Tabs";
import { WatchlistWidget } from "../components/WatchlistWidget";
import { CaretLeft } from "../lib/icons";
import { useAppState } from "../state/AppState";

type ForgeDetailTab = "configure" | "watch";

const FORGE_DETAIL_TABS: TabItem[] = [
  { id: "configure", label: "Configure" },
  { id: "watch", label: "Preview Watchlist" },
];

export function StrategyForgePage() {
  const { strategies, createStrategy, duplicateStrategy, deleteStrategy } =
    useAppState();

  const [selectedId, setSelectedId] = useState<string>(
    strategies[0]?.id ?? "",
  );

  // Mobile-only master -> detail: selecting a strategy drills from the list into
  // a detail view (breadcrumb + Configure/Preview tab bar). Desktop/tablet keep
  // the side-by-side grid, so this state is inert above 767px.
  const [isMobile, setIsMobile] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 767px)").matches,
  );
  const [drilledIn, setDrilledIn] = useState(false);
  const [detailTab, setDetailTab] = useState<ForgeDetailTab>("configure");

  useEffect(() => {
    if (typeof window === "undefined") return;

    const media = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(media.matches);

    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  // Keep a valid selection if the selected strategy is removed.
  useEffect(() => {
    if (!strategies.some((strategy) => strategy.id === selectedId)) {
      setSelectedId(strategies[0]?.id ?? "");
    }
  }, [strategies, selectedId]);

  const selectedStrategy = strategies.find(
    (strategy) => strategy.id === selectedId,
  );

  // On mobile, choosing/creating a strategy drills into the Configure detail.
  function openDetail(id: string) {
    setSelectedId(id);
    setDetailTab("configure");
    setDrilledIn(true);
  }

  // Selecting a card just highlights it (on every viewport). On mobile the user
  // then taps Edit in the dock to drill into Configure; on desktop the config
  // panel is already in view.
  function handleSelect(id: string) {
    setSelectedId(id);
  }

  function handleEdit() {
    if (selectedStrategy) openDetail(selectedId);
  }

  function handleCreate() {
    const id = createStrategy();
    if (isMobile) openDetail(id);
    else setSelectedId(id);
  }

  function handleDuplicate(id: string) {
    const newId = duplicateStrategy(id);
    if (!newId) return;
    if (isMobile) openDetail(newId);
    else setSelectedId(newId);
  }

  const header = (
    <header className="page-head">
      <h1>Strategy Forge</h1>
      <p className="page-subtitle">
        Forge your rules, define your conviction, remove your emotions.
      </p>
    </header>
  );

  if (isMobile) {
    // Detail view: breadcrumb + Configure/Preview tab bar (no sticky dock here).
    if (drilledIn && selectedStrategy) {
      return (
        <div className="page forge-page">
          <div className="forge-detail">
            {/* Breadcrumb + page-level tab bar share one row on mobile when they
                fit (flex-wrap drops the tabs to their own line when they
                don't), to conserve vertical space. */}
            <div className="forge-detail-head">
              <button
                type="button"
                className="breadcrumb"
                onClick={() => setDrilledIn(false)}
              >
                <CaretLeft aria-hidden />
                My Strategies
              </button>
              <div className="forge-tab-bar">
                <Tabs
                  items={FORGE_DETAIL_TABS}
                  value={detailTab}
                  onChange={(id) => setDetailTab(id as ForgeDetailTab)}
                  ariaLabel="Strategy detail sections"
                  className="forge-tabs"
                />
              </div>
            </div>
            {detailTab === "configure" ? (
              <div className="forge-config">
                <StrategyForgePanel strategy={selectedStrategy} />
              </div>
            ) : (
              <div className="forge-watch">
                <WatchlistWidget
                  readOnly
                  previewStrategyId={selectedStrategy.id}
                />
              </div>
            )}
          </div>
        </div>
      );
    }

    // List view: the card scrolls with the page, and the action row is lifted out
    // into a viewport-sticky dock (a sibling of the page, i.e. a direct child of
    // .app-main). Scrolling to the end lets the site footer pull up under it.
    return (
      <>
        <div className="page forge-page">
          {header}
          <div className="forge-strategies">
            <StrategyList
              strategies={strategies}
              selectedId={selectedId}
              onSelect={handleSelect}
              onCreate={handleCreate}
              onDuplicate={handleDuplicate}
              onDelete={deleteStrategy}
              showActions={false}
            />
          </div>
        </div>
        <StrategyActions
          className="strategy-dock"
          selectedId={selectedId}
          canDelete={!!selectedStrategy && !selectedStrategy.isDefault}
          onDelete={() => selectedId && deleteStrategy(selectedId)}
          onDuplicate={() => selectedId && handleDuplicate(selectedId)}
          onCreate={handleCreate}
          onEdit={handleEdit}
        />
      </>
    );
  }

  return (
    <div className="page forge-page">
      {header}
      <div className="forge-grid">
        <div className="forge-strategies">
          <StrategyList
            strategies={strategies}
            selectedId={selectedId}
            onSelect={handleSelect}
            onCreate={handleCreate}
            onDuplicate={handleDuplicate}
            onDelete={deleteStrategy}
          />
        </div>

        <div className="forge-config">
          <StrategyForgePanel strategy={selectedStrategy} />
        </div>

        {/* Watch Preview: applied portfolios for the selected strategy; conviction
            still reflects every strategy assigned to each ticker. */}
        <div className="forge-watch">
          <WatchlistWidget
            readOnly
            previewStrategyId={selectedStrategy?.id}
          />
        </div>
      </div>
    </div>
  );
}
