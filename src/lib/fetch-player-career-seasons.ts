/**
 * Client fetch of `/api/players/[id]/seasons` with retries.
 *
 * Cold edge hits can return an empty `data: []` under the career budget even
 * when the player has a full career. Callers should not treat the first empty
 * response as final.
 */
import type { PlayerSeason } from "@/data/types";

const DEFAULT_ATTEMPTS = 3;
const DEFAULT_RETRY_MS = 600;

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const id = window.setTimeout(() => resolve(), ms);
    if (!signal) return;
    const onAbort = () => {
      window.clearTimeout(id);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export async function fetchPlayerCareerSeasons(
  playerId: string,
  options?: {
    signal?: AbortSignal;
    attempts?: number;
    retryMs?: number;
  }
): Promise<PlayerSeason[]> {
  const attempts = Math.max(1, options?.attempts ?? DEFAULT_ATTEMPTS);
  const retryMs = options?.retryMs ?? DEFAULT_RETRY_MS;
  const signal = options?.signal;
  let last: PlayerSeason[] = [];

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await fetch(
        `/api/players/${encodeURIComponent(playerId)}/seasons`,
        { signal }
      );
      if (!res.ok) throw new Error(`seasons ${res.status}`);
      const json = (await res.json()) as { data?: PlayerSeason[] };
      last = Array.isArray(json.data) ? json.data : [];
      if (last.length > 0) return last;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw error;
      }
    }
    if (attempt < attempts) {
      await sleep(retryMs * attempt, signal);
    }
  }

  return last;
}
