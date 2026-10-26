import type { Game } from "@/data/types/game";
import type { LeagueStandings } from "@/data/types/standings";
import { isFinalStatus } from "@/lib/game-status";

/** League-wide games played (wins + losses) on a standings board. */
export function standingsGamesPlayed(data: LeagueStandings): number {
  return data.conferences.reduce(
    (total, conference) =>
      total +
      conference.rows.reduce((sum, row) => sum + row.wins + row.losses, 0),
    0
  );
}

/**
 * Merge snapshot schedule rows with live day scoreboard finals.
 * Live finals win on id so tonight's results update W-L before the nightly bake.
 */
export function mergeStandingsGames(
  snapshot: readonly Game[],
  live: readonly Game[]
): Game[] {
  const byId = new Map<string, Game>();
  for (const game of snapshot) {
    if (game.id) byId.set(game.id, game);
  }
  for (const game of live) {
    if (!game.id) continue;
    const prior = byId.get(game.id);
    if (!prior) {
      byId.set(game.id, game);
      continue;
    }
    // Prefer an explicit final over a stale scheduled/in-progress snapshot row.
    if (isFinalStatus(game.status) && !isFinalStatus(prior.status)) {
      byId.set(game.id, game);
      continue;
    }
    if (isFinalStatus(game.status) && isFinalStatus(prior.status)) {
      byId.set(game.id, game);
    }
  }
  return [...byId.values()];
}

/**
 * Prefer the board that has counted more completed games.
 * Ties keep `preferred` (usually the richer ESPN bake: streak, home/road, L10).
 */
export function preferFresherStandings(
  preferred: LeagueStandings | null | undefined,
  candidate: LeagueStandings | null | undefined
): LeagueStandings | null {
  if (!preferred && !candidate) return null;
  if (!preferred) return candidate ?? null;
  if (!candidate) return preferred;
  return standingsGamesPlayed(candidate) > standingsGamesPlayed(preferred)
    ? candidate
    : preferred;
}
