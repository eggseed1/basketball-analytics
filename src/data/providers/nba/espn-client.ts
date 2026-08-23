import { runtimeTimeoutMs } from "./runtime-policy";

type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

const memoryCache = new Map<string, CacheEntry<unknown>>();
const inflightCache = new Map<string, Promise<unknown>>();

const DEFAULT_TTL_MS = 1000 * 60 * 60; // 1 hour - season snapshots change slowly
const DEFAULT_RETRIES = 2;
// Player identity/career calls sit above the first Suspense boundary. Bound a
// cold Vercel miss so local/history fallbacks can still render the route.
const DEFAULT_TIMEOUT_MS = runtimeTimeoutMs(4_000, 2_500);

export interface EspnFetchOptions {
  ttlMs?: number;
  retries?: number;
  signal?: AbortSignal;
  /** Skip memory cache read (still writes on success unless ttlMs is 0). */
  bypassCache?: boolean;
}

function statusFromError(error: unknown): number | null {
  if (!(error instanceof Error)) return null;
  const m = /ESPN request failed \((\d+)\)/.exec(error.message);
  return m ? Number(m[1]) : null;
}

export async function espnFetchJson<T>(
  url: string,
  options: EspnFetchOptions = {}
): Promise<T> {
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  if (options.bypassCache) {
    memoryCache.delete(url);
  } else {
    const cached = memoryCache.get(url);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value as T;
    }
    // Coalesce concurrent page/metadata/provider reads for the same ESPN URL.
    // The prior cache only stored completed responses, so one player navigation
    // could issue duplicate profile requests during a cold serverless render.
    const inflight = inflightCache.get(url);
    if (inflight) return inflight as Promise<T>;
  }

  const request = fetchEspnJsonUncached<T>(url, ttlMs, options);
  if (!options.bypassCache) inflightCache.set(url, request);
  try {
    return await request;
  } finally {
    if (inflightCache.get(url) === request) inflightCache.delete(url);
  }
}

async function fetchEspnJsonUncached<T>(
  url: string,
  ttlMs: number,
  options: EspnFetchOptions
): Promise<T> {
  const retries = options.retries ?? DEFAULT_RETRIES;
  let lastError: unknown;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(url, {
        signal: options.signal ?? AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
        headers: {
          Accept: "application/json",
          "User-Agent":
            "BasketballAnalytics/0.1 (+local; educational data exploration)",
        },
        // Next.js Data Cache — ignored outside the App Router fetch runtime.
        next: { revalidate: Math.max(60, Math.floor(ttlMs / 1000)) },
      } as RequestInit);

      if (!response.ok) {
        const err = new Error(
          `ESPN request failed (${response.status}): ${url}`
        );
        // 4xx will not succeed on retry - fail fast (esp. 404 box scores).
        if (response.status >= 400 && response.status < 500) {
          throw err;
        }
        throw err;
      }

      const value = (await response.json()) as T;
      memoryCache.set(url, { value, expiresAt: Date.now() + ttlMs });
      return value;
    } catch (error) {
      lastError = error;
      const status = statusFromError(error);
      if (status != null && status >= 400 && status < 500) {
        break;
      }
      if (attempt < retries - 1) {
        await delay(400 * (attempt + 1));
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`ESPN request failed: ${url}`);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function clearEspnCache(): void {
  memoryCache.clear();
  inflightCache.clear();
}
