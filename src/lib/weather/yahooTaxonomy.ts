/**
 * Map Yahoo Finance assetProfile sector/industry strings onto our GICS
 * taxonomy keys (`taxonomy.ts`). Unmapped values stay null — never invent a
 * sector (e.g. defaulting to Information Technology / Software).
 */

import {
  industries,
  industrySectorMap,
  isGicsIndustry,
  isGicsSector,
  sectors,
} from "./taxonomy";

export type YahooTaxonomyMapResult = {
  /** GICS sector when both keys resolve; else null. */
  sector: string | null;
  /** GICS industry when both keys resolve; else null. */
  industry: string | null;
  providerSector: string | null;
  providerIndustry: string | null;
  /** Why GICS keys are incomplete — for gap logging. */
  gapReason: "missing_provider" | "unmapped_yahoo" | null;
};

/** Yahoo's shorter sector labels → official GICS sector names. */
const YAHOO_SECTOR_TO_GICS: Record<string, string> = {
  "basic materials": "Materials",
  "communication services": "Communication Services",
  "consumer cyclical": "Consumer Discretionary",
  "consumer defensive": "Consumer Staples",
  energy: "Energy",
  "financial services": "Financials",
  financial: "Financials",
  financials: "Financials",
  healthcare: "Health Care",
  "health care": "Health Care",
  industrials: "Industrials",
  "real estate": "Real Estate",
  technology: "Information Technology",
  "information technology": "Information Technology",
  utilities: "Utilities",
  materials: "Materials",
  "consumer discretionary": "Consumer Discretionary",
  "consumer staples": "Consumer Staples",
};

/**
 * Common Yahoo industry labels that don't match GICS names 1:1 after
 * normalization (em dashes, "—Application", etc.).
 */
const YAHOO_INDUSTRY_ALIASES: Record<string, string> = {
  "software application": "Software",
  "software infrastructure": "Software",
  "software applications": "Software",
  "internet content information": "Interactive Media & Services",
  "internet retail": "Broadline Retail",
  "credit services": "Consumer Finance",
  "capital markets": "Capital Markets",
  banks: "Banks",
  "banks diversified": "Banks",
  "banks regional": "Banks",
  "semiconductor equipment materials":
    "Semiconductors & Semiconductor Equipment",
  semiconductors: "Semiconductors & Semiconductor Equipment",
  "computer hardware": "Technology Hardware, Storage & Peripherals",
  "consumer electronics": "Technology Hardware, Storage & Peripherals",
  "information technology services": "IT Services",
  "telecom services": "Diversified Telecommunication Services",
  entertainment: "Entertainment",
  "aerospace defense": "Aerospace & Defense",
  "drug manufacturers general": "Pharmaceuticals",
  "drug manufacturers specialty generic": "Pharmaceuticals",
  biotechnology: "Biotechnology",
  "medical devices": "Health Care Equipment & Supplies",
  "medical instruments supplies": "Health Care Equipment & Supplies",
  "specialty retail": "Specialty Retail",
  "beverages non alcoholic": "Beverages",
  "beverages brewers": "Beverages",
  "beverages wineries distillers": "Beverages",
  "household personal products": "Personal Care Products",
  "packaged foods": "Food Products",
  "oil gas e p": "Oil, Gas & Consumable Fuels",
  "oil gas integrated": "Oil, Gas & Consumable Fuels",
  "oil gas midstream": "Oil, Gas & Consumable Fuels",
  "oil gas refining marketing": "Oil, Gas & Consumable Fuels",
  "oil gas equipment services": "Energy Equipment & Services",
};

function normalizeKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\u2010-\u2015—–−-]+/g, " ")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const GICS_INDUSTRY_BY_NORM = new Map(
  industries().map((name) => [normalizeKey(name), name] as const),
);

const PARENT_BY_INDUSTRY = industrySectorMap();

function mapSector(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const trimmed = raw.trim();
  if (isGicsSector(trimmed)) return trimmed;
  const mapped = YAHOO_SECTOR_TO_GICS[normalizeKey(trimmed)];
  if (mapped && isGicsSector(mapped)) return mapped;
  const hit = sectors().find((s) => normalizeKey(s) === normalizeKey(trimmed));
  return hit ?? null;
}

function mapIndustry(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const trimmed = raw.trim();
  if (isGicsIndustry(trimmed)) return trimmed;
  const norm = normalizeKey(trimmed);
  const alias = YAHOO_INDUSTRY_ALIASES[norm];
  if (alias && isGicsIndustry(alias)) return alias;
  const exact = GICS_INDUSTRY_BY_NORM.get(norm);
  if (exact) return exact;
  // Soft contains: Yahoo often suffixes ("Software—Application").
  let best: { name: string; len: number } | null = null;
  for (const [gicsNorm, gicsName] of GICS_INDUSTRY_BY_NORM) {
    if (norm.includes(gicsNorm) || gicsNorm.includes(norm)) {
      if (!best || gicsNorm.length > best.len) {
        best = { name: gicsName, len: gicsNorm.length };
      }
    }
  }
  return best?.name ?? null;
}

/**
 * Resolve Yahoo assetProfile strings to GICS keys.
 * Sector and industry are independent when possible: a mapped sector is kept
 * even if industry fails. Industry parent can fill sector when sector is blank.
 */
export function mapYahooTaxonomy(
  providerSector: string | null | undefined,
  providerIndustry: string | null | undefined,
): YahooTaxonomyMapResult {
  const rawSector = providerSector?.trim() || null;
  const rawIndustry = providerIndustry?.trim() || null;
  let sector = mapSector(rawSector);
  const industry = mapIndustry(rawIndustry);

  if (industry) {
    const parent = PARENT_BY_INDUSTRY[industry];
    if (parent) {
      // Industry parent is authoritative when Yahoo sector is missing or conflicts.
      if (!sector || sector !== parent) sector = parent;
    }
  }

  const complete = Boolean(sector && industry);
  let gapReason: YahooTaxonomyMapResult["gapReason"] = null;
  if (!complete) {
    gapReason = rawSector || rawIndustry ? "unmapped_yahoo" : "missing_provider";
  }

  return {
    sector,
    industry,
    providerSector: rawSector,
    providerIndustry: rawIndustry,
    gapReason,
  };
}
