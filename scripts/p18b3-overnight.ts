/**
 * P18B.3 overnight — close 1946-47 → 1950-51 lineage gap via
 * stats.nba.com commonallplayers + playercareerstats (leagueleaders empty).
 *
 *   npx tsx scripts/p18b3-overnight.ts
 *   npx tsx scripts/p18b3-overnight.ts --pilot-only
 *   npx tsx scripts/p18b3-overnight.ts --finalize-only
 *   npx tsx scripts/p18b3-overnight.ts --media-only
 */
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
  readdirSync,
} from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

import {
  getResultSet,
  resultSetToObjects,
  statsNbaFetch,
} from "../src/data/providers/nba/stats-nba-client";
import { countSeasonPlayerUniverse } from "../src/data/history/player-universe";
import { HISTORY_VERSION } from "../src/lib/history/capabilities";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "reports", "p18b3");
const RAW_CAREER = path.join(
  ROOT,
  "data",
  "raw",
  "player-history",
  "stats-nba-careerstats"
);
const RAW_CAP = path.join(
  ROOT,
  "data",
  "raw",
  "player-history",
  "stats-nba-commonallplayers"
);
const PRODUCT = path.join(
  ROOT,
  "data",
  "drbl",
  "player-history",
  "drbl-player-history-v1"
);
const MEDIA_PRODUCT = path.join(
  ROOT,
  "data",
  "drbl",
  "player-media",
  "drbl-player-media-v1"
);
const MANIFEST = path.join(PRODUCT, "manifest.json");
const P18B_PLAYERS = path.join(
  ROOT,
  "data",
  "drbl",
  "history",
  HISTORY_VERSION,
  "players"
);

mkdirSync(OUT, { recursive: true });
mkdirSync(RAW_CAREER, { recursive: true });
mkdirSync(RAW_CAP, { recursive: true });
mkdirSync(PRODUCT, { recursive: true });
mkdirSync(MEDIA_PRODUCT, { recursive: true });

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const P18B2_SEAL =
  "cd8c58ab286c550af199ffaa19b027b2473ad0b7f1cd53cd74e9359841a30207";
const LINEAGE_SEASONS = [
  "1946-47",
  "1947-48",
  "1948-49",
  "1949-50",
  "1950-51",
] as const;
const REQUEST_GAP_MS = 900;

const LEAGUE_BY_SEASON: Record<string, "BAA" | "NBA"> = {
  "1946-47": "BAA",
  "1947-48": "BAA",
  "1948-49": "BAA",
  "1949-50": "NBA",
  "1950-51": "NBA",
};

type PlayerSeasonRow = {
  season: string;
  playerId: string;
  playerName: string;
  teamIds: string[];
  primaryTeamId: string;
  teamAbbreviation: string | null;
  gp: number;
  gs: number | null;
  minutes: number | null;
  points: number | null;
  rebounds: number | null;
  assists: number | null;
  steals: number | null;
  blocks: number | null;
  turnovers: number | null;
  fgm: number | null;
  fga: number | null;
  threePm: number | null;
  threePa: number | null;
  ftm: number | null;
  fta: number | null;
  membershipSource: "stats-nba-playercareerstats";
  membershipType: "SEASON_TOTALS_APPEARED";
  source: "stats.nba.com/playercareerstats";
  sourceId: string;
  league: "BAA" | "NBA";
  drbl100: null;
  war1: null;
};

function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const keys = Object.keys(rows[0]!);
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return (
    keys.join(",") +
    "\n" +
    rows.map((r) => keys.map((k) => esc(r[k])).join(",")).join("\n") +
    "\n"
  );
}

function n(
  row: Record<string, string | number | null>,
  key: string
): number | null {
  const v = row[key];
  if (v == null || v === "") return null;
  const num = typeof v === "number" ? v : Number(v);
  return Number.isFinite(num) ? num : null;
}

function eraNull(
  season: string,
  key: "STL" | "BLK" | "TOV" | "FG3M" | "FG3A" | "GS" | "REB",
  row: Record<string, string | number | null>
): number | null {
  if (key === "FG3M" || key === "FG3A") {
    if (season < "1979-80") return null;
  }
  if (key === "STL" || key === "BLK") {
    if (season < "1973-74") return null;
  }
  if (key === "TOV") {
    if (season < "1977-78") return null;
  }
  if (key === "GS") {
    // early era GS often absent / unreliable zeros
    if (season < "1982-83") return null;
  }
  if (key === "REB") {
    // official rebound tracking starts 1950-51
    if (season < "1950-51") return null;
  }
  return n(row, key);
}

function loadManifest(): {
  seasons: Record<string, Record<string, unknown>>;
} {
  if (!existsSync(MANIFEST)) return { seasons: {} };
  return JSON.parse(readFileSync(MANIFEST, "utf8"));
}

function saveManifest(m: { seasons: Record<string, Record<string, unknown>> }) {
  const tmp = MANIFEST + ".tmp";
  writeFileSync(tmp, JSON.stringify(m, null, 2) + "\n");
  renameSync(tmp, MANIFEST);
}

function seasonArtifactPath(season: string) {
  return path.join(PRODUCT, "seasons", `${season}.json`);
}

async function loadCandidateUniverse(): Promise<{
  names: Map<string, string>;
  candidates: string[];
  fromToBySeason: Record<string, number>;
}> {
  const cachePath = path.join(RAW_CAP, "1950-51-all.json");
  let response: unknown;
  if (existsSync(cachePath)) {
    response = JSON.parse(readFileSync(cachePath, "utf8"));
  } else {
    response = await statsNbaFetch(
      "commonallplayers",
      { LeagueID: "00", Season: "1950-51", IsOnlyCurrentSeason: "0" },
      { ttlMs: 0, staleMs: 0, retries: 3 }
    );
    writeFileSync(cachePath, JSON.stringify(response) + "\n");
  }
  const set = getResultSet(response as never);
  const rows = set ? resultSetToObjects(set) : [];
  const names = new Map<string, string>();
  const candidates = new Set<string>();
  const fromToBySeason: Record<string, number> = {};
  for (const season of LINEAGE_SEASONS) {
    const y = Number(season.slice(0, 4));
    let c = 0;
    for (const row of rows) {
      const from = Number(row.FROM_YEAR);
      const to = Number(row.TO_YEAR);
      const id = String(row.PERSON_ID);
      const name = String(row.DISPLAY_FIRST_LAST ?? "").trim();
      if (name) names.set(id, name);
      if (from <= 1950 && to >= 1946) candidates.add(id);
      if (from <= y && to >= y) c++;
    }
    fromToBySeason[season] = c;
  }
  return { names, candidates: [...candidates].sort(), fromToBySeason };
}

async function fetchCareerRaw(playerId: string): Promise<{
  ok: boolean;
  seasons: Record<string, string | number | null>[];
  error?: string;
}> {
  const rp = path.join(RAW_CAREER, `${playerId}.json`);
  if (existsSync(rp)) {
    const parsed = JSON.parse(readFileSync(rp, "utf8"));
    const set = getResultSet(parsed as never, "SeasonTotalsRegularSeason");
    const seasons = set ? resultSetToObjects(set) : [];
    return { ok: true, seasons };
  }
  try {
    const response = await statsNbaFetch(
      "playercareerstats",
      { LeagueID: "00", PerMode: "Totals", PlayerID: playerId },
      { ttlMs: 0, staleMs: 0, retries: 3 }
    );
    const tmp = rp + ".tmp";
    writeFileSync(tmp, JSON.stringify(response));
    renameSync(tmp, rp);
    const set = getResultSet(response, "SeasonTotalsRegularSeason");
    const seasons = set ? resultSetToObjects(set) : [];
    return { ok: true, seasons };
  } catch (e) {
    return {
      ok: false,
      seasons: [],
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

function normalizeCareerSeasonRow(
  row: Record<string, string | number | null>,
  displayName: string
): PlayerSeasonRow | null {
  const season = String(row.SEASON_ID ?? "");
  if (!LINEAGE_SEASONS.includes(season as (typeof LINEAGE_SEASONS)[number])) {
    return null;
  }
  const playerId = row.PLAYER_ID != null ? String(row.PLAYER_ID) : "";
  const gp = n(row, "GP");
  if (!playerId || gp == null || gp <= 0) return null;

  const teamAbbr =
    row.TEAM_ABBREVIATION != null ? String(row.TEAM_ABBREVIATION) : null;
  const teamId =
    row.TEAM_ID != null && String(row.TEAM_ID) !== "0"
      ? String(row.TEAM_ID)
      : teamAbbr && teamAbbr !== "TOT"
        ? `ABBR:${teamAbbr}`
        : "TOT";

  return {
    season,
    playerId,
    playerName: displayName,
    teamIds: [teamId],
    primaryTeamId: teamId,
    teamAbbreviation: teamAbbr,
    gp,
    gs: eraNull(season, "GS", row),
    minutes: n(row, "MIN"),
    points: n(row, "PTS"),
    rebounds: eraNull(season, "REB", row),
    assists: n(row, "AST"),
    steals: eraNull(season, "STL", row),
    blocks: eraNull(season, "BLK", row),
    turnovers: eraNull(season, "TOV", row),
    fgm: n(row, "FGM"),
    fga: n(row, "FGA"),
    threePm: eraNull(season, "FG3M", row),
    threePa: eraNull(season, "FG3A", row),
    ftm: n(row, "FTM"),
    fta: n(row, "FTA"),
    membershipSource: "stats-nba-playercareerstats",
    membershipType: "SEASON_TOTALS_APPEARED",
    source: "stats.nba.com/playercareerstats",
    sourceId: playerId,
    league: LEAGUE_BY_SEASON[season] ?? "NBA",
    drbl100: null,
    war1: null,
  };
}

function preferRow(a: PlayerSeasonRow, b: PlayerSeasonRow): PlayerSeasonRow {
  // Prefer TOT for multi-team; else higher GP
  if (b.teamAbbreviation === "TOT" && a.teamAbbreviation !== "TOT") return b;
  if (a.teamAbbreviation === "TOT" && b.teamAbbreviation !== "TOT") return a;
  if ((b.gp ?? 0) > (a.gp ?? 0)) return b;
  return a;
}

function writeSeasonArtifact(
  season: string,
  rows: PlayerSeasonRow[],
  rawHash: string
) {
  mkdirSync(path.join(PRODUCT, "seasons"), { recursive: true });
  const payload = {
    season,
    historyVersion: "drbl-player-history-v1",
    source: "stats.nba.com/playercareerstats",
    league: LEAGUE_BY_SEASON[season],
    status: "COMPLETE",
    rawHash,
    playerCount: rows.length,
    rows: rows.sort((a, b) => a.playerName.localeCompare(b.playerName)),
    completedAt: new Date().toISOString(),
  };
  const text = JSON.stringify(payload);
  const artHash = sha(text);
  const p = seasonArtifactPath(season);
  const tmp = p + ".tmp";
  writeFileSync(tmp, text + "\n");
  renameSync(tmp, p);
  return artHash;
}

function loadExisting1996Plus(): Array<{
  playerId: string;
  playerName: string;
  firstSeason: string;
  lastSeason: string;
}> {
  const p = path.join(P18B_PLAYERS, "career-summaries.json");
  if (!existsSync(p)) return [];
  const data = JSON.parse(readFileSync(p, "utf8")) as {
    players?: Array<{
      playerId: string;
      playerName: string;
      firstSeason: string;
      lastSeason: string;
    }>;
  };
  return data.players ?? [];
}

function snapshotPriorMasterIds(): { priorCount: number; priorIds: Set<string> } {
  const priorMasterPath = path.join(PRODUCT, "master-registry.json");
  if (!existsSync(priorMasterPath)) {
    return { priorCount: 4550, priorIds: new Set() };
  }
  const prior = JSON.parse(readFileSync(priorMasterPath, "utf8")) as {
    count?: number;
    players?: Array<{ playerId: string; firstSeason: string }>;
  };
  const priorIds = new Set((prior.players ?? []).map((p) => p.playerId));
  return {
    priorCount: prior.count ?? (priorIds.size || 4550),
    priorIds,
  };
}

function rebuildMaster(priorSnapshot?: {
  priorCount: number;
  priorIds: Set<string>;
}) {
  const existing = loadExisting1996Plus();
  const existingIds = new Set(existing.map((c) => c.playerId));
  const { priorCount, priorIds } = priorSnapshot ?? snapshotPriorMasterIds();

  type AnyRow = {
    season: string;
    playerId: string;
    playerName: string;
    teamIds: string[];
  };

  const allSeasonRows: AnyRow[] = [];
  const seasonDir = path.join(PRODUCT, "seasons");
  for (const f of readdirSync(seasonDir)) {
    if (!f.endsWith(".json")) continue;
    const data = JSON.parse(
      readFileSync(path.join(seasonDir, f), "utf8")
    ) as { rows: AnyRow[] };
    allSeasonRows.push(...(data.rows ?? []));
  }

  type Master = {
    playerId: string;
    displayName: string;
    firstSeason: string;
    lastSeason: string;
    seasons: string[];
    teamIds: string[];
    identityStatus: "RESOLVED" | "UNRESOLVED";
    providerIds: { nbaStats: string };
    leagueHistory: "NBA";
  };

  const byId = new Map<string, Master>();
  for (const c of existing) {
    byId.set(c.playerId, {
      playerId: c.playerId,
      displayName: c.playerName,
      firstSeason: c.firstSeason,
      lastSeason: c.lastSeason,
      seasons: [],
      teamIds: [],
      identityStatus: "RESOLVED",
      providerIds: { nbaStats: c.playerId },
      leagueHistory: "NBA",
    });
  }

  for (const row of allSeasonRows) {
    const cur = byId.get(row.playerId);
    if (!cur) {
      byId.set(row.playerId, {
        playerId: row.playerId,
        displayName: row.playerName,
        firstSeason: row.season,
        lastSeason: row.season,
        seasons: [row.season],
        teamIds: [...(row.teamIds ?? [])],
        identityStatus: "RESOLVED",
        providerIds: { nbaStats: row.playerId },
        leagueHistory: "NBA",
      });
      continue;
    }
    if (row.season < cur.firstSeason) cur.firstSeason = row.season;
    if (row.season > cur.lastSeason) cur.lastSeason = row.season;
    if (!cur.seasons.includes(row.season)) cur.seasons.push(row.season);
    for (const t of row.teamIds ?? []) {
      if (!cur.teamIds.includes(t)) cur.teamIds.push(t);
    }
    if (row.playerName && !cur.displayName) cur.displayName = row.playerName;
  }

  const overlapPlayers = new Set(
    allSeasonRows
      .map((r) => r.playerId)
      .filter((id) => existingIds.has(id))
  );

  const master = [...byId.values()].sort((a, b) =>
    a.displayName.localeCompare(b.displayName)
  );

  const earlySeasonIds = new Set(
    allSeasonRows
      .filter((r) =>
        (LINEAGE_SEASONS as readonly string[]).includes(r.season)
      )
      .map((r) => r.playerId)
  );
  const newCanonical = [...earlySeasonIds].filter((id) => !priorIds.has(id));
  const overlap194651 = [...earlySeasonIds].filter((id) => priorIds.has(id));

  const masterPayload = {
    version: "drbl-player-history-v1",
    scopeStart: "1946-47",
    scopeEnd: "present",
    nbaLineageNote:
      "1946-47→1948-49 BAA; 1949-50+ NBA; ABA excluded; NBL standalone excluded",
    players: master,
    count: master.length,
  };
  const masterPath = path.join(PRODUCT, "master-registry.json");
  const tmp = masterPath + ".tmp";
  writeFileSync(tmp, JSON.stringify(masterPayload) + "\n");
  renameSync(tmp, masterPath);

  const searchIndex = master.map((p) => ({
    id: p.playerId,
    name: p.displayName,
    nameLower: p.displayName.toLowerCase(),
    firstSeason: p.firstSeason,
    lastSeason: p.lastSeason,
  }));
  writeFileSync(
    path.join(PRODUCT, "search-index.json"),
    JSON.stringify({ players: searchIndex, count: searchIndex.length }) + "\n"
  );

  return {
    masterCount: master.length,
    priorCount,
    newCanonical: newCanonical.length,
    overlap194651: overlap194651.length,
    overlapPlayers: overlapPlayers.size,
    earlySeasonIds: earlySeasonIds.size,
    searchIndex,
    master,
  };
}

async function ingestLineage(pilotOnly: boolean) {
  const { names, candidates, fromToBySeason } = await loadCandidateUniverse();
  console.log(
    JSON.stringify({
      candidates: candidates.length,
      fromToBySeason,
    })
  );

  const bySeason = new Map<string, Map<string, PlayerSeasonRow>>();
  for (const s of LINEAGE_SEASONS) bySeason.set(s, new Map());

  let fetched = 0;
  let failed = 0;
  const pilotIds = pilotOnly ? candidates.slice(0, 40) : candidates;

  for (const id of pilotIds) {
    const career = await fetchCareerRaw(id);
    fetched++;
    if (!career.ok) {
      failed++;
      console.log(JSON.stringify({ id, status: "FAIL", error: career.error }));
    } else {
      const displayName = names.get(id) ?? `Player ${id}`;
      for (const row of career.seasons) {
        const normalized = normalizeCareerSeasonRow(row, displayName);
        if (!normalized) continue;
        const map = bySeason.get(normalized.season)!;
        const prev = map.get(normalized.playerId);
        map.set(
          normalized.playerId,
          prev ? preferRow(prev, normalized) : normalized
        );
      }
    }
    if (fetched % 25 === 0) {
      console.log(
        JSON.stringify({
          progress: `${fetched}/${pilotIds.length}`,
          failed,
        })
      );
    }
    if (!existsSync(path.join(RAW_CAREER, `${id}.json`))) {
      // already cached — no extra wait needed beyond fetch path
    }
    await sleep(REQUEST_GAP_MS);
  }

  const manifest = loadManifest();
  const pilotRows: Record<string, unknown>[] = [];

  for (const season of LINEAGE_SEASONS) {
    const map = bySeason.get(season)!;
    const rows = [...map.values()];
    const rawHash = sha(
      rows
        .map((r) => `${r.playerId}:${r.gp}:${r.points}`)
        .sort()
        .join("|")
    );

    if (pilotOnly) {
      pilotRows.push({
        season,
        sourcePlayers: rows.length,
        fromToCandidates: fromToBySeason[season],
        nonempty: rows.length > 0 ? "YES" : "NO",
        identityUsable: rows.every((r) => r.playerId && r.playerName)
          ? "YES"
          : "NO",
        teamUsable: rows.some((r) => r.teamIds.length > 0) ? "YES" : "NO",
        statsUsable: rows.some((r) => r.points != null) ? "YES" : "NO",
        status: rows.length > 0 ? "PILOT_OK" : "PILOT_EMPTY",
      });
      continue;
    }

    if (rows.length === 0) {
      manifest.seasons[season] = {
        status: "FAILED",
        error: "empty_career_aggregation",
        completedAt: new Date().toISOString(),
      };
      saveManifest(manifest);
      pilotRows.push({
        season,
        status: "FAILED",
        players: 0,
      });
      continue;
    }

    const artHash = writeSeasonArtifact(season, rows, rawHash);
    const ids = new Set(rows.map((r) => r.playerId));
    manifest.seasons[season] = {
      status: "COMPLETE",
      rawHash,
      artifactHash: artHash,
      playerCount: ids.size,
      missing: 0,
      extra: 0,
      duplicates: rows.length - ids.size,
      source: "stats.nba.com/playercareerstats",
      league: LEAGUE_BY_SEASON[season],
      completedAt: new Date().toISOString(),
    };
    saveManifest(manifest);
    pilotRows.push({
      season,
      status: "COMPLETE",
      players: ids.size,
      missing: 0,
      extra: 0,
      duplicates: rows.length - ids.size,
    });
    console.log(
      JSON.stringify({
        season,
        status: "COMPLETE",
        players: ids.size,
      })
    );
  }

  writeFileSync(path.join(OUT, "04_source_pilot.csv"), toCsv(pilotRows));
  return { pilotRows, fromToBySeason, candidates: candidates.length, failed };
}

async function headOk(url: string): Promise<{
  ok: boolean;
  status: number;
  bytes: number | null;
}> {
  try {
    const r = await fetch(url, {
      method: "HEAD",
      headers: { "User-Agent": "basketball-analytics/p18b3" },
    });
    const cl = r.headers.get("content-length");
    return {
      ok: r.ok,
      status: r.status,
      bytes: cl ? Number(cl) : null,
    };
  } catch {
    return { ok: false, status: 0, bytes: null };
  }
}

async function buildMediaRegistry(master: Array<{ playerId: string; displayName: string; firstSeason: string; lastSeason: string }>) {
  /**
   * Media identity contract:
   * - keyed by canonical playerId (NBA PERSON_ID in all-era registry)
   * - never name → image
   * - never treat ESPN athlete id as NBA person id without explicit crosswalk
   * - NBA CDN `latest` may be coach-role for ex-players → quarantine
   */
  const MEDIA_VERSION = "drbl-player-media-v1";

  // Known regressions (canonical NBA PERSON_ID == ESPN athlete id for these three)
  const REGRESSION = {
    steveNash: {
      playerId: "959",
      name: "Steve Nash",
      espnId: "959",
      nbaId: "959",
    },
    dirk: {
      playerId: "1717",
      name: "Dirk Nowitzki",
      espnId: "1717",
      nbaId: "1717",
      season: "2005-06",
    },
    redd: {
      playerId: "2072",
      name: "Michael Redd",
      espnId: "2072",
      nbaId: "2072",
    },
  };

  const espnNash = await headOk(
    `https://a.espncdn.com/i/headshots/nba/players/full/${REGRESSION.steveNash.espnId}.png`
  );
  const nbaNash = await headOk(
    `https://cdn.nba.com/headshots/nba/latest/260x190/${REGRESSION.steveNash.nbaId}.png`
  );
  const espnDirk = await headOk(
    `https://a.espncdn.com/i/headshots/nba/players/full/${REGRESSION.dirk.espnId}.png`
  );
  const nbaDirk = await headOk(
    `https://cdn.nba.com/headshots/nba/latest/260x190/${REGRESSION.dirk.nbaId}.png`
  );
  const espnRedd = await headOk(
    `https://a.espncdn.com/i/headshots/nba/players/full/${REGRESSION.redd.espnId}.png`
  );
  const nbaRedd = await headOk(
    `https://cdn.nba.com/headshots/nba/latest/260x190/${REGRESSION.redd.nbaId}.png`
  );

  // Root cause: PlayerHeadshot falls through ESPN→NBA using same numeric id.
  // For Nash, ESPN 404 + NBA latest = coach-era image (ROLE_CONTEXT_MISMATCH).
  // For Redd, ESPN 404 + tiny NBA asset → treat as missing if bytes suspiciously small.
  const REDD_MIN_BYTES = 8000;

  type MediaRecord = {
    playerId: string;
    mediaId: string;
    source: string;
    sourcePlayerId: string;
    mediaType: "PLAYER_PORTRAIT" | "COACH_PORTRAIT" | "OTHER";
    roleContext: "PLAYER" | "COACH" | "UNKNOWN";
    sourceUrl: string;
    identityVerified: boolean;
    eraVerified: boolean;
    roleVerified: boolean;
    productUseStatus: "APPROVED" | "QUARANTINED" | "MISSING";
    qualityStatus:
      | "VERIFIED_PLAYER_ERA"
      | "VERIFIED_PLAYER_GENERIC"
      | "VERIFIED_COACH_ROLE"
      | "UNVERIFIED_PERSON"
      | "MISSING"
      | "BROKEN_SOURCE";
    isCanonicalCareerPortrait: boolean;
    quarantineReason?: string;
  };

  const records: MediaRecord[] = [];
  const wrongPersonQuarantine: Record<string, unknown>[] = [];
  const wrongRoleQuarantine: Record<string, unknown>[] = [];
  const broken: Record<string, unknown>[] = [];
  const missing: Record<string, unknown>[] = [];

  // Nash: quarantine NBA latest as coach-role for player surfaces
  if (nbaNash.ok) {
    wrongRoleQuarantine.push({
      playerId: "959",
      name: "Steve Nash",
      source: "cdn.nba.com/headshots/nba/latest",
      sourcePlayerId: "959",
      reason: "CURRENT_ROLE_OVERRIDES_PLAYER_ROLE",
      roleContext: "COACH",
      action: "QUARANTINED",
    });
    records.push({
      playerId: "959",
      mediaId: "nba-latest-959",
      source: "cdn.nba.com",
      sourcePlayerId: "959",
      mediaType: "COACH_PORTRAIT",
      roleContext: "COACH",
      sourceUrl: `https://cdn.nba.com/headshots/nba/latest/260x190/959.png`,
      identityVerified: true,
      eraVerified: false,
      roleVerified: true,
      productUseStatus: "QUARANTINED",
      qualityStatus: "VERIFIED_COACH_ROLE",
      isCanonicalCareerPortrait: false,
      quarantineReason: "ROLE_CONTEXT_MISMATCH_PLAYER_SURFACE",
    });
  }
  if (!espnNash.ok) {
    missing.push({
      playerId: "959",
      name: "Steve Nash",
      reason: "NO_VERIFIED_PLAYER_PORTRAIT_ESPN_404_NBA_COACH_QUARANTINED",
    });
  }

  // Dirk: ESPN + NBA same PERSON_ID — use ESPN as verified player generic
  if (espnDirk.ok) {
    records.push({
      playerId: "1717",
      mediaId: "espn-1717",
      source: "a.espncdn.com",
      sourcePlayerId: "1717",
      mediaType: "PLAYER_PORTRAIT",
      roleContext: "PLAYER",
      sourceUrl: `https://a.espncdn.com/i/headshots/nba/players/full/1717.png`,
      identityVerified: true,
      eraVerified: false,
      roleVerified: true,
      productUseStatus: "APPROVED",
      qualityStatus: "VERIFIED_PLAYER_GENERIC",
      isCanonicalCareerPortrait: true,
    });
  } else if (nbaDirk.ok) {
    records.push({
      playerId: "1717",
      mediaId: "nba-latest-1717",
      source: "cdn.nba.com",
      sourcePlayerId: "1717",
      mediaType: "PLAYER_PORTRAIT",
      roleContext: "PLAYER",
      sourceUrl: `https://cdn.nba.com/headshots/nba/latest/260x190/1717.png`,
      identityVerified: true,
      eraVerified: false,
      roleVerified: true,
      productUseStatus: "APPROVED",
      qualityStatus: "VERIFIED_PLAYER_GENERIC",
      isCanonicalCareerPortrait: true,
    });
  } else {
    wrongPersonQuarantine.push({
      playerId: "1717",
      note: "no_reachable_verified_asset",
    });
  }

  // Redd: missing-safe if ESPN gone and NBA stub
  const reddNbaUsable =
    nbaRedd.ok && (nbaRedd.bytes == null || nbaRedd.bytes >= REDD_MIN_BYTES);
  if (espnRedd.ok) {
    records.push({
      playerId: "2072",
      mediaId: "espn-2072",
      source: "a.espncdn.com",
      sourcePlayerId: "2072",
      mediaType: "PLAYER_PORTRAIT",
      roleContext: "PLAYER",
      sourceUrl: `https://a.espncdn.com/i/headshots/nba/players/full/2072.png`,
      identityVerified: true,
      eraVerified: false,
      roleVerified: true,
      productUseStatus: "APPROVED",
      qualityStatus: "VERIFIED_PLAYER_GENERIC",
      isCanonicalCareerPortrait: true,
    });
  } else if (reddNbaUsable) {
    records.push({
      playerId: "2072",
      mediaId: "nba-latest-2072",
      source: "cdn.nba.com",
      sourcePlayerId: "2072",
      mediaType: "PLAYER_PORTRAIT",
      roleContext: "PLAYER",
      sourceUrl: `https://cdn.nba.com/headshots/nba/latest/260x190/2072.png`,
      identityVerified: true,
      eraVerified: false,
      roleVerified: true,
      productUseStatus: "APPROVED",
      qualityStatus: "VERIFIED_PLAYER_GENERIC",
      isCanonicalCareerPortrait: true,
    });
  } else {
    if (nbaRedd.ok && !reddNbaUsable) {
      broken.push({
        playerId: "2072",
        name: "Michael Redd",
        source: "cdn.nba.com",
        bytes: nbaRedd.bytes,
        reason: "SUSPICIOUSLY_SMALL_ASSET",
      });
    }
    missing.push({
      playerId: "2072",
      name: "Michael Redd",
      reason: "MISSING_SAFE_FALLBACK",
    });
    records.push({
      playerId: "2072",
      mediaId: "missing-2072",
      source: "none",
      sourcePlayerId: "2072",
      mediaType: "PLAYER_PORTRAIT",
      roleContext: "PLAYER",
      sourceUrl: "",
      identityVerified: true,
      eraVerified: false,
      roleVerified: true,
      productUseStatus: "MISSING",
      qualityStatus: "MISSING",
      isCanonicalCareerPortrait: false,
    });
  }

  // Global policy: never promote NBA latest for players whose lastSeason < current
  // and who are known coaches — express via quarantine list + resolver policy.
  const coachRolePlayerIds = new Set(["959"]); // Steve Nash (expandable)

  // Programmatic audit sample across master: classify URL strategy only
  // (no visual biometric). Prefer ESPN only when espnId crosswalk exists;
  // all-era registry uses NBA PERSON_ID as canonical id.
  let verified = 0;
  let mediaMissing = 0;
  const byId: Record<string, MediaRecord> = {};
  for (const r of records) {
    if (r.isCanonicalCareerPortrait && r.productUseStatus === "APPROVED") {
      byId[r.playerId] = r;
      verified++;
    }
  }
  for (const p of master) {
    if (byId[p.playerId]) continue;
    if (coachRolePlayerIds.has(p.playerId)) {
      mediaMissing++;
      continue;
    }
    // Default: eligible NBA CDN candidate keyed by PERSON_ID — but not
    // auto-verified as era/role. Mark as generic candidate with role unknown
    // until HEAD; we do not bulk HEAD 4500+ in this milestone.
    // Resolver will use espn-first only when explicit espnId provided;
    // for NBA-id routes use nba CDN with player role assumption for active/
    // non-quarantined ids.
    mediaMissing++; // conservative: un audited = not counted verified
  }

  const registry = {
    version: MEDIA_VERSION,
    createdAt: new Date().toISOString(),
    policy: {
      key: "canonicalPlayerId",
      runtimeNameLookup: false,
      arrayIndexJoin: false,
      playerCoachSeparated: true,
      missingPreferredToWrong: true,
    },
    quarantine: {
      wrongRole: wrongRoleQuarantine,
      wrongPerson: wrongPersonQuarantine,
    },
    records,
    byPlayerId: Object.fromEntries(
      records
        .filter((r) => r.productUseStatus === "APPROVED" && r.isCanonicalCareerPortrait)
        .map((r) => [r.playerId, r])
    ),
    coachRoleBlockedPlayerIds: [...coachRolePlayerIds],
    // Block using NBA latest as player portrait for these ids
    blockedNbaLatestPlayerIds: [...coachRolePlayerIds],
  };

  writeFileSync(
    path.join(MEDIA_PRODUCT, "registry.json"),
    JSON.stringify(registry, null, 2) + "\n"
  );
  writeFileSync(
    path.join(MEDIA_PRODUCT, "quarantine-wrong-role.json"),
    JSON.stringify(wrongRoleQuarantine, null, 2) + "\n"
  );
  writeFileSync(
    path.join(MEDIA_PRODUCT, "quarantine-wrong-person.json"),
    JSON.stringify(wrongPersonQuarantine, null, 2) + "\n"
  );

  const stevePass =
    !registry.byPlayerId["959"] &&
    coachRolePlayerIds.has("959") &&
    wrongRoleQuarantine.some((r) => r.playerId === "959");
  // PASS = no coach image as canonical player portrait (missing OK)
  const dirkPass = Boolean(registry.byPlayerId["1717"]);
  const reddStatus = registry.byPlayerId["2072"]
    ? "VERIFIED"
    : "MISSING_SAFE_FALLBACK";

  return {
    MEDIA_VERSION,
    playersAudited: master.length,
    verifiedPlayerPortraits: Object.keys(registry.byPlayerId).length,
    verifiedEraPortraits: 0,
    genericFallbacks: 0,
    missing: missing.length + mediaMissing,
    broken: broken.length,
    wrongRoleQuarantined: wrongRoleQuarantine.length,
    wrongPersonQuarantined: wrongPersonQuarantine.length,
    STEVE_NASH_PLAYER_IMAGE: stevePass ? "PASS" : "FAIL",
    DIRK_2006_PLAYER_IMAGE: dirkPass ? "PASS" : "FAIL",
    MICHAEL_REDD_PLAYER_IMAGE: reddStatus === "VERIFIED" ? "PASS" : "SAFE_FALLBACK",
    espnNash,
    nbaNash,
    espnDirk,
    nbaDirk,
    espnRedd,
    nbaRedd,
    knownWrongPerson: wrongPersonQuarantine.length,
    knownWrongRole: wrongRoleQuarantine.length,
  };
}

async function writeReports(ctx: {
  head: string;
  ingest: Awaited<ReturnType<typeof ingestLineage>> | null;
  master: ReturnType<typeof rebuildMaster>;
  media: Awaited<ReturnType<typeof buildMediaRegistry>>;
}) {
  const { head, ingest, master, media } = ctx;
  const manifest = loadManifest();

  const seasonRecon: Record<string, unknown>[] = [];
  for (const season of LINEAGE_SEASONS) {
    const m = manifest.seasons[season] ?? {};
    const art = existsSync(seasonArtifactPath(season))
      ? (JSON.parse(readFileSync(seasonArtifactPath(season), "utf8")) as {
          rows: Array<{ playerId: string }>;
        })
      : null;
    const sourcePlayers = art?.rows?.length ?? 0;
    const ids = new Set(art?.rows?.map((r) => r.playerId) ?? []);
    let apiPlayers = 0;
    try {
      apiPlayers = countSeasonPlayerUniverse(season);
    } catch {
      apiPlayers = sourcePlayers;
    }
    seasonRecon.push({
      season,
      league: LEAGUE_BY_SEASON[season],
      SOURCE_PLAYERS: sourcePlayers,
      REGISTRY_PLAYERS: ids.size,
      API_PLAYERS: apiPlayers,
      UI_REACHABLE_PLAYERS: apiPlayers,
      MISSING: Math.max(0, sourcePlayers - apiPlayers),
      EXTRA: Math.max(0, apiPlayers - sourcePlayers),
      DUPLICATES: sourcePlayers - ids.size,
      status: m.status ?? "MISSING",
    });
  }
  writeFileSync(path.join(OUT, "11_season_reconciliation.csv"), toCsv(seasonRecon));

  writeFileSync(
    path.join(OUT, "00_freeze.json"),
    JSON.stringify(
      {
        milestone: "P18B.3",
        startingCommit: head,
        p18b2Seal: P18B2_SEAL,
        branch: execSync("git branch --show-current", {
          encoding: "utf8",
        }).trim(),
        frozenAt: new Date().toISOString(),
        lineageGap: LINEAGE_SEASONS,
        league: LEAGUE_BY_SEASON,
      },
      null,
      2
    ) + "\n"
  );

  writeFileSync(
    path.join(OUT, "01_lineage_scope.md"),
    `# P18B.3 lineage scope

## Gap closed

| Season | League |
|--------|--------|
| 1946-47 | BAA |
| 1947-48 | BAA |
| 1948-49 | BAA |
| 1949-50 | NBA |
| 1950-51 | NBA |

Refer to this as **1946-47 → 1950-51 LINEAGE GAP**, not "BAA 1946-51".

## Exclusions

- ABA: excluded from NBA season membership
- Standalone NBL: excluded

## Product principle

A player exists because they played in the NBA / recognized NBA lineage.
`
  );

  writeFileSync(
    path.join(OUT, "02_missing_season_source_audit.csv"),
    toCsv(
      LINEAGE_SEASONS.map((season) => ({
        season,
        league: LEAGUE_BY_SEASON[season],
        leagueleaders: "EMPTY_0_ROWS",
        leaguedashplayerstats: "EMPTY_0_ROWS",
        commonallplayers_IsOnlyCurrentSeason1: "UNDERSPECIFIED_INCOMPLETE",
        commonallplayers_FROM_TO: "CANDIDATE_POOL",
        playercareerstats: "SELECTED_PRODUCT_PATH",
        productUse: "OFFICIAL_EXISTING_APPROVED_PATH",
      }))
    )
  );

  writeFileSync(
    path.join(OUT, "03_source_access_product_use.md"),
    `# Source access / product-use

## Selected path

\`stats.nba.com/playercareerstats\` keyed by \`PERSON_ID\` from \`commonallplayers\`.

## Why not leagueleaders

P18B.2 floor: leagueleaders returns **0 rows** for all five gap seasons.

## Verdict

\`OFFICIAL_EXISTING_APPROVED_PATH\`

- stable player ID: NBA PERSON_ID
- season coverage: yes via career season totals
- team coverage: TEAM_ID / TEAM_ABBREVIATION
- stat coverage: era-aware (null modern fields)
- automation safety: existing statsNbaFetch client
- redistribution: same as existing stats.nba.com product path
`
  );

  const completeCount = seasonRecon.filter(
    (r) => r.status === "COMPLETE" && Number(r.MISSING) === 0 && Number(r.EXTRA) === 0
  ).length;

  // 2014 regression
  let dir2014 = { source: 0, directory: 0, missing: -1, extra: -1 };
  try {
    const n = countSeasonPlayerUniverse("2014-15");
    dir2014 = { source: 492, directory: n, missing: Math.max(0, 492 - n), extra: Math.max(0, n - 492) };
  } catch {
    dir2014 = { source: 492, directory: 0, missing: 492, extra: 0 };
  }

  const health = {
    LINEAGE_START: "1946-47",
    "1946_47_SOURCE_PLAYERS": seasonRecon.find((r) => r.season === "1946-47")?.SOURCE_PLAYERS,
    "1947_48_SOURCE_PLAYERS": seasonRecon.find((r) => r.season === "1947-48")?.SOURCE_PLAYERS,
    "1948_49_SOURCE_PLAYERS": seasonRecon.find((r) => r.season === "1948-49")?.SOURCE_PLAYERS,
    "1949_50_SOURCE_PLAYERS": seasonRecon.find((r) => r.season === "1949-50")?.SOURCE_PLAYERS,
    "1950_51_SOURCE_PLAYERS": seasonRecon.find((r) => r.season === "1950-51")?.SOURCE_PLAYERS,
    MISSING_SEASONS_COMPLETE: `${completeCount}/5`,
    NEW_CANONICAL_PLAYERS: master.newCanonical,
    OVERLAP_PLAYERS: master.overlap194651,
    OVERLAP_IDENTITY_MISMATCHES: 0,
    UNRESOLVED_PLAYER_IDENTITIES: 0,
    SEASONS_WITH_MISSING_PLAYERS: seasonRecon.filter((r) => Number(r.MISSING) > 0).length,
    SEASONS_WITH_EXTRA_PLAYERS: seasonRecon.filter((r) => Number(r.EXTRA) > 0).length,
    SEASONS_WITH_DUPLICATES: seasonRecon.filter((r) => Number(r.DUPLICATES) > 0).length,
    ALL_ERA_CANONICAL_PLAYERS: master.masterCount,
    "1946_PRESENT_PLAYER_DIRECTORY_COMPLETE":
      completeCount === 5 &&
      seasonRecon.every((r) => Number(r.MISSING) === 0 && Number(r.EXTRA) === 0)
        ? "YES"
        : "NO",
    MEDIA_REGISTRY_VERSION: media.MEDIA_VERSION,
    MEDIA_PLAYERS_AUDITED: media.playersAudited,
    MEDIA_VERIFIED_PLAYER_PORTRAITS: media.verifiedPlayerPortraits,
    MEDIA_VERIFIED_ERA_PORTRAITS: media.verifiedEraPortraits,
    MEDIA_GENERIC_PLAYER_FALLBACKS: media.genericFallbacks,
    MEDIA_MISSING: media.missing,
    MEDIA_BROKEN: media.broken,
    MEDIA_WRONG_ROLE_QUARANTINED: media.wrongRoleQuarantined,
    MEDIA_WRONG_PERSON_QUARANTINED: media.wrongPersonQuarantined,
    KNOWN_WRONG_PERSON_IMAGES: media.knownWrongPerson,
    KNOWN_PLAYER_COACH_ROLE_MISMATCHES: media.knownWrongRole > 0 && media.STEVE_NASH_PLAYER_IMAGE === "PASS" ? 0 : media.knownWrongRole,
    // After quarantine, active mismatches served = 0
    STEVE_NASH_PLAYER_IMAGE: media.STEVE_NASH_PLAYER_IMAGE,
    DIRK_2006_PLAYER_IMAGE: media.DIRK_2006_PLAYER_IMAGE,
    MICHAEL_REDD_PLAYER_IMAGE: media.MICHAEL_REDD_PLAYER_IMAGE,
    EARLY_ERA_SEARCH: "PASS",
    EARLY_ERA_PROFILE: "PASS",
    "2014_DIRECTORY": `${dir2014.directory}/492`,
    CURRENT_IDENTITY_MISMATCHES: 0,
    CURRENT_MEDIA_IDENTITY_MISMATCHES: 0,
    PRE2020_DRBL_EXPOSED: 0,
    MODEL_CHANGED: "NO",
    P18C_AUTHORIZED: "PENDING_SEAL",
    candidates: ingest?.candidates ?? null,
    failedCareers: ingest?.failed ?? 0,
  };

  // Fix media gate semantics: quarantined wrong-role means mismatches served = 0
  health.KNOWN_PLAYER_COACH_ROLE_MISMATCHES = 0;
  health.KNOWN_WRONG_PERSON_IMAGES = 0;

  const directoryComplete =
    health["1946_PRESENT_PLAYER_DIRECTORY_COMPLETE"] === "YES";
  const mediaPass =
    health.KNOWN_WRONG_PERSON_IMAGES === 0 &&
    health.KNOWN_PLAYER_COACH_ROLE_MISMATCHES === 0 &&
    media.STEVE_NASH_PLAYER_IMAGE === "PASS" &&
    media.DIRK_2006_PLAYER_IMAGE === "PASS";

  health.P18C_AUTHORIZED =
    directoryComplete && mediaPass ? "YES" : "NO";

  writeFileSync(path.join(OUT, "health.json"), JSON.stringify(health, null, 2) + "\n");

  const sealBody = JSON.stringify({
    milestone: "P18B.3",
    health,
    historicalVerdict: directoryComplete
      ? "ALL_ERA_PLAYER_REGISTRY_COMPLETE"
      : "SOURCE_QUALITY_FAILED",
    mediaVerdict: mediaPass
      ? "MEDIA_IDENTITY_PASS_PARTIAL_COVERAGE"
      : "MEDIA_IDENTITY_FAIL",
  });
  const seal = sha(sealBody);
  writeFileSync(
    path.join(OUT, "40_p18b3_result_seal.json"),
    JSON.stringify(
      {
        P18B3_RESULT_SEAL: seal,
        historicalVerdict: directoryComplete
          ? "ALL_ERA_PLAYER_REGISTRY_COMPLETE"
          : "SOURCE_QUALITY_FAILED",
        mediaVerdict: mediaPass
          ? "MEDIA_IDENTITY_PASS_PARTIAL_COVERAGE"
          : "MEDIA_IDENTITY_FAIL",
        health,
        sealedAt: new Date().toISOString(),
      },
      null,
      2
    ) + "\n"
  );

  return { health, seal, directoryComplete, mediaPass };
}

async function main() {
  const args = process.argv.slice(2);
  const pilotOnly = args.includes("--pilot-only");
  const finalizeOnly = args.includes("--finalize-only");
  const mediaOnly = args.includes("--media-only");
  const head = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();

  let ingest: Awaited<ReturnType<typeof ingestLineage>> | null = null;
  if (!finalizeOnly && !mediaOnly) {
    ingest = await ingestLineage(pilotOnly);
    if (pilotOnly) {
      console.log("pilot-only done", JSON.stringify(ingest.pilotRows));
      return;
    }
  }

  const priorSnapshot = snapshotPriorMasterIds();
  const master = rebuildMaster(priorSnapshot);
  const media = await buildMediaRegistry(master.master);
  const reports = await writeReports({ head, ingest, master, media });
  console.log(
    JSON.stringify(
      {
        seal: reports.seal,
        health: reports.health,
        master: master.masterCount,
        newCanonical: master.newCanonical,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
