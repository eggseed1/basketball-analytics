type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

const memoryCache = new Map<string, CacheEntry<unknown>>();

const DEFAULT_TTL_MS = 1000 * 60 * 60; // 1 hour — season snapshots change slowly
const DEFAULT_RETRIES = 3;

export interface EspnFetchOptions {
  ttlMs?: number;
  retries?: number;
  signal?: AbortSignal;
}

export async function espnFetchJson<T>(
  url: string,
  options: EspnFetchOptions = {}
): Promise<T> {
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const cached = memoryCache.get(url);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value as T;
  }

  const retries = options.retries ?? DEFAULT_RETRIES;
  let lastError: unknown;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(url, {
        signal: options.signal,
        headers: {
          Accept: "application/json",
          "User-Agent":
            "BasketballAnalytics/0.1 (+local; educational data exploration)",
        },
      });

      if (!response.ok) {
        throw new Error(`ESPN request failed (${response.status}): ${url}`);
      }

      const value = (await response.json()) as T;
      memoryCache.set(url, { value, expiresAt: Date.now() + ttlMs });
      return value;
    } catch (error) {
      lastError = error;
      await delay(400 * (attempt + 1));
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
}
