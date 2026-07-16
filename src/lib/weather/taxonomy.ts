/**
 * Canonical GICS sector / industry taxonomy for Market Weather.
 *
 * This is the browsable universe SSOT (11 sectors, 74 industries).
 * `TICKERS[].sector` / `.industry` must use these exact keys so stock cascade
 * and weather readings share one label → one projection.
 */

import { TICKERS } from "../../data";

/** Official GICS sector names (11). */
export const GICS_SECTORS = [
  "Energy",
  "Materials",
  "Industrials",
  "Consumer Discretionary",
  "Consumer Staples",
  "Health Care",
  "Financials",
  "Information Technology",
  "Communication Services",
  "Utilities",
  "Real Estate",
] as const;

export type GicsSector = (typeof GICS_SECTORS)[number];

export interface GicsIndustry {
  name: string;
  sector: GicsSector;
}

/** Official GICS industries (74) with sector parent. */
export const GICS_INDUSTRIES: readonly GicsIndustry[] = [
  { name: "Energy Equipment & Services", sector: "Energy" },
  { name: "Oil, Gas & Consumable Fuels", sector: "Energy" },
  { name: "Chemicals", sector: "Materials" },
  { name: "Construction Materials", sector: "Materials" },
  { name: "Containers & Packaging", sector: "Materials" },
  { name: "Metals & Mining", sector: "Materials" },
  { name: "Paper & Forest Products", sector: "Materials" },
  { name: "Aerospace & Defense", sector: "Industrials" },
  { name: "Building Products", sector: "Industrials" },
  { name: "Construction & Engineering", sector: "Industrials" },
  { name: "Electrical Equipment", sector: "Industrials" },
  { name: "Industrial Conglomerates", sector: "Industrials" },
  { name: "Machinery", sector: "Industrials" },
  { name: "Trading Companies & Distributors", sector: "Industrials" },
  { name: "Commercial Services & Supplies", sector: "Industrials" },
  { name: "Professional Services", sector: "Industrials" },
  { name: "Air Freight & Logistics", sector: "Industrials" },
  { name: "Passenger Airlines", sector: "Industrials" },
  { name: "Marine Transportation", sector: "Industrials" },
  { name: "Ground Transportation", sector: "Industrials" },
  { name: "Transportation Infrastructure", sector: "Industrials" },
  { name: "Automobile Components", sector: "Consumer Discretionary" },
  { name: "Automobiles", sector: "Consumer Discretionary" },
  { name: "Household Durables", sector: "Consumer Discretionary" },
  { name: "Leisure Products", sector: "Consumer Discretionary" },
  { name: "Textiles, Apparel & Luxury Goods", sector: "Consumer Discretionary" },
  { name: "Hotels, Restaurants & Leisure", sector: "Consumer Discretionary" },
  { name: "Diversified Consumer Services", sector: "Consumer Discretionary" },
  { name: "Distributors", sector: "Consumer Discretionary" },
  { name: "Broadline Retail", sector: "Consumer Discretionary" },
  { name: "Specialty Retail", sector: "Consumer Discretionary" },
  { name: "Consumer Staples Distribution & Retail", sector: "Consumer Staples" },
  { name: "Beverages", sector: "Consumer Staples" },
  { name: "Food Products", sector: "Consumer Staples" },
  { name: "Tobacco", sector: "Consumer Staples" },
  { name: "Household Products", sector: "Consumer Staples" },
  { name: "Personal Care Products", sector: "Consumer Staples" },
  { name: "Health Care Equipment & Supplies", sector: "Health Care" },
  { name: "Health Care Providers & Services", sector: "Health Care" },
  { name: "Health Care Technology", sector: "Health Care" },
  { name: "Biotechnology", sector: "Health Care" },
  { name: "Pharmaceuticals", sector: "Health Care" },
  { name: "Life Sciences Tools & Services", sector: "Health Care" },
  { name: "Banks", sector: "Financials" },
  { name: "Financial Services", sector: "Financials" },
  { name: "Consumer Finance", sector: "Financials" },
  { name: "Capital Markets", sector: "Financials" },
  { name: "Mortgage Real Estate Investment Trusts (REITs)", sector: "Financials" },
  { name: "Insurance", sector: "Financials" },
  { name: "IT Services", sector: "Information Technology" },
  { name: "Software", sector: "Information Technology" },
  { name: "Communications Equipment", sector: "Information Technology" },
  {
    name: "Technology Hardware, Storage & Peripherals",
    sector: "Information Technology",
  },
  {
    name: "Electronic Equipment, Instruments & Components",
    sector: "Information Technology",
  },
  {
    name: "Semiconductors & Semiconductor Equipment",
    sector: "Information Technology",
  },
  { name: "Diversified Telecommunication Services", sector: "Communication Services" },
  { name: "Wireless Telecommunication Services", sector: "Communication Services" },
  { name: "Media", sector: "Communication Services" },
  { name: "Entertainment", sector: "Communication Services" },
  { name: "Interactive Media & Services", sector: "Communication Services" },
  { name: "Electric Utilities", sector: "Utilities" },
  { name: "Gas Utilities", sector: "Utilities" },
  { name: "Multi-Utilities", sector: "Utilities" },
  { name: "Water Utilities", sector: "Utilities" },
  {
    name: "Independent Power and Renewable Electricity Producers",
    sector: "Utilities",
  },
  { name: "Diversified REITs", sector: "Real Estate" },
  { name: "Industrial REITs", sector: "Real Estate" },
  { name: "Hotel & Resort REITs", sector: "Real Estate" },
  { name: "Office REITs", sector: "Real Estate" },
  { name: "Health Care REITs", sector: "Real Estate" },
  { name: "Residential REITs", sector: "Real Estate" },
  { name: "Retail REITs", sector: "Real Estate" },
  { name: "Specialized REITs", sector: "Real Estate" },
  { name: "Real Estate Management & Development", sector: "Real Estate" },
] as const;

const SECTOR_SET = new Set<string>(GICS_SECTORS);
const INDUSTRY_BY_NAME = new Map(
  GICS_INDUSTRIES.map((item) => [item.name, item] as const),
);

export function sectors(): readonly string[] {
  return GICS_SECTORS;
}

export function industries(): readonly string[] {
  return GICS_INDUSTRIES.map((item) => item.name);
}

/** Industry → sector map for the full taxonomy. */
export function industrySectorMap(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const item of GICS_INDUSTRIES) map[item.name] = item.sector;
  return map;
}

/** Industries under a sector, alphabetical. */
export function industriesForSector(sector: string): string[] {
  return GICS_INDUSTRIES.filter((item) => item.sector === sector)
    .map((item) => item.name)
    .sort((a, b) => a.localeCompare(b));
}

export function isGicsSector(name: string): boolean {
  return SECTOR_SET.has(name);
}

export function isGicsIndustry(name: string): boolean {
  return INDUSTRY_BY_NAME.has(name);
}

/**
 * Dev assert: every ticker's sector/industry must be a taxonomy key (and the
 * industry must roll up to that sector). Throws on mismatch so cascade labels
 * cannot drift from weather keys.
 */
export function assertTickerTaxonomy(): void {
  for (const [ticker, info] of Object.entries(TICKERS)) {
    if (!info.sector || !isGicsSector(info.sector)) {
      throw new Error(
        `TICKERS.${ticker}.sector "${info.sector}" is not a GICS sector key`,
      );
    }
    if (!info.industry || !isGicsIndustry(info.industry)) {
      throw new Error(
        `TICKERS.${ticker}.industry "${info.industry}" is not a GICS industry key`,
      );
    }
    const parent = INDUSTRY_BY_NAME.get(info.industry)?.sector;
    if (parent !== info.sector) {
      throw new Error(
        `TICKERS.${ticker}: industry "${info.industry}" belongs to "${parent}", not "${info.sector}"`,
      );
    }
  }
}

/** Small stable offset from an industry name (for inherited weather tilts). */
export function industryTiltOffset(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return ((Math.abs(hash) % 7) - 3) * 0.5; // -1.5 … +1.5
}
