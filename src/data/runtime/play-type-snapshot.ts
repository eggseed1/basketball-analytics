/**
 * Bundled NBA Synergy play types (offense) and league shot-zone averages.
 *
 * Built by scripts/build-runtime-playtype-onoff-snapshot.py.
 * Row: [nbaId, totalPoss, poss0, pts0, poss1, pts1, ...] in `playTypes` order.
 */
import snapshot from "./play-type-snapshot.json";
import type { LeagueShotZones } from "@/lib/player-shot-map";

type PlayTypeFile = {
  version?: number;
  generatedAt?: string;
  playTypes?: string[];
  seasons?: Record<string, Array<Array<string | number>>>;
  leagueShotZones?: Record<string, LeagueShotZones>;
};

const data = snapshot as unknown as PlayTypeFile;
const playTypes = data.playTypes ?? [];

export const PLAY_TYPE_LABELS: Record<string, string> = {
  Isolation: "Isolation",
  PRBallHandler: "Pick-and-roll handler",
  PRRollman: "Pick-and-roll roll man",
  Postup: "Post-up",
  Spotup: "Spot-up",
  Handoff: "Handoff",
  Cut: "Cut",
  OffScreen: "Off screen",
  Transition: "Transition",
  OffRebound: "Putbacks",
  Misc: "Other",
};

/** Possessions a player needs in a play type before a percentile is shown. */
export const PLAY_TYPE_MIN_POSS = 25;

export type PlayTypeRow = {
  key: string;
  label: string;
  poss: number;
  pts: number;
  ppp: number | null;
  /** Share of the player's tracked possessions. */
  frequency: number;
  /** League points per possession in this play type. */
  leaguePpp: number | null;
  /** PPP percentile among players with PLAY_TYPE_MIN_POSS+ possessions. */
  percentile: number | null;
};

export type PlayerPlayTypes = {
  season: string;
  totalPoss: number;
  rows: PlayTypeRow[];
};

type SeasonIndex = {
  byPlayer: Map<string, Array<string | number>>;
  leaguePpp: Array<number | null>;
  /** Sorted PPP of qualified players, per play type. */
  qualified: number[][];
};

const indexCache = new Map<string, SeasonIndex | null>();

function seasonIndex(season: string): SeasonIndex | null {
  if (indexCache.has(season)) return indexCache.get(season) ?? null;
  const rows = data.seasons?.[season];
  if (!rows?.length) {
    indexCache.set(season, null);
    return null;
  }
  const byPlayer = new Map<string, Array<string | number>>();
  const possSum = playTypes.map(() => 0);
  const ptsSum = playTypes.map(() => 0);
  const qualified: number[][] = playTypes.map(() => []);
  for (const row of rows) {
    byPlayer.set(String(row[0]), row);
    playTypes.forEach((_, i) => {
      const poss = Number(row[2 + 2 * i]) || 0;
      const pts = Number(row[3 + 2 * i]) || 0;
      possSum[i] += poss;
      ptsSum[i] += pts;
      if (poss >= PLAY_TYPE_MIN_POSS) qualified[i]!.push(pts / poss);
    });
  }
  for (const list of qualified) list.sort((a, b) => a - b);
  const index: SeasonIndex = {
    byPlayer,
    leaguePpp: possSum.map((poss, i) => (poss > 0 ? ptsSum[i]! / poss : null)),
    qualified,
  };
  indexCache.set(season, index);
  return index;
}

function percentileOf(sorted: number[], value: number): number | null {
  if (sorted.length < 10) return null;
  let below = 0;
  let equal = 0;
  for (const v of sorted) {
    if (v < value) below += 1;
    else if (v === value) equal += 1;
  }
  return Math.round(((below + equal / 2) / sorted.length) * 100);
}

export function getPlayerPlayTypes(
  season: string,
  playerIds: Array<string | null | undefined>
): PlayerPlayTypes | null {
  const index = seasonIndex(season);
  if (!index) return null;
  const row = playerIds
    .filter((id): id is string => Boolean(id))
    .map((id) => index.byPlayer.get(id))
    .find(Boolean);
  if (!row) return null;
  const total = Number(row[1]) || 0;
  const tracked = playTypes.reduce((sum, _, i) => sum + (Number(row[2 + 2 * i]) || 0), 0);
  const denominator = Math.max(total, tracked);
  if (denominator <= 0) return null;
  const rows = playTypes
    .map((key, i): PlayTypeRow => {
      const poss = Number(row[2 + 2 * i]) || 0;
      const pts = Number(row[3 + 2 * i]) || 0;
      const ppp = poss > 0 ? pts / poss : null;
      return {
        key,
        label: PLAY_TYPE_LABELS[key] ?? key,
        poss,
        pts,
        ppp,
        frequency: poss / denominator,
        leaguePpp: index.leaguePpp[i] ?? null,
        percentile:
          ppp != null && poss >= PLAY_TYPE_MIN_POSS
            ? percentileOf(index.qualified[i] ?? [], ppp)
            : null,
      };
    })
    .filter((r) => r.poss > 0)
    .sort((a, b) => b.poss - a.poss);
  return rows.length ? { season, totalPoss: denominator, rows } : null;
}

/** Raw player rows for one season, with the play-type order they follow. */
export function getPlayTypeSeasonRows(
  season: string
): { playTypes: string[]; rows: Array<Array<string | number>> } | null {
  const rows = data.seasons?.[season];
  return rows?.length ? { playTypes, rows } : null;
}

export function getLeagueShotZones(season: string): LeagueShotZones | null {
  const zones = data.leagueShotZones?.[season];
  return zones && Object.keys(zones).length ? zones : null;
}
