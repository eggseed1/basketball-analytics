import type { PlayerSeason } from "@/data/types";

/**
 * A season-tables bundle is a historical fallback, not a live-season authority.
 * Replace a current-season snapshot only when the live ESPN career endpoint
 * reports at least as many games. Replace whole counting rows (not just GP)
 * so the career chart's MPG/PPG/TS% denominators remain consistent.
 */
export function preferFreshCurrentCareerRows(
  bundled: PlayerSeason[],
  live: PlayerSeason[],
  currentSeason: string
): PlayerSeason[] {
  const current = live.filter(
    (row) =>
      row.season === currentSeason &&
      Number.isFinite(row.gamesPlayed) &&
      row.gamesPlayed > 0
  );
  if (!current.length) return bundled;
  const mostLiveGames = Math.max(...current.map((row) => row.gamesPlayed));
  const previous = bundled.filter((row) => row.season === currentSeason);
  const mostBundledGames = previous.length
    ? Math.max(...previous.map((row) => row.gamesPlayed || 0))
    : 0;
  // Cached ESPN may be behind the bundle; never move backward.
  if (mostLiveGames < mostBundledGames) return bundled;

  // Keep the same route identity on all source rows. Do not merge an old
  // per-game rate into a new games-played denominator.
  const playerId = bundled[0]?.playerId ?? current[0]!.playerId;
  const playerName = bundled[0]?.playerName || current[0]!.playerName;
  const fresh = current.map((row) => ({
    ...row,
    playerId,
    playerName: row.playerName || playerName,
  }));
  return [...fresh, ...bundled.filter((row) => row.season !== currentSeason)]
    .sort((a, b) => b.season.localeCompare(a.season));
}
