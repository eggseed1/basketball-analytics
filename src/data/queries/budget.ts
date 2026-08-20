/**
 * Soft time budget for secondary / historical provider work.
 * Resolves fallback when the promise exceeds `ms` (does not cancel the
 * underlying work - prefer AbortSignal at the fetch boundary when available).
 */

export async function withBudget<T>(
  promise: Promise<T>,
  ms: number,
  fallback: T
): Promise<{ value: T; timedOut: boolean }> {
  let settled = false;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({ value: fallback, timedOut: true });
    }, ms);
    promise
      .then((value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ value, timedOut: false });
      })
      .catch(() => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ value: fallback, timedOut: false });
      });
  });
}

export async function withBudgetOrThrow<T>(
  promise: Promise<T>,
  ms: number,
  timeoutMessage: string
): Promise<T> {
  const { value, timedOut } = await withBudget(
    promise.then((v) => ({ ok: true as const, v })).catch((e) => ({
      ok: false as const,
      e,
    })),
    ms,
    { ok: false as const, e: new Error(timeoutMessage) }
  );
  if (timedOut) throw new Error(timeoutMessage);
  if (!value.ok) throw value.e;
  return value.v;
}
