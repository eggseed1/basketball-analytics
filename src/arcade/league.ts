/**
 * Shared league data for the Arcade games: every player-season from 1996-97
 * on, baked by scripts/build-arcade-data.mjs into a static file.
 */

export type ArcadePlayer = {
  id: number;
  name: string;
  birthYear: number | null;
  espnId: string | null;
  /** NBA.com person id, for a headshot when there is no ESPN id. */
  nbaId: string | null;
};

export type ArcadeRow = {
  pid: number;
  season: string;
  /** Every team he played for that season, in order. */
  teams: string[];
  pos: string | null;
  gp: number;
  /** Total minutes. */
  mp: number;
  bpm: number | null;
  vorp: number | null;
  pts: number | null;
  trb: number | null;
  ast: number | null;
  darko: number | null;
};

export type ArcadeLeague = {
  players: ArcadePlayer[];
  rows: ArcadeRow[];
  seasons: string[];
  /** Players who share a name with someone else, shown with a birth year. */
  namesakes: Set<number>;
};

type RawRow = [
  number,
  string | string[],
  string | null,
  number,
  number,
  number | null,
  number | null,
  number | null,
  number | null,
  number | null,
  number | null,
];

type RawLeague = {
  players: Array<[string, number | null, string | null, string | null]>;
  seasons: Record<string, RawRow[]>;
};

export const ARCADE_DATA_URL = "/runtime/arcade/league-seasons.json";

export function parseLeague(raw: RawLeague): ArcadeLeague {
  const players = raw.players.map(([name, birthYear, espnId, nbaId], id) => ({
    id,
    name,
    birthYear,
    espnId,
    nbaId: nbaId ?? null,
  }));
  const countByName = new Map<string, number>();
  for (const p of players) countByName.set(p.name, (countByName.get(p.name) ?? 0) + 1);
  const namesakes = new Set(
    players.filter((p) => (countByName.get(p.name) ?? 0) > 1).map((p) => p.id)
  );
  const seasons = Object.keys(raw.seasons).sort();
  const rows: ArcadeRow[] = [];
  for (const season of seasons) {
    for (const [pid, teams, pos, gp, mp, bpm, vorp, pts, trb, ast, darko] of raw.seasons[season]) {
      rows.push({
        pid,
        season,
        teams: Array.isArray(teams) ? teams : [teams],
        pos,
        gp,
        mp,
        bpm,
        vorp,
        pts,
        trb,
        ast,
        darko,
      });
    }
  }
  return { players, rows, seasons, namesakes };
}

let pending: Promise<ArcadeLeague> | null = null;

export function loadArcadeLeague(): Promise<ArcadeLeague> {
  pending ??= fetch(ARCADE_DATA_URL)
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json() as Promise<RawLeague>;
    })
    .then(parseLeague)
    .catch((error) => {
      pending = null;
      throw error;
    });
  return pending;
}

export function playerLabel(league: ArcadeLeague, pid: number): string {
  const player = league.players[pid];
  if (!player) return "Unknown";
  return league.namesakes.has(pid) && player.birthYear
    ? `${player.name} (b. ${player.birthYear})`
    : player.name;
}

export function randomItem<T>(items: readonly T[], rng: () => number = Math.random): T {
  return items[Math.floor(rng() * items.length)];
}
