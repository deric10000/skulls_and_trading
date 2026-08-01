const MAX_XLSX_INFLATED_BYTES = 25 * 1024 * 1024;
const MAX_XLSX_ENTRY_BYTES = 10 * 1024 * 1024;

export type XlsxSafetyCode =
  | "encrypted-or-invalid"
  | "expanded-size"
  | "macro"
  | "formula"
  | "external-link"
  | "sheet-count";

export class XlsxSafetyError extends Error {
  constructor(public readonly code: XlsxSafetyCode, message: string) {
    super(message);
  }
}

export function assertSingleImportSheet(sheetNames: readonly string[]): void {
  if (sheetNames.length === 1) return;
  throw new XlsxSafetyError(
    "sheet-count",
    "Choose an XLSX file with exactly one worksheet.",
  );
}

/** Read central-directory sizes before inflating so a small ZIP bomb is rejected. */
function assertSafeExpandedSize(bytes: Uint8Array): void {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let total = 0;
  let entries = 0;
  for (let offset = 0; offset + 46 <= view.byteLength; offset += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) continue;
    const expanded = view.getUint32(offset + 24, true);
    total += expanded;
    entries += 1;
    if (expanded > MAX_XLSX_ENTRY_BYTES || total > MAX_XLSX_INFLATED_BYTES) {
      throw new XlsxSafetyError(
        "expanded-size",
        "This workbook expands beyond the safe import limit.",
      );
    }
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    offset += 45 + nameLength + extraLength + commentLength;
  }
  if (entries === 0) {
    throw new XlsxSafetyError(
      "encrypted-or-invalid",
      "This workbook is encrypted, damaged, or not a supported XLSX file.",
    );
  }
}

/**
 * Local-only structural inspection. No filename, cell value, or raw XML is
 * returned to callers or suitable for logs.
 */
export async function inspectXlsxSafety(file: File): Promise<void> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  assertSafeExpandedSize(bytes);
  let entries: Record<string, Uint8Array>;
  try {
    const { unzipSync } = await import("fflate");
    entries = unzipSync(bytes);
  } catch (error) {
    if (error instanceof XlsxSafetyError) throw error;
    throw new XlsxSafetyError(
      "encrypted-or-invalid",
      "This workbook is encrypted, damaged, or not a supported XLSX file.",
    );
  }
  const names = Object.keys(entries);
  if (
    names.some((name) =>
      /(^|\/)(vbaProject\.bin|macrosheets\/|xlmMacros\/)/i.test(name),
    )
  ) {
    throw new XlsxSafetyError("macro", "Macro-enabled workbooks cannot be imported.");
  }
  if (names.some((name) => /^xl\/externalLinks\//i.test(name))) {
    throw new XlsxSafetyError(
      "external-link",
      "Remove external workbook links before importing.",
    );
  }
  const decoder = new TextDecoder();
  for (const [name, contents] of Object.entries(entries)) {
    if (!/^xl\/worksheets\/.*\.xml$/i.test(name)) continue;
    const xml = decoder.decode(contents);
    if (/<f(?:\s|\/?>)/i.test(xml)) {
      throw new XlsxSafetyError(
        "formula",
        "Replace formulas with their displayed values before importing.",
      );
    }
  }
}
