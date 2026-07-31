export interface WeatherSelection {
  sector: string | null;
  industry: string | null;
  stock: string | null;
}

/**
 * Reconcile Market Weather selection after its external focus or live data
 * changes. A new external focus intentionally resets the cascade; a data-only
 * refresh preserves the stock the user is already browsing and merely
 * refreshes its taxonomy relationship.
 */
export function reconcileWeatherSelection(args: {
  current: WeatherSelection;
  baseTicker: string | null;
  previousBaseTicker: string | null;
  availableStocks: readonly string[];
  selectionForStock: (ticker: string | null) => WeatherSelection;
}): WeatherSelection {
  const selectedStockWasRemoved =
    args.current.stock != null &&
    !args.availableStocks.includes(args.current.stock);
  if (args.baseTicker !== args.previousBaseTicker || selectedStockWasRemoved) {
    return args.selectionForStock(args.baseTicker);
  }
  if (args.current.stock) {
    return args.selectionForStock(args.current.stock);
  }
  return args.current;
}
