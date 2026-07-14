import type { DataSource } from "./DataSource";
import { mockDataSource } from "./mock";

export type { DataSource } from "./DataSource";

// The active data source for the whole app. Swap this single binding to an
// ApiDataSource (real-time quotes + live brokerage positions) to go live — no
// consumer changes required. Components and AppState must read live/portfolio
// data through this object, never by importing from `src/data.ts` directly.
//
// When wiring live symbol search: replace `searchTickers` and delete
// `TOP_SEARCH_TICKERS` — never blend mock catalog hits with live results.
export const dataSource: DataSource = mockDataSource;
