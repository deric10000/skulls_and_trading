/// <reference lib="webworker" />

import readXlsxFile, { readSheetNames } from "read-excel-file/web-worker";
import { parseCsv, type ImportCell } from "./portfolioImport";
import {
  assertSingleImportSheet,
  inspectXlsxSafety,
  XlsxSafetyError,
} from "./xlsxSafety";

type Request = {
  id: string;
  file: File;
  sheet?: string;
};

type Response =
  | { id: string; ok: true; sheets: string[]; rows?: ImportCell[][] }
  | { id: string; ok: false; message: string };

self.addEventListener("message", (event: MessageEvent<Request>) => {
  const { id, file, sheet } = event.data;
  void (async () => {
    try {
      const extension = file.name.toLowerCase().split(".").pop();
      if (extension === "csv") {
        const rows = parseCsv(await file.text());
        self.postMessage({ id, ok: true, sheets: ["CSV"], rows } satisfies Response);
        return;
      }
      await inspectXlsxSafety(file);
      const sheets = await readSheetNames(file);
      assertSingleImportSheet(sheets);
      const selected = sheet || sheets[0];
      if (!selected) throw new Error("No readable sheets were found.");
      const rows = (await readXlsxFile(file, { sheet: selected })) as ImportCell[][];
      self.postMessage({ id, ok: true, sheets, rows } satisfies Response);
    } catch (error) {
      self.postMessage({
        id,
        ok: false,
        message:
          error instanceof XlsxSafetyError
            ? error.message
            : "This file could not be read safely. Check the template and try again.",
      } satisfies Response);
    }
  })();
});

export {};
