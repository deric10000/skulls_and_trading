const workspaceMutationChains = new Map<string, Promise<void>>();

/**
 * Orders every durable workspace mutation for one account. This includes the
 * broad compatibility save and narrow portfolio RPCs so an older workspace
 * snapshot cannot land after an atomic portfolio update.
 */
export function serializeWorkspaceMutation<T>(
  userId: string,
  mutation: () => Promise<T>,
): Promise<T> {
  const previous = workspaceMutationChains.get(userId) ?? Promise.resolve();
  const result = previous.catch(() => undefined).then(mutation);
  const tail = result.then(
    () => undefined,
    () => undefined,
  );
  workspaceMutationChains.set(userId, tail);
  void tail.finally(() => {
    if (workspaceMutationChains.get(userId) === tail) {
      workspaceMutationChains.delete(userId);
    }
  });
  return result;
}
