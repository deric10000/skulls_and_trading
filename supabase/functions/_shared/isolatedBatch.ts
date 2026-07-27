export interface IsolatedBatchOutcome<T> {
  item: T;
  ok: boolean;
  error?: string;
}

export async function runIsolatedBatch<T>(
  values: T[],
  concurrency: number,
  run: (value: T) => Promise<void>,
  onFailure: (value: T, error: string) => Promise<void>,
): Promise<IsolatedBatchOutcome<T>[]> {
  const output = new Array<IsolatedBatchOutcome<T>>(values.length);
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(Math.max(1, concurrency), values.length) },
    async () => {
      while (cursor < values.length) {
        const index = cursor++;
        const value = values[index]!;
        try {
          await run(value);
          output[index] = { item: value, ok: true };
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Unknown batch failure";
          try {
            await onFailure(value, message);
          } catch (failureWriteError) {
            const failureWriteMessage =
              failureWriteError instanceof Error
                ? failureWriteError.message
                : "Unknown failure-write error";
            output[index] = {
              item: value,
              ok: false,
              error: `${message}; failure write: ${failureWriteMessage}`,
            };
            continue;
          }
          output[index] = { item: value, ok: false, error: message };
        }
      }
    },
  );
  await Promise.all(workers);
  return output;
}
