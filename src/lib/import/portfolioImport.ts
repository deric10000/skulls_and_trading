import {
  IMPORT_ROW_LIMIT,
  roundQuantity,
  roundUsd,
  type DraftPortfolioTransaction,
  type DraftTransactionType,
} from "../finance/currentWatchTransactions";

export type ImportCell = string | number | boolean | Date | null | undefined;

export interface ImportReviewIssue {
  row: number;
  code:
    | "limit-exceeded"
    | "missing-value"
    | "invalid-type"
    | "invalid-ticker"
    | "invalid-number"
    | "invalid-date"
    | "timezone-review";
  message: string;
}

export interface ImportSanitizationReport {
  rowsReceived: number;
  rowsRetained: number;
  rowsSkipped: number;
  ignoredColumnCount: number;
  invalidRowCount: number;
  normalizedCellCount: number;
  fractionalRowCount: number;
  ambiguousTimeZoneCount: number;
  distinctTickerCount: number;
}

export interface NormalizeImportResult {
  transactions: DraftPortfolioTransaction[];
  issues: ImportReviewIssue[];
  report: ImportSanitizationReport;
  requiresTimeZoneConfirmation: boolean;
  detectedTimeZones: string[];
  detectedFormat: "standard" | "webull" | "generic";
}

type Field =
  | "type"
  | "ticker"
  | "quantity"
  | "fillPrice"
  | "amount"
  | "filledAt"
  | "timeZone"
  | "status";

const FIELD_ALIASES: Record<Field, ReadonlySet<string>> = {
  type: new Set(["transaction type", "type", "action", "side"]),
  ticker: new Set(["ticker", "ticker symbol", "symbol"]),
  quantity: new Set(["quantity", "qty", "shares", "filled"]),
  fillPrice: new Set(["fill price", "price", "execution price", "avg price", "average price"]),
  amount: new Set(["amount", "cash amount", "usd amount"]),
  filledAt: new Set(["date time", "datetime", "date/time", "filled at", "filled time", "date"]),
  timeZone: new Set(["time zone", "timezone", "tz"]),
  status: new Set(["status", "order status"]),
};

const HEADER_PRIORITY: Partial<Record<Field, Record<string, number>>> = {
  fillPrice: { "avg price": 3, "average price": 3, "fill price": 2, "execution price": 2, price: 1 },
  quantity: { filled: 3, quantity: 2, qty: 2, shares: 2 },
  filledAt: { "filled time": 3, "filled at": 3, "date time": 2, datetime: 2, "date/time": 2, date: 1 },
};

const TRANSACTION_TYPES: Record<string, DraftTransactionType> = {
  buy: "buy",
  bought: "buy",
  purchase: "buy",
  sell: "sell",
  sold: "sell",
  sale: "sell",
  deposit: "deposit",
  contribution: "deposit",
  withdrawal: "withdrawal",
  withdraw: "withdrawal",
  distribution: "withdrawal",
};

function normalizedHeader(value: ImportCell): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s*\/\s*/g, "/")
    .replace(/\s+/g, " ");
}

function fieldForHeader(value: ImportCell): Field | null {
  const header = normalizedHeader(value);
  for (const [field, aliases] of Object.entries(FIELD_ALIASES) as Array<
    [Field, ReadonlySet<string>]
  >) {
    if (aliases.has(header)) return field;
  }
  return null;
}

function numberFromCell(value: ImportCell): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const cleaned = value.trim().replace(/^\$/, "").replace(/,/g, "");
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeTicker(value: ImportCell): string {
  return String(value ?? "").trim().toUpperCase();
}

export function normalizeImportTimeZone(value: ImportCell): string {
  const zone = String(value ?? "").trim();
  if (!zone) return "";
  const common: Record<string, string> = {
    est: "America/New_York",
    edt: "America/New_York",
    et: "America/New_York",
    eastern: "America/New_York",
    "eastern time": "America/New_York",
    "eastern standard time": "America/New_York",
    "eastern daylight time": "America/New_York",
    cst: "America/Chicago",
    cdt: "America/Chicago",
    ct: "America/Chicago",
    central: "America/Chicago",
    "central time": "America/Chicago",
    "central standard time": "America/Chicago",
    "central daylight time": "America/Chicago",
    mst: "America/Denver",
    mdt: "America/Denver",
    mt: "America/Denver",
    mountain: "America/Denver",
    "mountain time": "America/Denver",
    "mountain standard time": "America/Denver",
    "mountain daylight time": "America/Denver",
    arizona: "America/Phoenix",
    "arizona time": "America/Phoenix",
    pst: "America/Los_Angeles",
    pdt: "America/Los_Angeles",
    pt: "America/Los_Angeles",
    pacific: "America/Los_Angeles",
    "pacific time": "America/Los_Angeles",
    "pacific standard time": "America/Los_Angeles",
    "pacific daylight time": "America/Los_Angeles",
    akst: "America/Anchorage",
    akdt: "America/Anchorage",
    akt: "America/Anchorage",
    alaska: "America/Anchorage",
    "alaska time": "America/Anchorage",
    "alaska standard time": "America/Anchorage",
    "alaska daylight time": "America/Anchorage",
    hst: "Pacific/Honolulu",
    ht: "Pacific/Honolulu",
    hawaii: "Pacific/Honolulu",
    "hawaii time": "Pacific/Honolulu",
    "hawaii standard time": "Pacific/Honolulu",
    hast: "America/Adak",
    hadt: "America/Adak",
    aleutian: "America/Adak",
    "aleutian time": "America/Adak",
    utc: "UTC",
    gmt: "UTC",
  };
  return common[zone.toLowerCase()] ?? zone;
}

function isIanaTimeZone(value: string): boolean {
  if (!value) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

function splitEmbeddedTimeZone(value: string): {
  dateTime: string;
  timeZone: string;
  hadZoneToken: boolean;
} {
  const trimmed = value.trim();
  const match = trimmed.match(/\s+([A-Za-z]{2,8}|(?:America|Pacific)\/[A-Za-z_]+)$/);
  if (!match || /^(am|pm)$/i.test(match[1])) {
    return { dateTime: trimmed, timeZone: "", hadZoneToken: false };
  }
  const candidate = normalizeImportTimeZone(match[1]);
  return {
    dateTime: trimmed.slice(0, match.index).trim(),
    timeZone: isIanaTimeZone(candidate) ? candidate : "",
    hadZoneToken: true,
  };
}

function localParts(value: string): number[] | null {
  const yearFirst = value.trim().match(
    /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?$/i,
  );
  const usFirst = value.trim().match(
    /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?$/i,
  );
  const match = yearFirst ?? usFirst;
  if (!match) return null;
  const year = Number(yearFirst ? match[1] : match[3]);
  const month = Number(yearFirst ? match[2] : match[1]);
  const day = Number(yearFirst ? match[3] : match[2]);
  let hour = Number(match[4] ?? 0);
  const minute = Number(match[5] ?? 0);
  const second = Number(match[6] ?? 0);
  const meridiem = match[7]?.toUpperCase();
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    hour = hour % 12 + (meridiem === "PM" ? 12 : 0);
  }
  if (
    month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59 || second > 59
  ) return null;
  const calendarCheck = new Date(Date.UTC(year, month - 1, day));
  if (
    calendarCheck.getUTCFullYear() !== year ||
    calendarCheck.getUTCMonth() !== month - 1 ||
    calendarCheck.getUTCDate() !== day
  ) return null;
  return [year, month, day, hour, minute, second];
}

/** Convert unambiguous wall-clock components in an IANA zone to a UTC instant. */
function zonedPartsToIso(
  parts: number[],
  timeZone: string,
): { iso: string | null; ambiguous: boolean } {
  const [year, month, day, hour, minute, second] = parts;
  let guess = Date.UTC(year, month - 1, day, hour, minute, second);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const renderedEpoch = (timestamp: number) => {
    const values = Object.fromEntries(
      formatter
        .formatToParts(new Date(timestamp))
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, Number(part.value)]),
    );
    return Date.UTC(
      values.year,
      values.month - 1,
      values.day,
      values.hour,
      values.minute,
      values.second,
    );
  };
  const desired = Date.UTC(year, month - 1, day, hour, minute, second);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    guess += desired - renderedEpoch(guess);
  }
  if (renderedEpoch(guess) !== desired) return { iso: null, ambiguous: false };
  const oneHour = 60 * 60 * 1_000;
  if (
    renderedEpoch(guess - oneHour) === desired ||
    renderedEpoch(guess + oneHour) === desired
  ) {
    // A fall-back clock hour has two real instants. Require an explicit offset
    // in the source value rather than silently choosing one occurrence.
    return { iso: null, ambiguous: true };
  }
  const iso = new Date(guess).toISOString();
  return {
    iso: Number.isNaN(Date.parse(iso)) ? null : iso,
    ambiguous: false,
  };
}

export function resolveImportDateTime(
  value: ImportCell,
  timeZone: string,
): { iso: string | null; ambiguous: boolean } {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    if (!timeZone) return { iso: value.toISOString(), ambiguous: true };
    const parts = [
      value.getFullYear(),
      value.getMonth() + 1,
      value.getDate(),
      value.getHours(),
      value.getMinutes(),
      value.getSeconds(),
    ];
    return zonedPartsToIso(parts, timeZone);
  }
  const raw = String(value ?? "").trim();
  if (!raw) return { iso: null, ambiguous: !timeZone };
  if (/([zZ]|[+-]\d{2}:?\d{2})$/.test(raw)) {
    const parsed = new Date(raw);
    return {
      iso: Number.isNaN(parsed.getTime()) ? null : parsed.toISOString(),
      ambiguous: false,
    };
  }
  const { dateTime } = splitEmbeddedTimeZone(raw);
  if (!timeZone || !isIanaTimeZone(timeZone)) {
    return { iso: null, ambiguous: true };
  }
  const parts = localParts(dateTime);
  if (!parts) return { iso: null, ambiguous: false };
  return zonedPartsToIso(parts, timeZone);
}

export function parseCsv(text: string): ImportCell[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  row.push(cell.replace(/\r$/, ""));
  if (quoted) {
    throw new Error("This CSV has an unclosed quoted value.");
  }
  if (row.some((value) => value.trim() !== "")) rows.push(row);
  return rows;
}

export function normalizeImportRows(
  rows: ImportCell[][],
  options: { batchId: string; confirmedTimeZone?: string },
): NormalizeImportResult {
  const header = rows[0] ?? [];
  const columns = new Map<Field, number>();
  const columnPriorities = new Map<Field, number>();
  header.forEach((value, index) => {
    const field = fieldForHeader(value);
    if (!field) return;
    const priority = HEADER_PRIORITY[field]?.[normalizedHeader(value)] ?? 1;
    if (priority > (columnPriorities.get(field) ?? -1)) {
      columns.set(field, index);
      columnPriorities.set(field, priority);
    }
  });
  const selectedColumns = new Set(columns.values());
  const ignoredColumnCount = header.reduce<number>(
    (count, _value, index) => count + (selectedColumns.has(index) ? 0 : 1),
    0,
  );
  const normalizedHeaders = new Set(header.map(normalizedHeader));
  const detectedFormat =
    ["symbol", "side", "status", "filled", "avg price", "filled time"].every((name) =>
      normalizedHeaders.has(name)
    )
      ? "webull"
      : PORTFOLIO_IMPORT_TEMPLATE_HEADERS.every((name) =>
          normalizedHeaders.has(normalizedHeader(name))
        )
        ? "standard"
        : "generic";
  const populatedRows = rows
    .slice(1)
    .map((row, index) => ({ row, rowNumber: index + 2 }))
    .filter(({ row }) =>
      row.some((value) => String(value ?? "").trim() !== ""),
    );
  if (populatedRows.length > IMPORT_ROW_LIMIT) {
    return {
      transactions: [],
      issues: [{
        row: 1,
        code: "limit-exceeded",
        message: `This file contains ${populatedRows.length.toLocaleString()} data rows; the current limit is ${IMPORT_ROW_LIMIT.toLocaleString()}.`,
      }],
      requiresTimeZoneConfirmation: false,
      detectedTimeZones: [],
      detectedFormat,
      report: {
        rowsReceived: populatedRows.length,
        rowsRetained: 0,
        rowsSkipped: 0,
        ignoredColumnCount,
        invalidRowCount: 1,
        normalizedCellCount: 0,
        fractionalRowCount: 0,
        ambiguousTimeZoneCount: 0,
        distinctTickerCount: 0,
      },
    };
  }
  const body = populatedRows.slice(0, IMPORT_ROW_LIMIT);
  const transactions: DraftPortfolioTransaction[] = [];
  const issues: ImportReviewIssue[] = [];
  const detectedTimeZones = new Set<string>();
  let normalizedCellCount = 0;
  let fractionalRowCount = 0;
  let ambiguousTimeZoneCount = 0;
  let rowsSkipped = 0;

  const cell = (row: ImportCell[], field: Field) => {
    const index = columns.get(field);
    return index == null ? undefined : row[index];
  };

  body.forEach(({ row, rowNumber }) => {
    const rawType = String(cell(row, "type") ?? "").trim().toLowerCase();
    const type = TRANSACTION_TYPES[rawType];
    if (!type) {
      issues.push({ row: rowNumber, code: "invalid-type", message: "Choose Buy, Sell, Deposit, or Withdrawal." });
      return;
    }
    if (rawType !== type) normalizedCellCount += 1;
    const rowStatus = String(cell(row, "status") ?? "").trim().toLowerCase();
    if (
      columns.has("status") &&
      type !== "deposit" &&
      type !== "withdrawal" &&
      !["filled", "completed", "executed"].includes(rowStatus) &&
      !(Number(numberFromCell(cell(row, "quantity"))) > 0)
    ) {
      rowsSkipped += 1;
      return;
    }
    const rowZone = normalizeImportTimeZone(cell(row, "timeZone"));
    const rawFilledAt = cell(row, "filledAt");
    const rawFilledAtText = String(rawFilledAt ?? "").trim();
    const embedded = splitEmbeddedTimeZone(rawFilledAtText);
    const hasExplicitOffset = /([zZ]|[+-]\d{2}:?\d{2})$/.test(rawFilledAtText);
    const timeZone = rowZone || embedded.timeZone || (hasExplicitOffset ? "UTC" : "") || options.confirmedTimeZone || "";
    if (timeZone) detectedTimeZones.add(timeZone);
    if (!timeZone) {
      issues.push({
        row: rowNumber,
        code: "timezone-review",
        message: "Confirm the time zone before this row can be imported.",
      });
      ambiguousTimeZoneCount += 1;
      return;
    }
    const date = resolveImportDateTime(rawFilledAt, timeZone);
    if (!date.iso) {
      issues.push({
        row: rowNumber,
        code: date.ambiguous ? "timezone-review" : "invalid-date",
        message: date.ambiguous
          ? "Confirm the time zone before this row can be imported."
          : "Review the date and time.",
      });
      if (date.ambiguous) ambiguousTimeZoneCount += 1;
      return;
    }

    if (type === "buy" || type === "sell") {
      const ticker = normalizeTicker(cell(row, "ticker"));
      const quantity = numberFromCell(cell(row, "quantity"));
      const fillPrice = numberFromCell(cell(row, "fillPrice"));
      if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(ticker)) {
        issues.push({ row: rowNumber, code: "invalid-ticker", message: "Review this ticker symbol." });
        return;
      }
      if (!(quantity != null && quantity > 0) || !(fillPrice != null && fillPrice > 0)) {
        issues.push({ row: rowNumber, code: "invalid-number", message: "Buy and Sell rows need quantity and fill price above zero." });
        return;
      }
      const normalizedQuantity = roundQuantity(quantity);
      const normalizedPrice = roundUsd(fillPrice);
      if (normalizedQuantity !== quantity || normalizedPrice !== fillPrice) normalizedCellCount += 1;
      if (!Number.isInteger(normalizedQuantity)) fractionalRowCount += 1;
      transactions.push({
        id: `${options.batchId}:row:${rowNumber}`,
        type,
        ticker,
        quantity: normalizedQuantity,
        fillPrice: normalizedPrice,
        filledAt: date.iso,
        timeZone,
        source: "import",
        importBatchId: options.batchId,
        sourceRow: rowNumber,
      });
      return;
    }

    const amount = numberFromCell(cell(row, "amount"));
    if (!(amount != null && amount > 0)) {
      issues.push({ row: rowNumber, code: "invalid-number", message: "Deposit and Withdrawal rows need a USD amount above zero." });
      return;
    }
    const normalizedAmount = roundUsd(amount);
    if (normalizedAmount !== amount) normalizedCellCount += 1;
    transactions.push({
      id: `${options.batchId}:row:${rowNumber}`,
      type,
      amount: normalizedAmount,
      filledAt: date.iso,
      timeZone,
      source: "import",
      importBatchId: options.batchId,
      sourceRow: rowNumber,
    });
  });

  const tickers = new Set(
    transactions.flatMap((transaction) => (transaction.ticker ? [transaction.ticker] : [])),
  );
  return {
    transactions,
    issues,
    requiresTimeZoneConfirmation: ambiguousTimeZoneCount > 0,
    detectedTimeZones: [...detectedTimeZones],
    detectedFormat,
    report: {
      rowsReceived: populatedRows.length,
      rowsRetained: transactions.length,
      rowsSkipped,
      ignoredColumnCount,
      invalidRowCount: issues.length,
      normalizedCellCount,
      fractionalRowCount,
      ambiguousTimeZoneCount,
      distinctTickerCount: tickers.size,
    },
  };
}

export const PORTFOLIO_IMPORT_TEMPLATE_HEADERS = [
  "Transaction Type",
  "Ticker",
  "Quantity",
  "Fill Price",
  "Amount",
  "Date / Time",
  "Time Zone",
] as const;

export function portfolioImportTemplateCsv(): string {
  return [
    PORTFOLIO_IMPORT_TEMPLATE_HEADERS.join(","),
    "Deposit,,,,5000,2026-01-10 09:00,EST",
    "Buy,XYZ,10,10.52,,2026-01-10 16:30,EST",
  ].join("\n");
}
