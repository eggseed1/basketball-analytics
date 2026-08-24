/**
 * Cross-instance TTL cache for season aggregates and upstream JSON.
 *
 * Layering:
 *  1. Process memory (fast, warm instances)
 *  2. Next.js Data Cache via `unstable_cache` (shared across Vercel
 *     serverless instances for the same deployment)
 *
 * Outside the Next runtime (tsx scripts, tests) falls back to memory only.
 * Never relies on gitignored disk under `data/cache` / `data/drbl`.
 */

type MemoryEntry<T> = {
  value: T;
  freshUntil: number;
  staleUntil: number;
  refreshing?: boolean;
};

const memory = new Map<string, MemoryEntry<unknown>>();

export type SharedCacheOptions = {
  /** Fresh TTL in ms (also drives Next revalidate seconds). */
  ttlMs: number;
  /** Extra memory-only stale window for SWR within one process. */
  staleMs?: number;
  /** Next.js cache tags for on-demand revalidation. */
  tags?: string[];
};

function revalidateSeconds(ttlMs: number): number {
  return Math.max(60, Math.floor(ttlMs / 1000));
}

async function nextDataCacheGetOrSet<T>(
  key: string,
  ttlMs: number,
  tags: string[],
  factory: () => Promise<T>
): Promise<T> {
  try {
    const { unstable_cache } = await import("next/cache");
    const cached = unstable_cache(factory, [key], {
      revalidate: revalidateSeconds(ttlMs),
      tags: tags.length ? tags : [key],
    });
    return await cached();
  } catch {
    // Scripts / non-Next runtimes: no shared Data Cache.
    return factory();
  }
}

function remember<T>(
  key: string,
  value: T,
  ttlMs: number,
  staleMs: number
): T {
  const now = Date.now();
  memory.set(key, {
    value,
    freshUntil: now + ttlMs,
    staleUntil: now + ttlMs + staleMs,
  });
  return value;
}

/** Force-update process memory (e.g. after a successful upstream write). */
export function sharedRemember<T>(
  key: string,
  value: T,
  options: Pick<SharedCacheOptions, "ttlMs" | "staleMs">
): T {
  return remember(key, value, options.ttlMs, options.staleMs ?? 0);
}

/**
 * Get-or-set with memory L1 + Next Data Cache L2.
 * `factory` must return JSON-serializable data for L2.
 */
export async function sharedGetOrSet<T>(
  key: string,
  options: SharedCacheOptions,
  factory: () => Promise<T>
): Promise<T> {
  const ttlMs = options.ttlMs;
  const staleMs = options.staleMs ?? 0;
  const tags = options.tags ?? [];
  const now = Date.now();
  const hit = memory.get(key) as MemoryEntry<T> | undefined;

  if (hit && hit.freshUntil > now) {
    return hit.value;
  }

  if (hit && hit.staleUntil > now) {
    if (!hit.refreshing) {
      hit.refreshing = true;
      void nextDataCacheGetOrSet(key, ttlMs, tags, factory)
        .then((value) => remember(key, value, ttlMs, staleMs))
        .catch(() => undefined)
        .finally(() => {
          const current = memory.get(key) as MemoryEntry<T> | undefined;
          if (current) current.refreshing = false;
        });
    }
    return hit.value;
  }

  const value = await nextDataCacheGetOrSet(key, ttlMs, tags, factory);
  return remember(key, value, ttlMs, staleMs);
}

/**
 * Bust Next Data Cache tags then remember a fresh value in memory.
 * Used when we actively wrote an archive and must not serve a stale L2 hit.
 */
export async function sharedWriteThrough<T>(
  key: string,
  options: SharedCacheOptions,
  value: T
): Promise<T> {
  sharedRemember(key, value, options);
  try {
    const { revalidateTag } = await import("next/cache");
    for (const tag of options.tags ?? [key]) {
      revalidateTag(tag, { expire: 0 });
    }
  } catch {
    // Outside Next runtime.
  }
  // Repopulate Data Cache with the fresh payload for other instances.
  await nextDataCacheGetOrSet(
    key,
    options.ttlMs,
    options.tags ?? [key],
    async () => value
  ).catch(() => undefined);
  return value;
}

/** Peek process memory only (no Data Cache / no network). */
export function sharedPeek<T>(key: string): T | null {
  const hit = memory.get(key) as MemoryEntry<T> | undefined;
  if (!hit) return null;
  if (Date.now() > hit.staleUntil) return null;
  return hit.value;
}

export function sharedDelete(key: string): void {
  memory.delete(key);
}

export function sharedClearPrefix(prefix: string): void {
  for (const key of memory.keys()) {
    if (key.startsWith(prefix)) memory.delete(key);
  }
}

export function sharedClear(): void {
  memory.clear();
}

/** Stable cache key helper. */
export function sharedCacheKey(
  namespace: string,
  ...parts: Array<string | number | boolean | null | undefined>
): string {
  return [namespace, ...parts.map((p) => String(p ?? ""))].join(":");
}
