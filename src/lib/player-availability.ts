/**
 * Career availability / workload series for player visualizations.
 */
import type { PlayerSeason } from "@/data/types";

/** Standard NBA regular-season schedule length for missed-games proxy. */
export const NBA_SCHEDULE_GAMES = 82;

export type AvailabilityPoint = {
  season: string;
  short: string;
  gamesPlayed: number;
  gamesStarted: number;
  /** max(0, 82 − GP) — proxy vs a full schedule, not injury report. */
  gamesMissed: number;
  minutes: number;
  mpg: number;
  teamAbbr: string;
};

function isSeasonRow(row: PlayerSeason): boolean {
  if (!/^\d{4}-\d{2}$/.test(row.season)) return false;
  const tid = String(row.teamId ?? "").toUpperCase();
  if (tid === "TOT" || tid === "CAREER") return false;
  return row.gamesPlayed > 0;
}

/**
 * One row per season (prefer TOT aggregate when present), chronological.
 */
export function buildAvailabilitySeries(
  seasons: PlayerSeason[]
): AvailabilityPoint[] {
  const bySeason = new Map<string, PlayerSeason[]>();
  for (const row of seasons) {
    if (!isSeasonRow(row) && !/^\d{4}-\d{2}$/.test(row.season)) continue;
    if (!(row.gamesPlayed > 0)) continue;
    if (!/^\d{4}-\d{2}$/.test(row.season)) continue;
    const list = bySeason.get(row.season) ?? [];
    list.push(row);
    bySeason.set(row.season, list);
  }

  const points: AvailabilityPoint[] = [];
  for (const season of [...bySeason.keys()].sort()) {
    const list = bySeason.get(season)!;
    const tot = list.find((r) => String(r.teamId).toUpperCase() === "TOT");
    const row =
      tot ??
      [...list].sort((a, b) => (b.minutes || 0) - (a.minutes || 0))[0]!;
    const gp = Math.max(0, row.gamesPlayed);
    const minutes = Math.max(0, row.minutes || 0);
    points.push({
      season,
      short: season.slice(2),
      gamesPlayed: gp,
      gamesStarted: Math.max(0, row.gamesStarted || 0),
      gamesMissed: Math.max(0, NBA_SCHEDULE_GAMES - gp),
      minutes: Math.round(minutes),
      mpg: gp > 0 ? minutes / gp : 0,
      teamAbbr: row.teamAbbreviation ?? row.teamId ?? "—",
    });
  }
  return points;
}

export type CreationProfile = {
  assistPct: number;
  turnoverPct: number;
  assistToTurnover: number | null;
  apg: number;
  topg: number;
};

export function buildCreationProfile(row: PlayerSeason): CreationProfile | null {
  const ast = row.assistPct;
  const tov = row.turnoverPct;
  if (
    (ast == null || !Number.isFinite(ast)) &&
    (tov == null || !Number.isFinite(tov))
  ) {
    return null;
  }
  const gp = Math.max(1, row.gamesPlayed);
  const apg = row.assists / gp;
  const topg = row.turnovers / gp;
  const assistPct = ast > 1 ? ast / 100 : ast;
  const turnoverPct = tov > 1 ? tov / 100 : tov;
  const assistToTurnover =
    row.turnovers > 0 ? row.assists / row.turnovers : null;
  return {
    assistPct: Number.isFinite(assistPct) ? assistPct : 0,
    turnoverPct: Number.isFinite(turnoverPct) ? turnoverPct : 0,
    assistToTurnover,
    apg,
    topg,
  };
}
