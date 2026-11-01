import type { CompactPlayerGameLogRow } from "@/data/history/player-game-log";

const CONCURRENCY = 4;

/**
 * Career-board game dots. Batched so Cloudflare Workers stay under subrequest
 * limits when a long career fans out across ASSETS + R2.
 */
export async function loadCareerGameLogs(
  playerId: string,
  seasons: string[]
): Promise<CompactPlayerGameLogRow[]> {
  if (!seasons.length) return [];
  const [{ resolvePlayerSeasonGameLog }, { resolveNbaIdForDrbl }] =
    await Promise.all([
      import("@/data/runtime/player-game-logs-store"),
      import("@/data/identity/player-identity"),
    ]);
  const nbaId = await resolveNbaIdForDrbl(playerId).catch(() => null);
  const out: CompactPlayerGameLogRow[] = [];
  for (let i = 0; i < seasons.length; i += CONCURRENCY) {
    const chunk = seasons.slice(i, i + CONCURRENCY);
    const logs = await Promise.all(
      chunk.map((season) =>
        resolvePlayerSeasonGameLog({
          season,
          playerId,
          nbaId,
        }).catch(() => [])
      )
    );
    for (const games of logs) out.push(...games);
  }
  return out;
}
