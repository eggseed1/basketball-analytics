import {
  sharedClearPrefix,
  sharedGetOrSet,
} from "@/data/cache/shared-ttl-cache";
import { isVercelRuntime, runtimeTimeoutMs } from "./runtime-policy";

const DEFAULT_TTL_MS = 1000 * 60 * 60; // 1 hour - season snapshots change slowly
const DEFAULT_RETRIES = isVercelRuntime() ? 1 : 2;
// Player identity/career calls sit above the first Suspense boundary. Bound a
// cold Vercel miss so local/history fallbacks can still render the route.
const DEFAULT_TIMEOUT_MS = runtimeTimeoutMs(4_000, 2_500);

const inflightCache = new Map<string, Promise<unknown>>();

export interface EspnFetchOptions {
  ttlMs?: number;
  retries?: number;
  signal?: AbortSignal;
  /** Override default AbortSignal timeout (ms). */
  timeoutMs?: number;
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
    return fetchEspnJsonUncached<T>(url, options, ttlMs);
  }

  // Coalesce concurrent page/metadata/provider reads for the same ESPN URL
  // before shared cache / network (cold serverless fan-out).
  const inflight = inflightCache.get(url);
  if (inflight) return inflight as Promise<T>;

  const request = sharedGetOrSet(
    `espn:${url}`,
    { ttlMs, tags: ["espn"] },
    () => fetchEspnJsonUncached<T>(url, options, ttlMs)
  );
  inflightCache.set(url, request);
  try {
    return await request;
  } finally {
    if (inflightCache.get(url) === request) inflightCache.delete(url);
  }
}

async function fetchEspnJsonUncached<T>(
  url: string,
  options: EspnFetchOptions,
  ttlMs: number
): Promise<T> {
  const retries = options.retries ?? DEFAULT_RETRIES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let lastError: unknown;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(url, {
        signal: options.signal ?? AbortSignal.timeout(timeoutMs),
        headers: {
          Accept: "application/json",
          "User-Agent":
            "BasketballAnalytics/0.1 (+local; educational data exploration)",
        },
        // Next.js Data Cache — shared across Vercel instances.
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

      return (await response.json()) as T;
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
  sharedClearPrefix("espn:");
  inflightCache.clear();
}
