import { describe, expect, it } from "vitest";
import { zipSync, strToU8 } from "fflate";
import {
  assertSingleImportSheet,
  inspectXlsxSafety,
  XlsxSafetyError,
} from "./xlsxSafety";

function workbook(entries: Record<string, string>): File {
  const zipped = zipSync(
    Object.fromEntries(
      Object.entries(entries).map(([name, value]) => [name, strToU8(value)]),
    ),
  );
  return new File([zipped], "book.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

describe("inspectXlsxSafety", () => {
  it("requires exactly one worksheet per import", () => {
    expect(() => assertSingleImportSheet(["Transactions"])).not.toThrow();
    expect(() => assertSingleImportSheet(["January", "February"])).toThrow(
      expect.objectContaining({ code: "sheet-count" }),
    );
  });

  it("rejects formula cells before parsing", async () => {
    const file = workbook({ "xl/worksheets/sheet1.xml": "<worksheet><c><f>A1+1</f><v>2</v></c></worksheet>" });
    await expect(inspectXlsxSafety(file)).rejects.toMatchObject({ code: "formula" } satisfies Partial<XlsxSafetyError>);
  });

  it("rejects external workbook links", async () => {
    const file = workbook({
      "xl/worksheets/sheet1.xml": "<worksheet />",
      "xl/externalLinks/externalLink1.xml": "<externalLink />",
    });
    await expect(inspectXlsxSafety(file)).rejects.toMatchObject({ code: "external-link" } satisfies Partial<XlsxSafetyError>);
  });
});
