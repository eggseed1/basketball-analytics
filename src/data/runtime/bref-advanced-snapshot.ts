/**
 * Season tables (per-game and advanced) from NBA Stats totals
 * (scripts/build-season-tables.ts). Lives under public/runtime (ASSETS) so the
 * ~9MB JSON stays off the Worker isolate; Node reads the same file from disk.
 *
 * Keep transforms memoized — remapping ~650 players × N seasons per request
 * will trip Cloudflare 1102 CPU limits.
 *
 * server-only: must never enter a client bundle.
 * Client-safe comps/futures types live in `@/lib/player-comp-futures-shared`.
 */
import "server-only";

import {
  lookupEspnIdByPlayerName,
  lookupPlayerNameByEspnId,
  normalizeEspnLookupName,
} from "./espn-name-index";
import { resolveCanonicalTeam } from "@/data/identity/team-map";
import { bundledHeightInches } from "./player-bio-snapshot";
import type { PlayerSeason } from "@/data/types";
import {
  bundledDrblOverlayMeta,
  getBundledDrblSeason,
} from "./drbl-overlay-snapshot";
import {
  bundledDarkoSeasonIds,
  bundledRaptorSeasonIds,
  getBundledDarkoSeason,
  getBundledRaptorSeason,
} from "./impact-overlay-snapshot";

type AssetsFetcher = {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
};

const ASSET_PATH = "/runtime/season-tables-snapshot.json";

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
  /** Stint team abbreviations on combined (2TM/TOT) rows, in order played. */
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

type SnapshotFile = {
  version: number;
  generatedAt?: string;
  seasons: Record<
    string,
    { advanced?: SlimAdvanced[]; perGame?: SlimPerGame[] }
  >;
};

export type BundledBrefAdvancedRow = {
  playerName: string;
  teamAbbr: string;
  gamesPlayed: number;
  gamesStarted: number;
  minutes: number;
  per: number;
  trueShootingPct: number;
  threePointAttemptRate: number;
  freeThrowRate: number;
  offensiveReboundPct: number;
  defensiveReboundPct: number;
  reboundPct: number;
  assistPct: number;
  stealPct: number;
  blockPct: number;
  turnoverPct: number;
  usagePct: number;
  ows: number;
  dws: number;
  winShares: number;
  winSharesPer48: number;
  obpm: number;
  dbpm: number;
  bpm: number;
  vorp: number;
  offensiveRating?: number;
  defensiveRating?: number;
  netRating?: number;
};

type SeasonTablesIndex = {
  version: number;
  generatedAt: string | null;
  seasons: SnapshotFile["seasons"];
};

let cachedIndex: SeasonTablesIndex | null | undefined;
let seasons: SnapshotFile["seasons"] = {};

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
    const pathMod = req("node:path") as typeof import("node:path");
    const file = pathMod.join(
      process.cwd(),
      "public",
      "runtime",
      "season-tables-snapshot.json"
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

/** Load season-tables once (ASSETS on CF, public/runtime on Node). */
export async function ensureSeasonTables(): Promise<boolean> {
  if (cachedIndex !== undefined) {
    return cachedIndex != null && Object.keys(seasons).length > 0;
  }
  const fromDisk = loadFromPublicDir();
  const file = fromDisk ?? (await loadFromAssets());
  if (!file?.seasons || typeof file.seasons !== "object") {
    cachedIndex = null;
    seasons = {};
    return false;
  }
  seasons = file.seasons;
  cachedIndex = {
    version: file.version ?? 0,
    generatedAt: file.generatedAt ?? null,
    seasons,
  };
  return Object.keys(seasons).length > 0;
}

const peerBoardCache = new Map<string, PlayerSeason[]>();
const advancedSeasonCache = new Map<string, BundledBrefAdvancedRow[]>();
const dedupedAdvancedCache = new Map<string, SlimAdvanced[]>();
const dedupedPerGameCache = new Map<string, SlimPerGame[]>();

function pctAsFraction(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value > 1 ? value / 100 : value;
}

/**
 * BRef rate columns (USG%, AST%, TRB%, STL%, BLK%, TOV%) are always percent
 * points, so a 0.6% block rate must not pass through as 0.6.
 */
function percentPoints(value: number | undefined): number {
  if (value == null || !Number.isFinite(value) || value <= 0) return 0;
  return value / 100;
}

function dedupeSlimByPlayerTeam<
  T extends { n: string; t: string; gp: number; mp?: number },
>(rows: T[]): T[] {
  const best = new Map<string, T>();
  for (const row of rows) {
    const key = `${row.n.toLowerCase()}|${row.t}`;
    const prev = best.get(key);
    if (
      !prev ||
      row.gp > prev.gp ||
      (row.gp === prev.gp && (row.mp ?? 0) > (prev.mp ?? 0))
    ) {
      best.set(key, row);
    }
  }
  return [...best.values()];
}

function advancedForSeason(canonicalSeason: string): SlimAdvanced[] {
  const cached = dedupedAdvancedCache.get(canonicalSeason);
  if (cached) return cached;
  const rows = dedupeSlimByPlayerTeam(
    seasons[canonicalSeason]?.advanced ?? []
  );
  dedupedAdvancedCache.set(canonicalSeason, rows);
  return rows;
}

function perGameForSeason(canonicalSeason: string): SlimPerGame[] {
  const cached = dedupedPerGameCache.get(canonicalSeason);
  if (cached) return cached;
  const rows = dedupeSlimByPlayerTeam(
    seasons[canonicalSeason]?.perGame ?? []
  );
  dedupedPerGameCache.set(canonicalSeason, rows);
  return rows;
}

export async function getBundledBrefAdvancedSeason(
  canonicalSeason: string
): Promise<BundledBrefAdvancedRow[] | null> {
  await ensureSeasonTables();
  const hit = advancedSeasonCache.get(canonicalSeason);
  if (hit) return hit;
  const raw = advancedForSeason(canonicalSeason);
  if (!raw.length) return null;
  const rows = raw.map((r) => {
    const ortg = r.ortg != null && r.ortg > 0 ? r.ortg : undefined;
    const drtg = r.drtg != null && r.drtg > 0 ? r.drtg : undefined;
    return {
      playerName: r.n,
      teamAbbr: r.t,
      gamesPlayed: r.gp,
      gamesStarted: 0,
      minutes: r.mp,
      per: r.per,
      trueShootingPct: pctAsFraction(r.ts),
      threePointAttemptRate: pctAsFraction(r.fg3Ar ?? 0),
      freeThrowRate: pctAsFraction(r.ftr ?? 0),
      offensiveReboundPct: percentPoints(r.orbPct ?? 0),
      defensiveReboundPct: percentPoints(r.drbPct ?? 0),
      reboundPct: percentPoints(r.trbPct ?? 0),
      assistPct: percentPoints(r.astPct ?? 0),
      stealPct: percentPoints(r.stlPct ?? 0),
      blockPct: percentPoints(r.blkPct ?? 0),
      turnoverPct: percentPoints(r.tovPct ?? 0),
      usagePct: percentPoints(r.usg),
      ows: r.ows,
      dws: r.dws,
      winShares: r.ws,
      winSharesPer48: r.ws48,
      obpm: r.obpm,
      dbpm: r.dbpm,
      bpm: r.bpm,
      vorp: r.vorp,
      ...(ortg != null ? { offensiveRating: ortg } : {}),
      ...(drtg != null ? { defensiveRating: drtg } : {}),
      ...(ortg != null && drtg != null ? { netRating: ortg - drtg } : {}),
    };
  });
  advancedSeasonCache.set(canonicalSeason, rows);
  return rows;
}

/** Slim usage and shooting rows for league-wide charts (memoized source). */
export async function getBundledBrefUsageRows(
  canonicalSeason: string
): Promise<Array<{
  n: string;
  t: string;
  e?: string;
  gp: number;
  mp: number;
  ts: number;
  usg: number;
  bpm: number;
  astPct?: number;
  tovPct?: number;
  tm?: string[];
}>> {
  await ensureSeasonTables();
  return advancedForSeason(canonicalSeason).map((r) => ({
    n: r.n,
    t: r.t,
    e: r.e,
    gp: r.gp,
    mp: r.mp,
    ts: r.ts,
    usg: r.usg,
    bpm: r.bpm,
    astPct: r.astPct,
    tovPct: r.tovPct,
    tm: r.tm,
  }));
}

/** Find one player in a season without materializing the full peer board. */
export async function findBundledBrefPlayer(
  canonicalSeason: string,
  playerName: string,
  teamAbbr?: string | null
): Promise<SlimAdvanced | null> {
  await ensureSeasonTables();
  const rows = advancedForSeason(canonicalSeason);
  if (!rows.length) return null;
  const want = normalizeEspnLookupName(playerName);
  if (!want) return null;
  const abbr = (teamAbbr ?? "").toUpperCase();
  let nameHit: SlimAdvanced | null = null;
  for (const row of rows) {
    if (normalizeEspnLookupName(row.n) !== want) continue;
    if (abbr && row.t === abbr) return row;
    if (!nameHit) nameHit = row;
  }
  return nameHit;
}

/** Synthetic peer board when ESPN/NBA Stats boards are empty on CF. */
export async function getBundledBrefPeerBoard(canonicalSeason: string): Promise<PlayerSeason[]> {
  await ensureSeasonTables();
  const cached = peerBoardCache.get(canonicalSeason);
  if (cached) return cached;

  const advanced = advancedForSeason(canonicalSeason);
  const perGame = perGameForSeason(canonicalSeason);
  if (!advanced.length && !perGame.length) {
    peerBoardCache.set(canonicalSeason, []);
    return [];
  }

  const pgByKey = new Map<string, SlimPerGame>();
  for (const r of perGame) {
    pgByKey.set(`${r.n.toLowerCase()}|${r.t}`, r);
  }
  // Name-only fallback so TOT advanced can still attach per-game counting.
  const pgByName = new Map<string, SlimPerGame>();
  for (const r of perGame) {
    const name = r.n.toLowerCase();
    const prev = pgByName.get(name);
    if (!prev || isCombinedTeamAbbr(r.t) || (r.gp ?? 0) > (prev.gp ?? 0)) {
      pgByName.set(name, r);
    }
  }

  const collapsedAdvanced = collapseSlimRowsToSeasonGrain(advanced);
  const out: PlayerSeason[] = [];
  const seen = new Set<string>();
  for (const adv of collapsedAdvanced) {
    const key = `${adv.n.toLowerCase()}|${adv.t}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const pg =
      pgByKey.get(key) ??
      pgByName.get(adv.n.toLowerCase());
    out.push(toPeerSeasonRow(adv, pg, canonicalSeason));
  }
  peerBoardCache.set(canonicalSeason, out);
  return out;
}

const COMBINED_TEAM_ABBRS = new Set(["TOT", "2TM", "3TM", "4TM"]);

function isCombinedTeamAbbr(team: string | null | undefined): boolean {
  return COMBINED_TEAM_ABBRS.has(String(team ?? "").toUpperCase().trim());
}

function collapseSlimRowsToSeasonGrain<T extends { n: string; t: string; gp?: number; mp?: number }>(
  rows: T[]
): T[] {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = String(row.n ?? "")
      .toLowerCase()
      .trim();
    if (!key) continue;
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }
  const out: T[] = [];
  for (const list of groups.values()) {
    const combined = list.find((r) => isCombinedTeamAbbr(r.t));
    if (combined) {
      out.push(combined);
      continue;
    }
    let best = list[0]!;
    for (const row of list) {
      if ((row.gp ?? 0) > (best.gp ?? 0)) best = row;
      else if (
        (row.gp ?? 0) === (best.gp ?? 0) &&
        (row.mp ?? 0) > (best.mp ?? 0)
      ) {
        best = row;
      }
    }
    out.push(best);
  }
  return out;
}

function toPeerSeasonRow(
  adv: SlimAdvanced,
  pg: SlimPerGame | undefined,
  canonicalSeason: string
): PlayerSeason {
  const key = `${adv.n.toLowerCase()}|${adv.t}`;
  const gp = Math.max(1, adv.gp || pg?.gp || 0);
  const mpg = pg?.mp ?? (adv.mp > 0 && adv.gp > 0 ? adv.mp / adv.gp : 0);
  // Prefer build-time `e` only — live name lookups across ~650 rows trip CF 1102.
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
  const fg2m =
    pg?.fg2m != null ? pg.fg2m * gp : Math.max(0, fgm - fg3m);
  const fg2a =
    pg?.fg2a != null ? pg.fg2a * gp : Math.max(0, fga - fg3a);
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
    // Unknown on BRef league tables — leave non-finite so the sheet shows "-".
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

type CareerSlimHit = {
  season: string;
  adv: SlimAdvanced;
  pg?: SlimPerGame;
};

/** One-time index for comps pool only (explore still owns season-tables). */
let careerSlimIndex: {
  byEspn: Map<string, CareerSlimHit[]>;
  byName: Map<string, CareerSlimHit[]>;
} | null = null;

async function ensureCareerSlimIndex() {
  await ensureSeasonTables();
  if (careerSlimIndex) return careerSlimIndex;
  const byEspn = new Map<string, CareerSlimHit[]>();
  const byName = new Map<string, CareerSlimHit[]>();
  for (const canonical of Object.keys(seasons)) {
    const advanced = advancedForSeason(canonical);
    const perGame = perGameForSeason(canonical);
    const pgByKey = new Map(
      perGame.map((r) => [`${r.n.toLowerCase()}|${r.t}`, r] as const)
    );
    for (const adv of advanced) {
      const pg = pgByKey.get(`${adv.n.toLowerCase()}|${adv.t}`);
      const hit: CareerSlimHit = { season: canonical, adv, pg };
      if (adv.e) {
        const list = byEspn.get(adv.e) ?? [];
        list.push(hit);
        byEspn.set(adv.e, list);
      }
      const nameKey = normalizeEspnLookupName(adv.n);
      if (nameKey) {
        const list = byName.get(nameKey) ?? [];
        list.push(hit);
        byName.set(nameKey, list);
      }
    }
  }
  careerSlimIndex = { byEspn, byName };
  return careerSlimIndex;
}

/** Player careers live in player-career-bref-snapshot (keeps /players off season-tables). */
export { getBundledBrefCareerForPlayer } from "./player-career-bref-snapshot";

export type BundledCompPoolRow = {
  playerId: string;
  playerName: string;
  season: string;
  teamId: string;
  age: number;
  gamesPlayed: number;
  minutes: number;
  bpm: number;
  vorp: number | null;
  trueShootingPct: number;
  usagePct: number;
  assistPct: number;
  reboundPct: number;
  drbl100: number | null;
  war1: number | null;
  drblO: number | null;
  drblD: number | null;
  darko: number | null;
  darkoOff: number | null;
  darkoDef: number | null;
  raptor: number | null;
  obpm: number | null;
  dbpm: number | null;
  pts36: number | null;
  trb36: number | null;
  ast36: number | null;
  heightInches: number | null;
  positionCode: number | null;
  /** Prior seasons with at least 10 games. */
  experience: number;
};

let bundledCompPool: BundledCompPoolRow[] | null = null;

/**
 * One slim row per ESPN id × season for same-age comps. Built from the
 * already-walked career index so player pages do not rematerialize peer boards.
 */
export async function getBundledCompPool(): Promise<BundledCompPoolRow[]> {
  if (bundledCompPool) return bundledCompPool;
  const { ensurePlayerBio } = await import("./player-bio-snapshot");
  await ensurePlayerBio();
  const index = await ensureCareerSlimIndex();
  const idByName = new Map<string, string>();
  for (const [nameKey, hits] of index.byName) {
    const espnId = hits.find((hit) => hit.adv.e)?.adv.e;
    idByName.set(nameKey, espnId || `n:${nameKey}`);
  }
  const best = new Map<string, BundledCompPoolRow>();
  for (const [nameKey, hits] of index.byName) {
    const playerId = idByName.get(nameKey)!;
    for (const hit of hits) {
      const age = hit.pg?.age;
      const bpm = hit.adv.bpm;
      const gp = hit.adv.gp || hit.pg?.gp || 0;
      if (age == null || !Number.isFinite(age) || age < 18 || age > 44) continue;
      if (bpm == null || !Number.isFinite(bpm)) continue;
      if (gp < 1) continue;
      const mpg =
        hit.pg?.mp ??
        (hit.adv.mp > 0 && gp > 0 ? hit.adv.mp / gp : 0);
      const key = `${playerId}|${hit.season}`;
      const prev = best.get(key);
      if (prev && prev.gamesPlayed >= gp) continue;
      const resolvedTeam = resolveCanonicalTeam(hit.adv.t);
      best.set(key, {
        playerId,
        playerName: hit.adv.n,
        season: hit.season,
        teamId:
          resolvedTeam.status === "resolved"
            ? resolvedTeam.team.canonicalTeamId
            : hit.adv.t,
        age: Math.round(age),
        gamesPlayed: gp,
        minutes: mpg * gp,
        bpm,
        vorp: Number.isFinite(hit.adv.vorp) ? hit.adv.vorp : null,
        trueShootingPct: pctAsFraction(hit.adv.ts),
        usagePct: percentPoints(hit.adv.usg),
        assistPct: percentPoints(hit.adv.astPct ?? 0),
        reboundPct: percentPoints(hit.adv.trbPct ?? 0),
        drbl100: null,
        war1: null,
        drblO: null,
        drblD: null,
        darko: null,
        darkoOff: null,
        darkoDef: null,
        raptor: null,
        obpm: Number.isFinite(hit.adv.obpm) ? hit.adv.obpm : null,
        dbpm: Number.isFinite(hit.adv.dbpm) ? hit.adv.dbpm : null,
        pts36: per36(hit.pg?.pts, mpg),
        trb36: per36(hit.pg?.trb, mpg),
        ast36: per36(hit.pg?.ast, mpg),
        heightInches: bundledHeightInches(playerId),
        positionCode: positionCode(hit.pg?.pos),
        experience: 0,
      });
    }
  }
  const { ensureDrblOverlay } = await import(
    "@/data/runtime/drbl-overlay-snapshot"
  );
  await ensureDrblOverlay();
  const drblSeasons = bundledDrblOverlayMeta().seasons ?? [];
  for (const season of drblSeasons) {
    for (const row of getBundledDrblSeason(season)) {
      const espnId = lookupEspnIdByPlayerName(row.playerName);
      if (!espnId) continue;
      const hit = best.get(`${espnId}|${season}`);
      if (!hit) continue;
      hit.drbl100 = Number.isFinite(row.drbl100) ? row.drbl100 : null;
      hit.war1 =
        row.r1WinEquivalents != null && Number.isFinite(row.r1WinEquivalents)
          ? row.r1WinEquivalents
          : null;
      hit.drblO = row.drblO != null && Number.isFinite(row.drblO) ? row.drblO : null;
      hit.drblD = row.drblD != null && Number.isFinite(row.drblD) ? row.drblD : null;
    }
  }
  for (const season of await bundledDarkoSeasonIds()) {
    for (const row of await getBundledDarkoSeason(season)) {
      const espnId = lookupEspnIdByPlayerName(row.playerName);
      if (!espnId) continue;
      const hit = best.get(`${espnId}|${season}`);
      if (!hit) continue;
      hit.darko = Number.isFinite(row.impact) ? row.impact : null;
      hit.darkoOff =
        row.offensive != null && Number.isFinite(row.offensive) ? row.offensive : null;
      hit.darkoDef =
        row.defensive != null && Number.isFinite(row.defensive) ? row.defensive : null;
    }
  }
  for (const season of await bundledRaptorSeasonIds()) {
    for (const row of await getBundledRaptorSeason(season)) {
      const espnId = lookupEspnIdByPlayerName(row.playerName);
      if (!espnId) continue;
      const hit = best.get(`${espnId}|${season}`);
      if (!hit) continue;
      hit.raptor = Number.isFinite(row.impact) ? row.impact : null;
    }
  }
  const byPlayer = new Map<string, BundledCompPoolRow[]>();
  for (const row of best.values()) {
    const list = byPlayer.get(row.playerId) ?? [];
    list.push(row);
    byPlayer.set(row.playerId, list);
  }
  for (const list of byPlayer.values()) {
    list.sort((a, b) => a.season.localeCompare(b.season));
    let prior = 0;
    for (const row of list) {
      row.experience = prior;
      if (row.gamesPlayed >= 10) prior += 1;
    }
  }
  bundledCompPool = [...best.values()];
  return bundledCompPool;
}

function per36(perGame: number | undefined, minutesPerGame: number): number | null {
  if (perGame == null || !Number.isFinite(perGame) || minutesPerGame < 8) return null;
  return (perGame * 36) / minutesPerGame;
}

function positionCode(pos: string | undefined): number | null {
  if (!pos) return null;
  const label = pos.toUpperCase().replace(/[^A-Z]/g, "");
  const scale: Record<string, number> = {
    PG: 0,
    G: 0.25,
    SG: 0.5,
    GF: 0.75,
    SF: 1,
    F: 1,
    PF: 1.5,
    FC: 1.75,
    CF: 1.75,
    C: 2,
  };
  if (label in scale) return scale[label]!;
  if (label.startsWith("PG")) return 0;
  if (label.startsWith("SG")) return 0.5;
  if (label.startsWith("SF")) return 1;
  if (label.startsWith("PF")) return 1.5;
  if (label.startsWith("C")) return 2;
  if (label.startsWith("G")) return 0.25;
  if (label.startsWith("F")) return 1;
  return null;
}

export function compPositionCode(pos: string | undefined): number | null {
  return positionCode(pos);
}

export async function brefAdvancedSnapshotMeta() {
  await ensureSeasonTables();
  return {
    version: cachedIndex?.version ?? 0,
    generatedAt: cachedIndex?.generatedAt ?? null,
    seasons: Object.keys(seasons),
  };
}

/** Canonical seasons present in the bundled BRef snapshot (newest first). */
export async function listBundledBrefSeasons(): Promise<string[]> {
  await ensureSeasonTables();
  return Object.keys(seasons).sort((a, b) => b.localeCompare(a));
}

/**
 * Slim advanced row count for a season — readiness checks without building the
 * fat PlayerSeason peer board (~650 rows × N seasons on Explore cold MISS).
 */
export async function getBundledBrefAdvancedRowCount(
  canonicalSeason: string
): Promise<number> {
  await ensureSeasonTables();
  return advancedForSeason(canonicalSeason).length;
}

export type BundledBrefSearchRow = {
  id: string;
  name: string;
  nameLower: string;
  team: string;
  season: string;
  minutes: number;
};

let bundledSearchIndex: BundledBrefSearchRow[] | null = null;

/**
 * One lightweight cross-season name index for header search.
 * Avoids materializing ~650 fat PlayerSeason rows × N seasons (CF 1102).
 */
export async function getBundledBrefSearchIndex(): Promise<BundledBrefSearchRow[]> {
  await ensureSeasonTables();
  if (bundledSearchIndex) return bundledSearchIndex;

  const byKey = new Map<string, BundledBrefSearchRow>();
  for (const canonical of Object.keys(seasons).sort((a, b) =>
    b.localeCompare(a)
  )) {
    const advanced = advancedForSeason(canonical);
    const perGame = perGameForSeason(canonical);
    const pgByKey = new Map(
      perGame.map((r) => [`${r.n.toLowerCase()}|${r.t}`, r] as const)
    );
    for (const adv of advanced) {
      const pg = pgByKey.get(`${adv.n.toLowerCase()}|${adv.t}`);
      const espnId = (adv.e || pg?.e || "").trim();
      const nameKey = normalizeEspnLookupName(adv.n);
      const dedupe = espnId || nameKey;
      if (!dedupe || byKey.has(dedupe)) continue;
      const gp = Math.max(1, adv.gp || pg?.gp || 0);
      const mpg = pg?.mp ?? (adv.mp > 0 && adv.gp > 0 ? adv.mp / adv.gp : 0);
      // Prefer ESPN id; fall back to name-index lookup for bare BRef rows.
      const resolvedId =
        espnId ||
        lookupEspnIdByPlayerName(adv.n) ||
        `bref:${nameKey}`;
      byKey.set(dedupe, {
        id: resolvedId,
        name: adv.n,
        nameLower: adv.n.toLowerCase(),
        team: adv.t,
        season: canonical,
        minutes: mpg * gp,
      });
    }
  }

  bundledSearchIndex = [...byKey.values()];
  return bundledSearchIndex;
}

/** Slim current-season rows for search (no full peer-board materialization). */
export async function getBundledBrefSeasonSearchRows(
  canonicalSeason: string
): Promise<BundledBrefSearchRow[]> {
  await ensureSeasonTables();
  const key = String(canonicalSeason ?? "").trim();
  if (!key) return [];
  const advanced = advancedForSeason(key);
  if (!advanced.length) return [];
  const perGame = perGameForSeason(key);
  const pgByKey = new Map(
    perGame.map((r) => [`${r.n.toLowerCase()}|${r.t}`, r] as const)
  );
  const out: BundledBrefSearchRow[] = [];
  const seen = new Set<string>();
  for (const adv of advanced) {
    const nameKey = normalizeEspnLookupName(adv.n);
    const pg = pgByKey.get(`${adv.n.toLowerCase()}|${adv.t}`);
    const espnId = (adv.e || pg?.e || "").trim();
    const dedupe = espnId || `${nameKey}|${adv.t}`;
    if (!dedupe || seen.has(dedupe)) continue;
    seen.add(dedupe);
    const gp = Math.max(1, adv.gp || pg?.gp || 0);
    const mpg = pg?.mp ?? (adv.mp > 0 && adv.gp > 0 ? adv.mp / adv.gp : 0);
    out.push({
      id: espnId || lookupEspnIdByPlayerName(adv.n) || `bref:${nameKey}`,
      name: adv.n,
      nameLower: adv.n.toLowerCase(),
      team: adv.t,
      season: key,
      minutes: mpg * gp,
    });
  }
  return out;
}
