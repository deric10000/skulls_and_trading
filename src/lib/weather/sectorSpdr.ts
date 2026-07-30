/**
 * GICS sector → Select Sector SPDR SSOT for Weather V2.
 * Order matches `GICS_SECTORS`. Worker `SECTOR_SPDR_SYMBOLS` must stay aligned.
 */

import { GICS_SECTORS, type GicsSector } from "./taxonomy";

export const GICS_SECTOR_TO_SPDR = {
  Energy: "XLE",
  Materials: "XLB",
  Industrials: "XLI",
  "Consumer Discretionary": "XLY",
  "Consumer Staples": "XLP",
  "Health Care": "XLV",
  Financials: "XLF",
  "Information Technology": "XLK",
  "Communication Services": "XLC",
  Utilities: "XLU",
  "Real Estate": "XLRE",
} as const satisfies Record<GicsSector, string>;

export type SectorSpdrSymbol =
  (typeof GICS_SECTOR_TO_SPDR)[keyof typeof GICS_SECTOR_TO_SPDR];

export const SECTOR_SPDR_SYMBOLS = GICS_SECTORS.map(
  (sector) => GICS_SECTOR_TO_SPDR[sector],
) as SectorSpdrSymbol[];

export function spdrForGicsSector(
  sector: string | null | undefined,
): SectorSpdrSymbol | null {
  if (!sector) return null;
  return (
    (GICS_SECTOR_TO_SPDR as Record<string, SectorSpdrSymbol>)[sector] ?? null
  );
}

export function gicsSectorForSpdr(
  symbol: string | null | undefined,
): GicsSector | null {
  if (!symbol) return null;
  const upper = symbol.toUpperCase();
  for (const sector of GICS_SECTORS) {
    if (GICS_SECTOR_TO_SPDR[sector] === upper) return sector;
  }
  return null;
}

/** Fail fast if the 11↔11 bijection drifts. */
export function assertGicsSectorSpdrMap(): void {
  if (GICS_SECTORS.length !== SECTOR_SPDR_SYMBOLS.length) {
    throw new Error("GICS_SECTORS / SECTOR_SPDR_SYMBOLS length mismatch");
  }
  const seen = new Set<string>();
  for (const sector of GICS_SECTORS) {
    const spdr = GICS_SECTOR_TO_SPDR[sector];
    if (!spdr || seen.has(spdr)) {
      throw new Error(`Invalid or duplicate SPDR for GICS sector ${sector}`);
    }
    seen.add(spdr);
  }
}
