/** Releases a pre-reserved D1 room slot when Durable Object creation fails. */
export async function createReservedRoom<T extends { ok: boolean }>(
  create: () => Promise<T>,
  release: () => Promise<void>,
): Promise<T | undefined> {
  const releaseSafely = async () => {
    try { await release(); } catch { /* Preserve the room-creation result or error. */ }
  };

  try {
    const response = await create();
    if (response.ok) return response;
    await releaseSafely();
    return undefined;
  } catch (error) {
    await releaseSafely();
    throw error;
  }
}
