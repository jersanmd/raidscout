// ── Concurrency tracker + command timeout ──────────────────
// Prevents any single command from hogging the event loop
// and exposes active count for health monitoring.

let activeCount = 0;

export function getActiveCommandCount(): number {
  return activeCount;
}

/**
 * Wraps an async command handler with:
 * - Active count tracking (incremented on start, decremented on finish)
 * - Hard timeout (if exceeded, the promise rejects)
 * - Error reply to Discord if the command times out
 */
export async function withCommandTracking<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  onTimeout: () => void,
): Promise<T> {
  activeCount++;
  const startTime = Date.now();

  let timer: any;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      reject(new Error(`Command timed out after ${elapsed}s`));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([fn(), timeoutPromise]);
    clearTimeout(timer);
    return result;
  } catch (err) {
    clearTimeout(timer);
    if (err.message?.startsWith("Command timed out")) {
      onTimeout();
    }
    throw err;
  } finally {
    activeCount = Math.max(0, activeCount - 1);
  }
}
