/**
 * Bundled multi-season careers for Cloudflare player destinations.
 * Kept separate from season-tables (~9MB peer boards) so /players/[id] cold
 * MISS does not parse the explore board snapshot or its impact/DRBL imports.
 */
import "server-only";

import { resolveCanonicalTeam } from "@/data/identity/team-map";
import {
  lookupPlayerNameByEspnId,
  normalizeEspnLookupName,
} from "./espn-name-index";
import type { PlayerSeason } from "@/data/types";

type AssetsFetcher = {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
};

const ASSET_PATH = "/runtime/player-career-bref-snapshot.json";

type SlimAdvanced = {
  n: string;
  t: string;
  e?: string;
  gp: number;
  mp: number;
  per: number;
  ts: number;
  usg: number;
  ows: number;
  dws: number;
  ws: number;
  ws48: number;
  obpm: number;
  dbpm: number;
  bpm: number;
  vorp: number;
  fg3Ar?: number;
  ftr?: number;
  orbPct?: number;
  drbPct?: number;
  trbPct?: number;
  astPct?: number;
  stlPct?: number;
  blkPct?: number;
  tovPct?: number;
  ortg?: number;
  drtg?: number;
  tm?: string[];
};

type SlimPerGame = {
  n: string;
  t: string;
  e?: string;
  gp: number;
  gs?: number;
  age?: number;
  pos?: string;
  mp: number;
  pts: number;
  trb: number;
  orb?: number;
  drb?: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
  pf?: number;
  fgm?: number;
  fga?: number;
  fg3m?: number;
  fg3a?: number;
  fg2m?: number;
  fg2a?: number;
  ftm?: number;
  fta?: number;
  fgPct: number;
  fg3Pct: number;
  fg2Pct?: number;
  efgPct?: number;
  ftPct: number;
};

type CareerHit = [string, SlimAdvanced, SlimPerGame | null];

type SnapshotFile = {
  version?: number;
  generatedAt?: string;
  byEspn?: Record<string, CareerHit[]>;
  nameToEspn?: Record<string, string>;
};

type CareerIndex = {
  version: number;
  generatedAt: string | null;
  byEspn: Record<string, CareerHit[]>;
  nameToEspn: Record<string, string>;
};

let cachedIndex: CareerIndex | null | undefined;

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

function loadFromPublicDir(): SnapshotFile | null {
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
      "player-career-bref-snapshot.json"
    );
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8")) as SnapshotFile;
  } catch {
    return null;
  }
}

async function loadFromAssets(): Promise<SnapshotFile | null> {
  try {
    const assets = cloudflareAssets();
    if (!assets) return null;
    const response = await assets.fetch(`https://assets.local${ASSET_PATH}`);
    if (!response.ok) return null;
    return (await response.json()) as SnapshotFile;
  } catch {
    return null;
  }
}

function indexFromFile(data: SnapshotFile): CareerIndex {
  return {
    version: data.version ?? 0,
    generatedAt: data.generatedAt ?? null,
    byEspn: data.byEspn ?? {},
    nameToEspn: data.nameToEspn ?? {},
  };
}

async function ensureCareerIndex(): Promise<CareerIndex | null> {
  if (cachedIndex !== undefined) return cachedIndex;
  const fromDisk = loadFromPublicDir();
  if (fromDisk) {
    cachedIndex = indexFromFile(fromDisk);
    return cachedIndex;
  }
  const fromAssets = await loadFromAssets();
  if (fromAssets) {
    cachedIndex = indexFromFile(fromAssets);
    return cachedIndex;
  }
  cachedIndex = null;
  return null;
}

function pctAsFraction(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value > 1 ? value / 100 : value;
}

function percentPoints(value: number | undefined): number {
  if (value == null || !Number.isFinite(value) || value <= 0) return 0;
  return value / 100;
}

function toPeerSeasonRow(
  adv: SlimAdvanced,
  pg: SlimPerGame | null | undefined,
  canonicalSeason: string
): PlayerSeason {
  const key = `${adv.n.toLowerCase()}|${adv.t}`;
  const gp = Math.max(1, adv.gp || pg?.gp || 0);
  const mpg = pg?.mp ?? (adv.mp > 0 && adv.gp > 0 ? adv.mp / adv.gp : 0);
  const espnId = adv.e || pg?.e || null;
  const fgm = (pg?.fgm ?? 0) * gp;
  const fga = (pg?.fga ?? 0) * gp;
  const fg3m = (pg?.fg3m ?? 0) * gp;
  const fg3a = (pg?.fg3a ?? 0) * gp;
  const ftm = (pg?.ftm ?? 0) * gp;
  const fta = (pg?.fta ?? 0) * gp;
  const efg =
    pg?.efgPct != null && pg.efgPct > 0
      ? pctAsFraction(pg.efgPct)
      : fga > 0
        ? (fgm + 0.5 * fg3m) / fga
        : 0;
  const fg2m = pg?.fg2m != null ? pg.fg2m * gp : Math.max(0, fgm - fg3m);
  const fg2a = pg?.fg2a != null ? pg.fg2a * gp : Math.max(0, fga - fg3a);
  const fg2Pct =
    pg?.fg2Pct != null && pg.fg2Pct > 0
      ? pctAsFraction(pg.fg2Pct)
      : fg2a > 0
        ? fg2m / fg2a
        : 0;
  const ortg = adv.ortg != null && adv.ortg > 0 ? adv.ortg : undefined;
  const drtg = adv.drtg != null && adv.drtg > 0 ? adv.drtg : undefined;
  const resolvedTeam = resolveCanonicalTeam(adv.t);
  const teamId =
    resolvedTeam.status === "resolved"
      ? resolvedTeam.team.canonicalTeamId
      : adv.t;
  const teamAbbreviation =
    resolvedTeam.status === "resolved" ? resolvedTeam.team.abbr : adv.t;
  const stintTeamIds = adv.tm?.length
    ? adv.tm.map((abbr) => {
        const stint = resolveCanonicalTeam(abbr);
        return stint.status === "resolved" ? stint.team.canonicalTeamId : abbr;
      })
    : undefined;

  return {
    playerId: espnId ?? `bref:${key}:${canonicalSeason}`,
    playerName: adv.n,
    teamId,
    teamAbbreviation,
    ...(stintTeamIds ? { stintTeamIds } : {}),
    season: canonicalSeason,
    age: pg?.age,
    position: pg?.pos,
    gamesPlayed: gp,
    gamesStarted: Math.round(pg?.gs ?? 0),
    minutes: mpg * gp,
    points: (pg?.pts ?? 0) * gp,
    rebounds: (pg?.trb ?? 0) * gp,
    assists: (pg?.ast ?? 0) * gp,
    steals: (pg?.stl ?? 0) * gp,
    blocks: (pg?.blk ?? 0) * gp,
    turnovers: (pg?.tov ?? 0) * gp,
    fieldGoalsMade: fgm,
    fieldGoalsAttempted: fga,
    threePointersMade: fg3m,
    threePointersAttempted: fg3a,
    freeThrowsMade: ftm,
    freeThrowsAttempted: fta,
    offensiveRebounds: (pg?.orb ?? 0) * gp,
    defensiveRebounds: (pg?.drb ?? 0) * gp,
    personalFouls: (pg?.pf ?? 0) * gp,
    plusMinus: Number.NaN,
    fieldGoalPct: pg?.fgPct ?? (fga > 0 ? fgm / fga : 0),
    threePointPct: pg?.fg3Pct ?? (fg3a > 0 ? fg3m / fg3a : 0),
    freeThrowPct: pg?.ftPct ?? (fta > 0 ? ftm / fta : 0),
    twoPointPct: fg2Pct,
    trueShootingPct: pctAsFraction(adv.ts),
    effectiveFieldGoalPct: efg,
    threePointAttemptRate: pctAsFraction(adv.fg3Ar ?? 0),
    freeThrowRate: pctAsFraction(adv.ftr ?? 0),
    usagePct: percentPoints(adv.usg),
    turnoverPct: percentPoints(adv.tovPct ?? 0),
    assistPct: percentPoints(adv.astPct ?? 0),
    offensiveReboundPct: percentPoints(adv.orbPct ?? 0),
    defensiveReboundPct: percentPoints(adv.drbPct ?? 0),
    reboundPct: percentPoints(adv.trbPct ?? 0),
    stealPct: percentPoints(adv.stlPct ?? 0),
    blockPct: percentPoints(adv.blkPct ?? 0),
    per: adv.per,
    ows: adv.ows,
    dws: adv.dws,
    winShares: adv.ws,
    winSharesPer48: adv.ws48,
    obpm: adv.obpm,
    dbpm: adv.dbpm,
    bpm: adv.bpm,
    vorp: adv.vorp,
    ...(ortg != null ? { offensiveRating: ortg } : {}),
    ...(drtg != null ? { defensiveRating: drtg } : {}),
    ...(ortg != null && drtg != null ? { netRating: ortg - drtg } : {}),
  } as PlayerSeason;
}

function hitsToCareerRows(
  hits: CareerHit[],
  playerId: string
): PlayerSeason[] {
  const bySeason = new Map<string, CareerHit>();
  for (const hit of hits) {
    const [season, adv] = hit;
    const prev = bySeason.get(season);
    if (
      !prev ||
      adv.gp > prev[1].gp ||
      (adv.gp === prev[1].gp && adv.mp > prev[1].mp)
    ) {
      bySeason.set(season, hit);
    }
  }
  return [...bySeason.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([, hit]) => {
      const [season, adv, pg] = hit;
      const row = toPeerSeasonRow(adv, pg, season);
      return { ...row, playerId: playerId || row.playerId };
    });
}

const careerByEspnIdCache = new Map<string, PlayerSeason[]>();
const careerByNameCache = new Map<string, PlayerSeason[]>();

export async function playerCareerBrefSnapshotMeta() {
  const index = await ensureCareerIndex();
  return {
    version: index?.version ?? 0,
    generatedAt: index?.generatedAt ?? null,
    players: index ? Object.keys(index.byEspn).length : 0,
  };
}

/**
 * Multi-season career rows from the dedicated career bake (Cloudflare fallback
 * when ESPN athlete career hangs / history disk is empty).
 * Snapshot lives under public/runtime (ASSETS) so the 2.9MB JSON stays off
 * the Worker isolate upload.
 */
export async function getBundledBrefCareerForPlayer(options: {
  playerId?: string | null;
  playerName?: string | null;
}): Promise<PlayerSeason[]> {
  const wantId = String(options.playerId ?? "").trim();
  const wantName = options.playerName
    ? normalizeEspnLookupName(options.playerName)
    : "";
  const idNameHint = wantId
    ? normalizeEspnLookupName(lookupPlayerNameByEspnId(wantId) ?? "")
    : "";
  const nameTarget = wantName || idNameHint;

  if (wantId) {
    const cached = careerByEspnIdCache.get(wantId);
    if (cached) return cached;
  } else if (nameTarget) {
    const cached = careerByNameCache.get(nameTarget);
    if (cached) return cached;
  } else {
    return [];
  }

  const index = await ensureCareerIndex();
  if (!index) return [];

  let hits: CareerHit[] = [];
  if (wantId) {
    hits = index.byEspn[wantId] ?? [];
  }
  if (!hits.length && nameTarget) {
    const mappedId = index.nameToEspn[nameTarget];
    if (mappedId) hits = index.byEspn[mappedId] ?? [];
  }

  const out = hitsToCareerRows(hits, wantId);

  if (wantId) careerByEspnIdCache.set(wantId, out);
  if (nameTarget) careerByNameCache.set(nameTarget, out);
  return out;
}
