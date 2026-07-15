import { asyncSearchTickers, freeTierDataSource } from "./freeTier";

// Pass 2 FreeTier binding — live paths use Worker `/api/market/*` (see liveCache).
// Swap this single export for a paid ApiDataSource later without touching UI.
export const dataSource = freeTierDataSource;
export { asyncSearchTickers };
