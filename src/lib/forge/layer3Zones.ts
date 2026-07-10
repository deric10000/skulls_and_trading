import type { RuleChip, RuleTag, StatusType } from "../../types";

/**
 * Layer 3 zone overlays — Trim Zone / Add Zone / Go to Cash. Each stores
 * independent chip/tag copies on the strategy; none feed conviction math.
 * Evaluation lives in `zoneTriggers.ts` (fail → fire). Surfaces: Trim/Add on
 * ticker watch-align; Go to Cash on portfolio StatusBadge only.
 */
export type Layer3ZoneId = "trimZone" | "addZone" | "goToCash";

export type Layer3ZoneFields = {
  rules: RuleChip[];
  tags: RuleTag[];
};

export type Layer3ZoneMeta = {
  id: Layer3ZoneId;
  /** StatusType key (short). */
  status: Extract<StatusType, "Trim Zone" | "Add Zone" | "Go to Cash">;
  /** Forge-box / modal display title (Go to Cash includes SICADFU). */
  title: string;
  /** Short name used in sentences ("Trim Zone", "Add Zone", …). */
  shortName: string;
  modalTitle: string;
  titleId: string;
  intro: string;
  infoBody: string;
  boxInfoBody: string;
  emptyBox: string;
  emptyTable: string;
  myPlanTooltip: string;
  myPlanPlaceholder: string;
  blankChipLabel: string;
  tagsHeading: string;
  idPrefix: string;
  /** Strategy field names for commit/snapshot. */
  rulesKey: "trimZoneRules" | "addZoneRules" | "goToCashRules";
  tagsKey: "trimZoneTags" | "addZoneTags" | "goToCashTags";
};

export const LAYER3_ZONE_ORDER: Layer3ZoneId[] = [
  "trimZone",
  "addZone",
  "goToCash",
];

export const TICKER_ZONE_STATUSES: StatusType[] = ["Trim Zone", "Add Zone"];
export const PORTFOLIO_ZONE_STATUSES: StatusType[] = ["Go to Cash"];

export const LAYER3_ZONES: Record<Layer3ZoneId, Layer3ZoneMeta> = {
  trimZone: {
    id: "trimZone",
    status: "Trim Zone",
    title: "Trim Zone",
    shortName: "Trim Zone",
    modalTitle: "Trim Zone Rules",
    titleId: "trim-zone-table-title",
    intro: "Add rules that fire the Trim Zone label.",
    infoBody:
      "Trim Zone rules decide when the Trim Zone label fires. They are independent copies — changing a value here does not change conviction scoring or the original category rule.",
    boxInfoBody:
      "Independent overlay rules that decide when the Trim Zone label fires. Copies from other categories do not change conviction scoring — you can set different thresholds here than on the original rule.",
    emptyBox: "No Trim Zone rules yet — use the edit icon to add them.",
    emptyTable:
      "No Trim Zone rules yet — use Add Rule to create a blank rule or copy one from another category.",
    myPlanTooltip:
      "Write, in your words, what you plan to do if this Trim Zone rule is broken.",
    myPlanPlaceholder: "What will you do if this Trim Zone rule breaks?",
    blankChipLabel: "New Trim Rule",
    tagsHeading: "Trim Zone Tags",
    idPrefix: "trim",
    rulesKey: "trimZoneRules",
    tagsKey: "trimZoneTags",
  },
  addZone: {
    id: "addZone",
    status: "Add Zone",
    title: "Add Zone",
    shortName: "Add Zone",
    modalTitle: "Add Zone Rules",
    titleId: "add-zone-table-title",
    intro: "Add rules that fire the Add Zone label.",
    infoBody:
      "Add Zone rules decide when the Add Zone label fires. They are independent copies — changing a value here does not change conviction scoring or the original category rule.",
    boxInfoBody:
      "Independent overlay rules that decide when the Add Zone label fires. Copies from other categories do not change conviction scoring — you can set different thresholds here than on the original rule.",
    emptyBox: "No Add Zone rules yet — use the edit icon to add them.",
    emptyTable:
      "No Add Zone rules yet — use Add Rule to create a blank rule or copy one from another category.",
    myPlanTooltip:
      "Write, in your words, what you plan to do if this Add Zone rule is broken.",
    myPlanPlaceholder: "What will you do if this Add Zone rule breaks?",
    blankChipLabel: "New Add Rule",
    tagsHeading: "Add Zone Tags",
    idPrefix: "add",
    rulesKey: "addZoneRules",
    tagsKey: "addZoneTags",
  },
  goToCash: {
    id: "goToCash",
    status: "Go to Cash",
    title: "Go to Cash - SICADFU",
    shortName: "Go to Cash",
    modalTitle: "Go to Cash Rules",
    titleId: "go-to-cash-table-title",
    intro: "Add rules that fire the Go to Cash - SICADFU label.",
    infoBody:
      "Go to Cash rules decide when the Go to Cash - SICADFU label fires. They are independent copies — changing a value here does not change conviction scoring or the original category rule.",
    boxInfoBody:
      "Independent overlay rules that decide when the Go to Cash - SICADFU label fires. Copies from other categories do not change conviction scoring — you can set different thresholds here than on the original rule.",
    emptyBox: "No Go to Cash rules yet — use the edit icon to add them.",
    emptyTable:
      "No Go to Cash rules yet — use Add Rule to create a blank rule or copy one from another category.",
    myPlanTooltip:
      "Write, in your words, what you plan to do if this Go to Cash rule is broken.",
    myPlanPlaceholder: "What will you do if this Go to Cash rule breaks?",
    blankChipLabel: "New Go to Cash Rule",
    tagsHeading: "Go to Cash Tags",
    idPrefix: "cash",
    rulesKey: "goToCashRules",
    tagsKey: "goToCashTags",
  },
};
