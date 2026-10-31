import { withBudget } from "@/data/queries/budget";

type ShellLoader<T> = () => Promise<T | null>;

/** Keep the provider first, then rescue a slow or missing response independently. */
export async function loadGameShellWithFallback<T>({
  primary,
  snapshot,
  fallback,
  primaryMs = 9_000,
  fallbackMs = 7_000,
}: {
  primary: ShellLoader<T>;
  snapshot: ShellLoader<T>;
  fallback: ShellLoader<T>;
  primaryMs?: number;
  fallbackMs?: number;
}): Promise<T | null> {
  const result = await withBudget(
    Promise.resolve().then(primary),
    primaryMs,
    null as T | null
  );
  if (result.value != null) return result.value;

  const rescue = async () => {
    const local = await Promise.resolve().then(snapshot).catch(() => null);
    return local ?? fallback();
  };
  return (await withBudget(rescue(), fallbackMs, null as T | null)).value;
}
