import type { ImportCell } from "./portfolioImport";

export interface PortfolioImportFileResult {
  sheets: string[];
  rows?: ImportCell[][];
}

export function readPortfolioImportFile(
  file: File,
  sheet?: string,
): Promise<PortfolioImportFileResult> {
  const worker = new Worker(
    new URL("./portfolioImport.worker.ts", import.meta.url),
    { type: "module" },
  );
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      worker.terminate();
      reject(new Error("The local import preview timed out. Try a smaller file."));
    }, 30_000);
    worker.addEventListener("message", (event) => {
      const response = event.data as {
        id: string;
        ok: boolean;
        sheets?: string[];
        rows?: ImportCell[][];
        message?: string;
      };
      if (response.id !== id) return;
      window.clearTimeout(timer);
      worker.terminate();
      if (!response.ok) {
        reject(new Error(response.message || "This file could not be read safely."));
        return;
      }
      resolve({ sheets: response.sheets ?? [], rows: response.rows });
    });
    worker.addEventListener("error", () => {
      window.clearTimeout(timer);
      worker.terminate();
      reject(new Error("The local import preview could not start."));
    });
    worker.postMessage({ id, file, sheet });
  });
}
