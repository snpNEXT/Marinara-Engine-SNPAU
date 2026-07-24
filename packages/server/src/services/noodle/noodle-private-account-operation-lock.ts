const activeAccountOperations = new Set<string>();

export type NoodlePrivateAccountOperationResult<T> =
  | { acquired: true; value: T }
  | { acquired: false };

/**
 * Serializes identity-sensitive work for one private account in this server process.
 * It intentionally does not coordinate multiple Marinara processes.
 */
export async function tryNoodlePrivateAccountOperation<T>(
  accountId: string,
  operation: () => Promise<T>,
): Promise<NoodlePrivateAccountOperationResult<T>> {
  if (activeAccountOperations.has(accountId)) return { acquired: false };
  activeAccountOperations.add(accountId);
  try {
    return { acquired: true, value: await operation() };
  } finally {
    activeAccountOperations.delete(accountId);
  }
}
