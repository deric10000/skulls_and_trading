import { describe, expect, it } from "vitest";
import {
  normalizeImportRows,
  normalizeImportTimeZone,
  parseCsv,
  portfolioImportTemplateCsv,
  resolveImportDateTime,
} from "./portfolioImport";

describe("portfolio import normalization", () => {
  it.each([
    ["EST", "America/New_York"],
    ["Central Time", "America/Chicago"],
    ["MST", "America/Denver"],
    ["Arizona", "America/Phoenix"],
    ["PST", "America/Los_Angeles"],
    ["AKST", "America/Anchorage"],
    ["Hawaii", "Pacific/Honolulu"],
    ["HADT", "America/Adak"],
  ])("normalizes the familiar U.S. zone %s", (input, expected) => {
    expect(normalizeImportTimeZone(input)).toBe(expected);
  });

  it("uses EST in the downloadable template while retaining the allowlist", () => {
    const template = portfolioImportTemplateCsv();
    expect(template.split("\n")[0]).toBe(
      "Transaction Type,Ticker,Quantity,Fill Price,Amount,Date / Time,Time Zone",
    );
    expect(template).not.toContain("America/New_York");
    expect(template.match(/,EST/g)).toHaveLength(2);
  });

  it("rejects an unclosed quoted CSV value", () => {
    expect(() => parseCsv('Type,Ticker\nBuy,"XYZ')).toThrow(
      "unclosed quoted value",
    );
  });

  it("retains only allowlisted fields and reports ignored columns", () => {
    const rows = parseCsv(
      "Transaction Type,Ticker,Qty,Fill Price,Amount,Date / Time,Time Zone,Account Number,Name\n" +
        "Deposit,,,,5000,2026-01-01 09:00,America/New_York,secret,Jane\n" +
        "Buy,xyz,1.25,10.527,,2026-01-02 10:30,America/New_York,secret,Jane",
    );
    const result = normalizeImportRows(rows, { batchId: "batch" });
    expect(result.issues).toEqual([]);
    expect(result.transactions).toHaveLength(2);
    expect(result.transactions[1]).toMatchObject({
      ticker: "XYZ",
      quantity: 1.25,
      fillPrice: 10.53,
    });
    expect(result.report.ignoredColumnCount).toBe(2);
    expect(result.report.fractionalRowCount).toBe(1);
  });

  it("requires confirmation for a wall-clock date without a zone", () => {
    const result = normalizeImportRows(
      parseCsv("Type,Ticker,Quantity,Price,Date / Time\nBuy,XYZ,1,10,2026-01-02 10:30"),
      { batchId: "batch" },
    );
    expect(result.requiresTimeZoneConfirmation).toBe(true);
    expect(result.issues[0]?.code).toBe("timezone-review");
    expect(result.transactions).toEqual([]);
  });

  it("accepts an explicit UTC offset without asking for a redundant zone", () => {
    const result = normalizeImportRows(
      parseCsv(
        "Type,Ticker,Quantity,Price,Date / Time\nBuy,XYZ,1,10,2026-01-02T10:30:00-05:00",
      ),
      { batchId: "batch" },
    );
    expect(result.requiresTimeZoneConfirmation).toBe(false);
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0]).toMatchObject({
      filledAt: "2026-01-02T15:30:00.000Z",
      timeZone: "UTC",
    });
  });

  it.each([
    ["07/30/2026 18:31:17", "America/New_York", "2026-07-30T22:31:17.000Z"],
    ["07/30/2026 6:31:17 PM", "America/New_York", "2026-07-30T22:31:17.000Z"],
    ["07/30/2026 18:31:17 EDT", "", "2026-07-30T22:31:17.000Z"],
  ])("normalizes common U.S. date/time input %s", (value, zone, expected) => {
    expect(resolveImportDateTime(value, zone || normalizeImportTimeZone("EDT"))).toEqual({
      iso: expected,
      ambiguous: false,
    });
  });

  it("ingests a Webull-shaped export without requiring template edits", () => {
    const rows = parseCsv(
      "Name,Symbol,Side,Status,Filled,Total Qty,Price,Avg Price,Time-in-Force,Placed Time,Filled Time\n" +
        "Example Corp,XYZ,Buy,Filled,1.25,2,Market,10.527,DAY,07/30/2026 18:30:00 EDT,07/30/2026 18:31:17 EDT\n" +
        "Example Corp,XYZ,Sell,Cancelled,0,1,Market,0,DAY,07/31/2026 10:00:00 EDT,07/31/2026 10:00:00 EDT\n" +
        "Example Corp,XYZ,Sell,Cancelled,0.25,1,Market,11.10,DAY,07/31/2026 10:00:00 EDT,07/31/2026 10:01:00 EDT",
    );
    const result = normalizeImportRows(rows, { batchId: "batch" });
    expect(result.detectedFormat).toBe("webull");
    expect(result.requiresTimeZoneConfirmation).toBe(false);
    expect(result.issues).toEqual([]);
    expect(result.transactions).toHaveLength(2);
    expect(result.transactions[0]).toMatchObject({
      type: "buy",
      ticker: "XYZ",
      quantity: 1.25,
      fillPrice: 10.53,
      timeZone: "America/New_York",
    });
    expect(result.transactions[1]).toMatchObject({
      type: "sell",
      quantity: 0.25,
      fillPrice: 11.1,
    });
    expect(result.report.rowsSkipped).toBe(1);
    expect(result.report.ignoredColumnCount).toBe(5);
  });

  it("does not apply the 40-ticker market-data ceiling to closed historical symbols", () => {
    const rows = [
      ["Type", "Ticker", "Quantity", "Price", "Date / Time", "Time Zone"],
      ...Array.from({ length: 41 }, (_, index) => [
        "Buy",
        `T${index}`,
        1,
        10,
        `2026-01-02 10:${String(index).padStart(2, "0")}`,
        "UTC",
      ]),
    ];
    const result = normalizeImportRows(rows, { batchId: "batch" });
    expect(result.report.distinctTickerCount).toBe(41);
    expect(result.issues).toEqual([]);
  });

  it("blocks rather than truncates files above the row limit", () => {
    const rows = [
      ["Type", "Ticker", "Quantity", "Price", "Date / Time", "Time Zone"],
      ...Array.from({ length: 5_001 }, (_, index) => [
        "Buy",
        "XYZ",
        1,
        10,
        `2026-01-02 10:${String(index % 60).padStart(2, "0")}`,
        "UTC",
      ]),
    ];
    const result = normalizeImportRows(rows, { batchId: "batch" });
    expect(result.report.rowsReceived).toBe(5_001);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "limit-exceeded" }),
    );
  });

  it("rejects nonexistent and ambiguous daylight-saving wall times", () => {
    expect(
      resolveImportDateTime("2026-03-08 02:30", "America/New_York"),
    ).toEqual({ iso: null, ambiguous: false });
    expect(
      resolveImportDateTime("2026-11-01 01:30", "America/New_York"),
    ).toEqual({ iso: null, ambiguous: true });
    expect(
      resolveImportDateTime("2026-11-01T01:30:00-04:00", ""),
    ).toEqual({ iso: "2026-11-01T05:30:00.000Z", ambiguous: false });
  });
});
