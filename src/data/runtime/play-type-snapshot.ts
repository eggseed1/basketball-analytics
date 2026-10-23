/**
 * NBA Synergy play types (offense) and league shot-zone averages.
 * Lives under public/runtime (ASSETS) so the ~136KB JSON stays off the
 * Worker isolate; Node reads the same file from disk.
 *
 * Built by scripts/build-runtime-playtype-onoff-snapshot.py.
 * Row: [nbaId, totalPoss, poss0, pts0, poss1, pts1, ...] in `playTypes` order.
 */
import type { LeagueShotZones } from "@/lib/player-shot-map";

type PlayTypeFile = {
  version?: number;
  generatedAt?: string;
  playTypes?: string[];
  seasons?: Record<string, Array<Array<string | number>>>;
  leagueShotZones?: Record<string, LeagueShotZones>;
};

type AssetsFetcher = {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
};

const ASSET_PATH = "/runtime/play-type-snapshot.json";

let data: PlayTypeFile | null | undefined;
let playTypes: string[] = [];

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

function cloudflareAssets(): AssetsFetcher | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getCloudflareContext } = require("@opennextjs/cloudflare") as {
      getCloudflareContext: () => { env?: { ASSETS?: AssetsFetcher } };
    };
    return getCloudflareContext()?.env?.ASSETS ?? null;
  } catch {
    return null;
  }
}

function loadFromPublicDir(): PlayTypeFile | null {
  try {
    if (process.env.NEXT_RUNTIME === "edge") return null;
    // eslint-disable-next-line no-eval
    const req = eval("require") as NodeRequire;
    const fs = req("node:fs") as typeof import("node:fs");
    const path = req("node:path") as typeof import("node:path");
    const file = path.join(
      process.cwd(),
      "public",
      "runtime",
      "play-type-snapshot.json"
    );
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8")) as PlayTypeFile;
  } catch {
    return null;
  }
}

async function loadFromAssets(): Promise<PlayTypeFile | null> {
  try {
    const assets = cloudflareAssets();
    if (!assets) return null;
    const response = await assets.fetch(`https://assets.local${ASSET_PATH}`);
    if (!response.ok) return null;
    return (await response.json()) as PlayTypeFile;
  } catch {
    return null;
  }
}

function apply(file: PlayTypeFile | null): boolean {
  data = file;
  playTypes = file?.playTypes ?? [];
  indexCache.clear();
  return file != null;
}

function tryPrimeFromDisk(): void {
  if (data !== undefined) return;
  const file = loadFromPublicDir();
  if (file) apply(file);
}

export async function ensurePlayTypeSnapshot(): Promise<boolean> {
  if (data !== undefined) return data != null;
  const fromDisk = loadFromPublicDir();
  if (fromDisk) return apply(fromDisk);
  return apply(await loadFromAssets());
}

function seasonIndex(season: string): SeasonIndex | null {
  tryPrimeFromDisk();
  if (indexCache.has(season)) return indexCache.get(season) ?? null;
  const rows = data?.seasons?.[season];
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
  const tracked = playTypes.reduce(
    (sum, _, i) => sum + (Number(row[2 + 2 * i]) || 0),
    0
  );
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
  tryPrimeFromDisk();
  const rows = data?.seasons?.[season];
  return rows?.length ? { playTypes, rows } : null;
}

export function getLeagueShotZones(season: string): LeagueShotZones | null {
  tryPrimeFromDisk();
  const zones = data?.leagueShotZones?.[season];
  return zones && Object.keys(zones).length ? zones : null;
}
