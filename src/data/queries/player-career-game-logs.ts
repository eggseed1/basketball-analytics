import type { CompactPlayerGameLogRow } from "@/data/history/player-game-log";

/**
 * Compact regular+playoff game rows for the career Games chart.
 * Used by the career-game-logs API (client hydrate) — not SSR'd into the
 * player page HTML (full careers were ~200–300KB of RSC payload).
 */
export async function loadPlayerCareerGameLogs(
  playerId: string,
  seasons: string[]
): Promise<CompactPlayerGameLogRow[]> {
  const unique = [
    ...new Set(
      seasons
        .map((s) => String(s ?? "").trim())
        .filter((s) => /^\d{4}-\d{2}$/.test(s))
    ),
  ];
  if (!unique.length) return [];

  const [{ resolvePlayerSeasonGameLog }, { resolveNbaIdForDrbl }] =
    await Promise.all([
      import("@/data/runtime/player-game-logs-store"),
      import("@/data/identity/player-identity"),
    ]);
  const nbaId = await resolveNbaIdForDrbl(playerId).catch(() => null);
  const logs = await Promise.all(
    unique.map((season) =>
      resolvePlayerSeasonGameLog({
        season,
        playerId,
        nbaId,
      }).catch(() => [] as CompactPlayerGameLogRow[])
    )
  );
  return logs.flat();
}
