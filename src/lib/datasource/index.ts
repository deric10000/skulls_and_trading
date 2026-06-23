import type { DataSource } from "./DataSource";
import { mockDataSource } from "./mock";

export type { DataSource } from "./DataSource";

// The active data source for the whole app. Swap this single binding to an
// ApiDataSource (real-time quotes + live brokerage positions) to go live — no
// consumer changes required. Components and AppState must read live/portfolio
// data through this object, never by importing from `src/data.ts` directly.
export const dataSource: DataSource = mockDataSource;
