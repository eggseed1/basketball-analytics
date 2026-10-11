import type { PlayerSeason } from "@/data/types";
import { careerSeasonPool } from "@/lib/career-average-row";
import { blankUntrackedSeasonStats } from "@/lib/era-adjust";
import {
  getSheetStatValue,
  type SheetStatId,
} from "@/lib/player-stat-sheet-registry";

/** Identity line under each face: who played how much. */
export type CompareBio = {
  age?: number;
  position?: string;
  gamesPlayed: number;
  gamesStarted: number;
  minutesPerGame: number | null;
  /** Career mode only. */
  seasons?: number;
};

/** Attempt-weighted shooting for one season's player pool. */
export type CompareShootingAverages = {
  season: string;
  fgPct: number | null;
  fg2Pct: number | null;
  fg3Pct: number | null;
  ftPct: number | null;
  efg: number | null;
  ts: number | null;
};

/** Stats carried for every pool dot, in this order. */
export const SCATTER_FIELDS = [
  "usg",
  "ts",
  "astPct",
  "tovPct",
  "drblO",
  "drblD",
  "trbPct",
  "blkPct",
] as const satisfies readonly SheetStatId[];

export type ScatterField = (typeof SCATTER_FIELDS)[number];

export type ComparePoolPoint = {
  id: string;
  name: string;
  /** Values in SCATTER_FIELDS order; null when not published. */
  v: Array<number | null>;
};

export type CompareScatterSide = {
  season: string;
  pool: ComparePoolPoint[];
};

/** Per-game career arc values, in this order. */
export const ARC_FIELDS = [
  "pts",
  "trb",
  "ast",
  "atr",
  "ts",
  "usg",
  "per",
  "bpm",
  "drbl100",
  "war1",
] as const satisfies readonly SheetStatId[];

export type ArcField = (typeof ARC_FIELDS)[number];

export type CompareArcPoint = {
  season: string;
  age?: number;
  gamesPlayed: number;
  v: Array<number | null>;
};

function round(n: number | null, digits = 4): number | null {
  if (n == null || !Number.isFinite(n)) return null;
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

export function compareBio(
  row: PlayerSeason,
  seasons?: number
): CompareBio {
  const gp = Number.isFinite(row.gamesPlayed) ? row.gamesPlayed : 0;
  return {
    age: seasons == null && row.age != null && row.age > 0 ? row.age : undefined,
    position: row.position,
    gamesPlayed: gp,
    gamesStarted: Number.isFinite(row.gamesStarted) ? row.gamesStarted : 0,
    minutesPerGame: gp > 0 && row.minutes > 0 ? row.minutes / gp : null,
    seasons,
  };
}

function ratio(num: number, den: number): number | null {
  return den > 0 && Number.isFinite(num) ? num / den : null;
}

/** League-style shooting from summed makes and attempts across the pool. */
export function poolShootingAverages(
  season: string,
  pool: PlayerSeason[]
): CompareShootingAverages | null {
  if (!pool.length) return null;
  let fgm = 0;
  let fga = 0;
  let tpm = 0;
  let tpa = 0;
  let ftm = 0;
  let fta = 0;
  let pts = 0;
  for (const r of pool) {
    if (![r.fieldGoalsMade, r.fieldGoalsAttempted, r.points].every(Number.isFinite)) {
      continue;
    }
    fgm += r.fieldGoalsMade;
    fga += r.fieldGoalsAttempted;
    pts += r.points;
    if (Number.isFinite(r.threePointersMade) && Number.isFinite(r.threePointersAttempted)) {
      tpm += r.threePointersMade;
      tpa += r.threePointersAttempted;
    }
    if (Number.isFinite(r.freeThrowsMade) && Number.isFinite(r.freeThrowsAttempted)) {
      ftm += r.freeThrowsMade;
      fta += r.freeThrowsAttempted;
    }
  }
  return {
    season,
    fgPct: ratio(fgm, fga),
    fg2Pct: ratio(fgm - tpm, fga - tpa),
    fg3Pct: tpa > 0 ? ratio(tpm, tpa) : null,
    ftPct: ratio(ftm, fta),
    efg: ratio(fgm + 0.5 * tpm, fga),
    ts: ratio(pts, 2 * (fga + 0.44 * fta)),
  };
}

/** Same pool the percentiles rank against: 15+ games and 12+ minutes a game. */
export function qualifiedComparePool(peers: PlayerSeason[]): PlayerSeason[] {
  const qualified = peers.filter(
    (p) => p.gamesPlayed >= 15 && p.minutes / Math.max(1, p.gamesPlayed) >= 12
  );
  return qualified.length ? qualified : peers;
}

export function scatterSide(
  season: string,
  peers: PlayerSeason[]
): CompareScatterSide | null {
  const pool = qualifiedComparePool(peers);
  if (!pool.length) return null;
  return {
    season,
    pool: pool.map((row) => ({
      id: row.playerId,
      name: row.playerName,
      v: SCATTER_FIELDS.map((id) => round(getSheetStatValue(row, id, "perGame"))),
    })),
  };
}

export function scatterValues(row: PlayerSeason): Array<number | null> {
  return SCATTER_FIELDS.map((id) => round(getSheetStatValue(row, id, "perGame")));
}

/** One point per played season, oldest first, TOT rows for traded seasons. */
export function careerArc(seasons: PlayerSeason[]): CompareArcPoint[] {
  return careerSeasonPool(seasons)
    .slice()
    .sort((x, y) => x.season.localeCompare(y.season))
    .map((raw) => {
      const row = blankUntrackedSeasonStats(raw);
      return {
        season: row.season,
        age: row.age != null && row.age > 0 ? row.age : undefined,
        gamesPlayed: row.gamesPlayed,
        v: ARC_FIELDS.map((id) => round(getSheetStatValue(row, id, "perGame"))),
      };
    });
}
