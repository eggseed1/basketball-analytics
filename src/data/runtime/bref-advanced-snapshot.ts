/**
 * Bundled Basketball-Reference advanced / per-game snapshot.
 * Loaded on the module graph for Cloudflare Workers (no node:fs).
 *
 * Keep transforms memoized — remapping ~650 players × N seasons per request
 * will trip Cloudflare 1102 CPU limits.
 */
import snapshot from "./bref-advanced-snapshot.json";
import {
  lookupEspnIdByPlayerName,
  lookupPlayerNameByEspnId,
  normalizeEspnLookupName,
} from "./espn-name-index";
import { resolveCanonicalTeam } from "@/data/identity/team-map";
import type { PlayerSeason } from "@/data/types";

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

const data = snapshot as SnapshotFile;
const seasons =
  data?.seasons && typeof data.seasons === "object" ? data.seasons : {};

const peerBoardCache = new Map<string, PlayerSeason[]>();
const advancedSeasonCache = new Map<string, BundledBrefAdvancedRow[]>();
const dedupedAdvancedCache = new Map<string, SlimAdvanced[]>();
const dedupedPerGameCache = new Map<string, SlimPerGame[]>();

function pctAsFraction(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value > 1 ? value / 100 : value;
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

export function getBundledBrefAdvancedSeason(
  canonicalSeason: string
): BundledBrefAdvancedRow[] | null {
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
      offensiveReboundPct: pctAsFraction(r.orbPct ?? 0),
      defensiveReboundPct: pctAsFraction(r.drbPct ?? 0),
      reboundPct: pctAsFraction(r.trbPct ?? 0),
      assistPct: pctAsFraction(r.astPct ?? 0),
      stealPct: pctAsFraction(r.stlPct ?? 0),
      blockPct: pctAsFraction(r.blkPct ?? 0),
      turnoverPct: pctAsFraction(r.tovPct ?? 0),
      usagePct: pctAsFraction(r.usg),
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

/** Find one player in a season without materializing the full peer board. */
export function findBundledBrefPlayer(
  canonicalSeason: string,
  playerName: string,
  teamAbbr?: string | null
): SlimAdvanced | null {
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
export function getBundledBrefPeerBoard(canonicalSeason: string): PlayerSeason[] {
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

  return {
    playerId: espnId ?? `bref:${key}:${canonicalSeason}`,
    playerName: adv.n,
    teamId,
    teamAbbreviation,
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
    usagePct: pctAsFraction(adv.usg),
    turnoverPct: pctAsFraction(adv.tovPct ?? 0),
    assistPct: pctAsFraction(adv.astPct ?? 0),
    offensiveReboundPct: pctAsFraction(adv.orbPct ?? 0),
    defensiveReboundPct: pctAsFraction(adv.drbPct ?? 0),
    reboundPct: pctAsFraction(adv.trbPct ?? 0),
    stealPct: pctAsFraction(adv.stlPct ?? 0),
    blockPct: pctAsFraction(adv.blkPct ?? 0),
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

/**
 * Multi-season career rows from the bundled BRef snapshot (Cloudflare fallback
 * when ESPN athlete career hangs / history disk is empty).
 */
const careerByEspnIdCache = new Map<string, PlayerSeason[]>();
const careerByNameCache = new Map<string, PlayerSeason[]>();

type CareerSlimHit = {
  season: string;
  adv: SlimAdvanced;
  pg?: SlimPerGame;
};

/** One-time index: espnId / normalized name → season hits (avoids O(seasons×players) per request). */
let careerSlimIndex: {
  byEspn: Map<string, CareerSlimHit[]>;
  byName: Map<string, CareerSlimHit[]>;
} | null = null;

function ensureCareerSlimIndex() {
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

function hitsToCareerRows(
  hits: CareerSlimHit[],
  playerId: string
): PlayerSeason[] {
  const bySeason = new Map<string, CareerSlimHit>();
  for (const hit of hits) {
    const prev = bySeason.get(hit.season);
    if (
      !prev ||
      hit.adv.gp > prev.adv.gp ||
      (hit.adv.gp === prev.adv.gp && hit.adv.mp > prev.adv.mp)
    ) {
      bySeason.set(hit.season, hit);
    }
  }
  return [...bySeason.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([, hit]) => {
      const row = toPeerSeasonRow(hit.adv, hit.pg, hit.season);
      return { ...row, playerId: playerId || row.playerId };
    });
}

export function getBundledBrefCareerForPlayer(options: {
  playerId?: string | null;
  playerName?: string | null;
}): PlayerSeason[] {
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

  const index = ensureCareerSlimIndex();
  let hits: CareerSlimHit[] = [];
  if (wantId) {
    hits = index.byEspn.get(wantId) ?? [];
  }
  if (!hits.length && nameTarget) {
    hits = index.byName.get(nameTarget) ?? [];
  }

  const out = hitsToCareerRows(hits, wantId);

  if (wantId) careerByEspnIdCache.set(wantId, out);
  if (nameTarget) careerByNameCache.set(nameTarget, out);
  return out;
}

export function brefAdvancedSnapshotMeta() {
  return {
    version: data.version ?? 0,
    generatedAt: data.generatedAt ?? null,
    seasons: Object.keys(seasons),
  };
}

/** Canonical seasons present in the bundled BRef snapshot (newest first). */
export function listBundledBrefSeasons(): string[] {
  return Object.keys(seasons).sort((a, b) => b.localeCompare(a));
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
export function getBundledBrefSearchIndex(): BundledBrefSearchRow[] {
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
export function getBundledBrefSeasonSearchRows(
  canonicalSeason: string
): BundledBrefSearchRow[] {
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
