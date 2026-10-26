/**
 * Home rookie tracker: current draft class + season counting lines.
 */

import type { DraftNightPick } from "@/data/runtime/draft-night-snapshot";
import { normalizePlayerName } from "@/lib/player-name";

export const ROOKIE_TRACKER_LIMIT = 8;

export type RookieTrackerSort = "ppg" | "rpg" | "apg" | "pick";

export type RookieTrackerRow = {
  key: string;
  /** ESPN / site id for player pages and headshots. */
  playerId: string | null;
  name: string;
  teamAbbr: string;
  overall: number;
  round: number;
  position: string | null;
  gp: number | null;
  mpg: number | null;
  ppg: number | null;
  rpg: number | null;
  apg: number | null;
  /** WAR1 when the DRBL bake has the rookie. */
  war1: number | null;
  href: string | null;
};

export type RookieTrackerSeasonLine = {
  playerId: string | null;
  playerName: string;
  teamAbbr: string;
  gamesPlayed: number;
  minutes: number;
  points: number;
  rebounds: number;
  assists: number;
};

export type RookieTrackerDrblLine = {
  playerName: string;
  war1: number | null;
};

export type RookieTrackerModel = {
  season: string;
  draftYear: number;
  /** Rookies with at least one counted game in the bake. */
  withGames: number;
  rows: RookieTrackerRow[];
  /** Explore board deep-link for the full class. */
  exploreHref: string;
};

function rate(
  total: number,
  games: number
): number | null {
  if (!Number.isFinite(games) || games <= 0) return null;
  if (!Number.isFinite(total)) return null;
  return Math.round((total / games) * 10) / 10;
}

function pickSortValue(row: RookieTrackerRow, sort: RookieTrackerSort): number {
  if (sort === "pick") return row.overall;
  const value =
    sort === "ppg" ? row.ppg : sort === "rpg" ? row.rpg : row.apg;
  if (value == null || !Number.isFinite(value)) return Number.NEGATIVE_INFINITY;
  return value;
}

export function sortRookieTrackerRows(
  rows: readonly RookieTrackerRow[],
  sort: RookieTrackerSort
): RookieTrackerRow[] {
  return [...rows].sort((a, b) => {
    if (sort === "pick") return a.overall - b.overall;
    const av = pickSortValue(a, sort);
    const bv = pickSortValue(b, sort);
    if (bv !== av) return bv - av;
    // Prefer players who have actually played when rates tie or both blank.
    const ag = a.gp ?? 0;
    const bg = b.gp ?? 0;
    if (bg !== ag) return bg - ag;
    return a.overall - b.overall;
  });
}

/**
 * Merge the draft-night class with bundled season lines. Missing stats stay
 * blank (not 0) so early-season boards do not look like 0-point rookies.
 */
export function buildRookieTracker(opts: {
  season: string;
  draftYear: number;
  picks: readonly DraftNightPick[];
  seasonLines: readonly RookieTrackerSeasonLine[];
  drblLines?: readonly RookieTrackerDrblLine[];
  sort?: RookieTrackerSort;
}): RookieTrackerModel {
  const sort = opts.sort ?? "ppg";
  const byId = new Map<string, RookieTrackerSeasonLine>();
  const byName = new Map<string, RookieTrackerSeasonLine>();
  for (const line of opts.seasonLines) {
    if (line.playerId) byId.set(line.playerId, line);
    byName.set(normalizePlayerName(line.playerName), line);
  }
  const war1ByName = new Map<string, number>();
  for (const line of opts.drblLines ?? []) {
    if (line.war1 == null || !Number.isFinite(line.war1)) continue;
    war1ByName.set(normalizePlayerName(line.playerName), line.war1);
  }

  const classPicks = opts.picks
    .filter((p) => p.year === opts.draftYear && p.overall > 0)
    .slice()
    .sort((a, b) => a.overall - b.overall);

  const rows: RookieTrackerRow[] = classPicks.map((pick) => {
    const line =
      (pick.playerId ? byId.get(pick.playerId) : null) ??
      byName.get(normalizePlayerName(pick.name)) ??
      null;
    const gp = line && line.gamesPlayed > 0 ? line.gamesPlayed : null;
    const mpg =
      line && gp
        ? Math.round((line.minutes / gp) * 10) / 10
        : null;
    const playerId = pick.playerId || line?.playerId || null;
    return {
      key: playerId ?? `${opts.draftYear}-${pick.overall}-${pick.name}`,
      playerId,
      name: pick.name,
      teamAbbr: (line?.teamAbbr || pick.teamAbbr || "").toUpperCase(),
      overall: pick.overall,
      round: pick.round,
      position: pick.position,
      gp,
      mpg,
      ppg: line && gp ? rate(line.points, gp) : null,
      rpg: line && gp ? rate(line.rebounds, gp) : null,
      apg: line && gp ? rate(line.assists, gp) : null,
      war1: war1ByName.get(normalizePlayerName(pick.name)) ?? null,
      href: playerId ? `/players/${encodeURIComponent(playerId)}` : null,
    };
  });

  const withGames = rows.filter((r) => (r.gp ?? 0) > 0).length;
  // Full class so the client can re-rank by pick / PTS without dropping
  // top selections that have not played yet. Boards slice for display.
  const ranked = sortRookieTrackerRows(rows, sort);

  return {
    season: opts.season,
    draftYear: opts.draftYear,
    withGames,
    rows: ranked,
    exploreHref: `/explore/players?draftClass=${opts.draftYear}`,
  };
}
