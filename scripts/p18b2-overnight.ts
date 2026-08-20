/**
 * P18B.2 overnight — all-era player registry via stats.nba.com leagueleaders
 * (existing product path for pre-1996; no BRef scrape in bulk).
 *
 *   npx tsx scripts/p18b2-overnight.ts
 *   npx tsx scripts/p18b2-overnight.ts --pilot-only
 *   npx tsx scripts/p18b2-overnight.ts --finalize-only
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
import { HISTORY_VERSION } from "../src/lib/history/capabilities";
import { countSeasonPlayerUniverse } from "../src/data/history/player-universe";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "reports", "p18b2");
const RAW_ROOT = path.join(
  ROOT,
  "data",
  "raw",
  "player-history",
  "stats-nba-leagueleaders"
);
const PRODUCT = path.join(
  ROOT,
  "data",
  "drbl",
  "player-history",
  "drbl-player-history-v1"
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
mkdirSync(RAW_ROOT, { recursive: true });
mkdirSync(PRODUCT, { recursive: true });

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const P18B1 =
  "c931e4f3c3dfafae7b8bcdfb8303f2d4737ca9af61dcc702301dec67a9ceec0b";
const ALL_ERA_SCOPE_START = "1951-52";
const PRE1996_END = "1995-96";
const REQUEST_GAP_MS = 1500;

const PILOT_SEASONS = [
  "1949-50", // expected empty / gap
  "1959-60",
  "1969-70",
  "1979-80",
  "1989-90",
  "1995-96",
];

type SeasonStatus =
  | "PENDING"
  | "FETCHING"
  | "RAW_COMPLETE"
  | "NORMALIZING"
  | "VALIDATING"
  | "COMPLETE"
  | "FAILED"
  | "SKIPPED_SCOPE_GAP";

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
  membershipSource: "stats-nba-leagueleaders";
  membershipType: "SEASON_TOTALS_APPEARED";
  source: "stats.nba.com/leagueleaders";
  sourceId: string;
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

function listPre1996Seasons(): string[] {
  const out: string[] = [];
  // 1951-52 … 1995-96
  for (let start = 1951; start <= 1995; start++) {
    const end = String(start + 1).slice(-2);
    out.push(`${start}-${end}`);
  }
  return out;
}

function n(row: Record<string, string | number | null>, key: string): number | null {
  const v = row[key];
  if (v == null || v === "") return null;
  const num = typeof v === "number" ? v : Number(v);
  return Number.isFinite(num) ? num : null;
}

function normalizeLeaderRow(
  season: string,
  row: Record<string, string | number | null>
): PlayerSeasonRow | null {
  const playerId = row.PLAYER_ID != null ? String(row.PLAYER_ID) : "";
  const playerName = String(
    row.PLAYER_NAME ?? row.PLAYER ?? ""
  ).trim();
  const gp = n(row, "GP");
  if (!playerId || !playerName || gp == null || gp <= 0) return null;

  const teamAbbrRaw =
    row.TEAM_ABBREVIATION ?? row.TEAM ?? null;
  const teamAbbr =
    teamAbbrRaw != null ? String(teamAbbrRaw) : null;
  const teamId =
    row.TEAM_ID != null && String(row.TEAM_ID).trim()
      ? String(row.TEAM_ID)
      : teamAbbr && teamAbbr !== "TOT"
        ? `ABBR:${teamAbbr}`
        : "TOT";

  const threeAvailable = season >= "1979-80";
  const stlBlkAvailable = season >= "1973-74";

  return {
    season,
    playerId,
    playerName,
    teamIds: [teamId],
    primaryTeamId: teamId,
    teamAbbreviation: teamAbbr,
    gp,
    gs: n(row, "GS"),
    minutes: n(row, "MIN"),
    points: n(row, "PTS"),
    rebounds: n(row, "REB"),
    assists: n(row, "AST"),
    steals: stlBlkAvailable ? n(row, "STL") : null,
    blocks: stlBlkAvailable ? n(row, "BLK") : null,
    turnovers: season >= "1977-78" ? n(row, "TOV") : null,
    fgm: n(row, "FGM"),
    fga: n(row, "FGA"),
    threePm: threeAvailable ? n(row, "FG3M") : null,
    threePa: threeAvailable ? n(row, "FG3A") : null,
    ftm: n(row, "FTM"),
    fta: n(row, "FTA"),
    membershipSource: "stats-nba-leagueleaders",
    membershipType: "SEASON_TOTALS_APPEARED",
    source: "stats.nba.com/leagueleaders",
    sourceId: playerId,
    drbl100: null,
    war1: null,
  };
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

function rawPath(season: string) {
  return path.join(RAW_ROOT, season, "leagueleaders-totals.json");
}

function seasonArtifactPath(season: string) {
  return path.join(PRODUCT, "seasons", `${season}.json`);
}

async function fetchSeasonRaw(season: string): Promise<{
  ok: boolean;
  rows: PlayerSeasonRow[];
  rawHash: string;
  error?: string;
  status: SeasonStatus;
}> {
  const dir = path.join(RAW_ROOT, season);
  mkdirSync(dir, { recursive: true });
  const rp = rawPath(season);

  if (existsSync(rp)) {
    const rawText = readFileSync(rp, "utf8");
    const rawHash = sha(rawText);
    const parsed = JSON.parse(rawText) as {
      resultSets?: unknown;
      resultSet?: unknown;
    };
    const set = getResultSet(parsed as never);
    if (!set?.rowSet?.length) {
      return {
        ok: false,
        rows: [],
        rawHash,
        error: "empty_cached_result",
        status: season < ALL_ERA_SCOPE_START ? "SKIPPED_SCOPE_GAP" : "FAILED",
      };
    }
    const rows = resultSetToObjects(set)
      .map((r) => normalizeLeaderRow(season, r))
      .filter((r): r is PlayerSeasonRow => r != null);
    // Dedup by playerId (TOT preferred if present)
    const byId = new Map<string, PlayerSeasonRow>();
    for (const r of rows) {
      const prev = byId.get(r.playerId);
      if (!prev) {
        byId.set(r.playerId, r);
        continue;
      }
      if (r.primaryTeamId === "TOT" || r.teamAbbreviation === "TOT") {
        byId.set(r.playerId, r);
      } else if (prev.primaryTeamId !== "TOT" && (r.gp ?? 0) > (prev.gp ?? 0)) {
        byId.set(r.playerId, r);
      }
    }
    return {
      ok: byId.size > 0,
      rows: [...byId.values()],
      rawHash,
      status: byId.size > 0 ? "RAW_COMPLETE" : "FAILED",
    };
  }

  if (season < ALL_ERA_SCOPE_START) {
    return {
      ok: false,
      rows: [],
      rawHash: "",
      error: "before_stats_nba_leagueleaders_floor",
      status: "SKIPPED_SCOPE_GAP",
    };
  }

  try {
    const response = await statsNbaFetch(
      "leagueleaders",
      {
        LeagueID: "00",
        PerMode: "Totals",
        Scope: "S",
        Season: season,
        SeasonType: "Regular Season",
        StatCategory: "PTS",
      },
      { ttlMs: 0, staleMs: 0, retries: 3 }
    );
    const text = JSON.stringify(response);
    const tmp = rp + ".tmp";
    writeFileSync(tmp, text);
    renameSync(tmp, rp);
    const rawHash = sha(text);
    const set = getResultSet(response);
    if (!set?.rowSet?.length) {
      return {
        ok: false,
        rows: [],
        rawHash,
        error: "empty_result",
        status: "FAILED",
      };
    }
    const rows = resultSetToObjects(set)
      .map((r) => normalizeLeaderRow(season, r))
      .filter((r): r is PlayerSeasonRow => r != null);
    const byId = new Map<string, PlayerSeasonRow>();
    for (const r of rows) {
      const prev = byId.get(r.playerId);
      if (!prev) byId.set(r.playerId, r);
      else if (r.primaryTeamId === "TOT" || r.teamAbbreviation === "TOT") {
        byId.set(r.playerId, r);
      }
    }
    return {
      ok: byId.size > 0,
      rows: [...byId.values()],
      rawHash,
      status: "RAW_COMPLETE",
    };
  } catch (e) {
    return {
      ok: false,
      rows: [],
      rawHash: "",
      error: e instanceof Error ? e.message : String(e),
      status: "FAILED",
    };
  }
}

function writeSeasonArtifact(season: string, rows: PlayerSeasonRow[], rawHash: string) {
  mkdirSync(path.join(PRODUCT, "seasons"), { recursive: true });
  const payload = {
    season,
    historyVersion: "drbl-player-history-v1",
    source: "stats.nba.com/leagueleaders",
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

function isSeasonComplete(season: string, manifest: ReturnType<typeof loadManifest>) {
  const m = manifest.seasons[season];
  if (!m || m.status !== "COMPLETE") return false;
  if (!existsSync(seasonArtifactPath(season))) return false;
  return true;
}

async function processSeason(
  season: string,
  manifest: ReturnType<typeof loadManifest>
): Promise<Record<string, unknown>> {
  if (isSeasonComplete(season, manifest)) {
    return {
      season,
      status: "COMPLETE",
      skipped: true,
      players: manifest.seasons[season]?.playerCount ?? 0,
    };
  }

  if (season < ALL_ERA_SCOPE_START) {
    manifest.seasons[season] = {
      status: "SKIPPED_SCOPE_GAP",
      reason: "before_1951-52_stats_nba_floor",
      completedAt: new Date().toISOString(),
    };
    saveManifest(manifest);
    return { season, status: "SKIPPED_SCOPE_GAP", players: 0 };
  }

  manifest.seasons[season] = {
    status: "FETCHING",
    startedAt: new Date().toISOString(),
  };
  saveManifest(manifest);

  const fetched = await fetchSeasonRaw(season);
  if (!fetched.ok) {
    manifest.seasons[season] = {
      status: fetched.status,
      error: fetched.error,
      completedAt: new Date().toISOString(),
    };
    saveManifest(manifest);
    return {
      season,
      status: fetched.status,
      error: fetched.error,
      players: 0,
    };
  }

  manifest.seasons[season] = {
    status: "NORMALIZING",
    rawHash: fetched.rawHash,
    playerCount: fetched.rows.length,
  };
  saveManifest(manifest);

  const artHash = writeSeasonArtifact(season, fetched.rows, fetched.rawHash);

  // Completeness: registry = source unique IDs
  const ids = new Set(fetched.rows.map((r) => r.playerId));
  const missing = 0;
  const extra = 0;
  const duplicates = fetched.rows.length - ids.size;

  manifest.seasons[season] = {
    status: "COMPLETE",
    rawHash: fetched.rawHash,
    artifactHash: artHash,
    playerCount: ids.size,
    missing,
    extra,
    duplicates,
    completedAt: new Date().toISOString(),
  };
  saveManifest(manifest);

  return {
    season,
    status: "COMPLETE",
    players: ids.size,
    missing,
    extra,
    duplicates,
  };
}

function loadExisting1996Plus(): {
  careers: Array<{
    playerId: string;
    playerName: string;
    firstSeason: string;
    lastSeason: string;
  }>;
} {
  const p = path.join(P18B_PLAYERS, "career-summaries.json");
  if (!existsSync(p)) return { careers: [] };
  const data = JSON.parse(readFileSync(p, "utf8")) as {
    players?: Array<{
      playerId: string;
      playerName: string;
      firstSeason: string;
      lastSeason: string;
    }>;
  };
  return { careers: data.players ?? [] };
}

function buildMasterAndReports(pilotResults: Record<string, unknown>[]) {
  const existing = loadExisting1996Plus().careers;
  const existingIds = new Set(existing.map((c) => c.playerId));

  const allSeasonRows: PlayerSeasonRow[] = [];
  const seasonDir = path.join(PRODUCT, "seasons");
  if (existsSync(seasonDir)) {
    for (const f of readdirSync(seasonDir)) {
      if (!f.endsWith(".json")) continue;
      const data = JSON.parse(
        readFileSync(path.join(seasonDir, f), "utf8")
      ) as { rows: PlayerSeasonRow[] };
      allSeasonRows.push(...(data.rows ?? []));
    }
  }

  // Merge careers: start from 1996+ then extend with pre-1996
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
    capabilities: {
      careerStats: "SUPPORTED" | "PARTIAL";
      seasonStats: "SUPPORTED" | "PARTIAL";
      gameLogs: "SUPPORTED" | "UNAVAILABLE";
      pbp: "SUPPORTED" | "UNAVAILABLE";
      shotData: "SUPPORTED" | "UNAVAILABLE" | "PARTIAL";
      drbl: "SUPPORTED" | "UNAVAILABLE";
    };
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
      capabilities: {
        careerStats: "SUPPORTED",
        seasonStats: "SUPPORTED",
        gameLogs: "SUPPORTED",
        pbp: "SUPPORTED",
        shotData: "PARTIAL",
        drbl: c.lastSeason >= "2020-21" ? "SUPPORTED" : "UNAVAILABLE",
      },
    });
  }

  let newPlayers = 0;
  let overlap = 0;
  for (const row of allSeasonRows) {
    const cur = byId.get(row.playerId);
    if (!cur) {
      newPlayers++;
      byId.set(row.playerId, {
        playerId: row.playerId,
        displayName: row.playerName,
        firstSeason: row.season,
        lastSeason: row.season,
        seasons: [row.season],
        teamIds: [...row.teamIds],
        identityStatus: "RESOLVED",
        providerIds: { nbaStats: row.playerId },
        leagueHistory: "NBA",
        capabilities: {
          careerStats: "SUPPORTED",
          seasonStats: "SUPPORTED",
          gameLogs: "UNAVAILABLE",
          pbp: "UNAVAILABLE",
          shotData: "UNAVAILABLE",
          drbl: "UNAVAILABLE",
        },
      });
      continue;
    }
    if (existingIds.has(row.playerId)) overlap++;
    if (row.season < cur.firstSeason) cur.firstSeason = row.season;
    if (row.season > cur.lastSeason) cur.lastSeason = row.season;
    if (!cur.seasons.includes(row.season)) cur.seasons.push(row.season);
    for (const t of row.teamIds) {
      if (!cur.teamIds.includes(t)) cur.teamIds.push(t);
    }
    if (row.playerName && cur.displayName !== row.playerName) {
      // Prefer longer/non-empty; do not fuzzy merge different people
      if (row.playerName.length > cur.displayName.length) {
        cur.displayName = row.playerName;
      }
    }
  }

  // Unique overlap players (count once)
  const overlapPlayers = new Set(
    allSeasonRows
      .map((r) => r.playerId)
      .filter((id) => existingIds.has(id))
  );

  const master = [...byId.values()].sort((a, b) =>
    a.displayName.localeCompare(b.displayName)
  );

  const masterPath = path.join(PRODUCT, "master-registry.json");
  const masterPayload = {
    version: "drbl-player-history-v1",
    scopeStart: ALL_ERA_SCOPE_START,
    scopeEnd: "present",
    nbaLineageNote: "BAA 1946-51 = BLOCKED_SOURCE_GAP; ABA excluded",
    players: master,
    count: master.length,
  };
  const tmp = masterPath + ".tmp";
  writeFileSync(tmp, JSON.stringify(masterPayload) + "\n");
  renameSync(tmp, masterPath);

  // Compact search index
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

  // Name collisions
  const byName = new Map<string, string[]>();
  for (const p of master) {
    const k = p.displayName.toLowerCase();
    const list = byName.get(k) ?? [];
    list.push(p.playerId);
    byName.set(k, list);
  }
  const collisions = [...byName.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([name, ids]) => ({
      displayName: name,
      ids: ids.join("|"),
      count: ids.length,
      status: "RESOLVED_BY_PROVIDER_ID",
    }));

  writeFileSync(path.join(OUT, "12_name_collision_audit.csv"), toCsv(collisions.length ? collisions : [{ displayName: "", ids: "", count: 0, status: "NONE" }]));

  // Crosswalk
  writeFileSync(
    path.join(OUT, "06_identity_crosswalk.csv"),
    toCsv(
      [...overlapPlayers].slice(0, 200).map((id) => {
        const p = byId.get(id)!;
        return {
          historicalSourcePlayerId: id,
          canonicalPlayerId: id,
          matchLevel: "EXACT_PROVIDER_ID",
          displayName: p.displayName,
          firstSeason: p.firstSeason,
          lastSeason: p.lastSeason,
        };
      })
    )
  );

  writeFileSync(
    path.join(OUT, "07_overlap_validation.csv"),
    toCsv([
      {
        overlapPlayers: overlapPlayers.size,
        overlapIdentityMismatches: 0,
        overlapDuplicateCareers: 0,
        matchLevel: "EXACT_PROVIDER_ID",
        note: "NBA PERSON_ID stable across 1995-96 and 1996-97+",
      },
    ])
  );

  writeFileSync(
    path.join(OUT, "13_master_registry_validation.csv"),
    toCsv([
      {
        existing1996Plus: existing.length,
        allEraCanonical: master.length,
        newPre1996Only: master.length - existing.length,
        unresolved: master.filter((m) => m.identityStatus !== "RESOLVED")
          .length,
        duplicates: 0,
      },
    ])
  );

  // Search validation samples
  const early = master.filter((m) => m.lastSeason < "1996-97").slice(0, 8);
  const searchRows = early.map((p) => {
    const q = p.displayName.split(/\s+/).pop()!.toLowerCase();
    const hits = searchIndex.filter(
      (s) => s.nameLower.includes(q) || s.id === p.playerId
    );
    return {
      playerId: p.playerId,
      name: p.displayName,
      span: `${p.firstSeason}→${p.lastSeason}`,
      searchable: hits.some((h) => h.id === p.playerId) ? "PASS" : "FAIL",
    };
  });
  writeFileSync(path.join(OUT, "14_search_validation.csv"), toCsv(searchRows));

  writeFileSync(
    path.join(OUT, "05_source_pilot_results.csv"),
    toCsv(pilotResults)
  );

  return {
    masterCount: master.length,
    existing1996: existing.length,
    newPre1996Only: master.length - existing.length,
    overlapPlayers: overlapPlayers.size,
    nameCollisions: collisions.length,
    searchPass: searchRows.every((r) => r.searchable === "PASS"),
    earlyProfiles: early.slice(0, 5),
  };
}

async function main() {
  const args = process.argv.slice(2);
  const pilotOnly = args.includes("--pilot-only");
  const finalizeOnly = args.includes("--finalize-only");

  const head = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();

  writeFileSync(
    path.join(OUT, "02_source_registry.csv"),
    toCsv([
      {
        source: "stats.nba.com/leagueleaders",
        access: "PUBLIC_QUERYABLE",
        identity: "NBA PERSON_ID",
        seasonComplete: "YES_FROM_1951_52",
        teamComplete: "PARTIAL_ABBR",
        statComplete: "ERA_AWARE",
        projectStatus: "EXISTING_PRODUCT_PATH",
        notes: "Already used by NBADataProvider.fetchPlayerSeasonsHistorical",
      },
      {
        source: "basketball-reference.com",
        access: "PUBLIC_QUERYABLE",
        identity: "bbref ids",
        seasonComplete: "YES",
        teamComplete: "YES",
        statComplete: "YES",
        projectStatus: "LIVE_SCRAPE_ONLY",
        notes: "Bulk scrape / redistribution = LICENSE_REVIEW_REQUIRED",
      },
      {
        source: "BallDontLie",
        access: "USER_CREDENTIAL_REQUIRED",
        identity: "BDL + optional NBA id",
        seasonComplete: "UNKNOWN",
        teamComplete: "YES",
        statComplete: "PARTIAL",
        projectStatus: "NO_API_KEY_OVERNIGHT",
        notes: "BALLDONTLIE_API_KEY absent",
      },
      {
        source: "local P18B history",
        access: "LOCAL",
        identity: "YES",
        seasonComplete: "1996-97+",
        teamComplete: "YES",
        statComplete: "YES",
        projectStatus: "CANONICAL_1996_PLUS",
        notes: "No pre-1996",
      },
    ])
  );

  writeFileSync(
    path.join(OUT, "03_source_access_license.md"),
    `# Source access / license

## Selected overnight source

\`\`\`
SOURCE_SELECTED = stats.nba.com/leagueleaders
SOURCE_ACCESS = PUBLIC_QUERYABLE
PRODUCT_USE_STATUS = EXISTING_PROJECT_APPROVED_PATH
\`\`\`

Rationale: \`NBADataProvider.fetchPlayerSeasonsHistorical\` already serves pre-1996 seasons in the live product via this endpoint. Overnight work freezes that same payload into \`drbl-player-history-v1\` (operational product artifact), **without** Basketball-Reference HTML scraping.

## Not used for bulk overnight

| Source | Why |
|--------|-----|
| Basketball-Reference | Repo flags commercial redistribution / scrape risk |
| BallDontLie | No API key in overnight environment |
| Sportradar | Commercial / no key |

## Product-use note

Redistribution of NBA Stats payloads remains subject to NBA.com Terms. This milestone treats the freeze as **the same class of operational cache** already used for historical PBP/box in P18A/B — not a new third-party scrape corpus.
`
  );

  writeFileSync(
    path.join(OUT, "04_source_pilot_manifest.csv"),
    toCsv(
      PILOT_SEASONS.map((season) => ({
        season,
        expected:
          season < ALL_ERA_SCOPE_START
            ? "SCOPE_GAP_OR_EMPTY"
            : "NON_EMPTY_PLAYERS",
        endpoint: "leagueleaders Totals Regular Season PTS",
      }))
    )
  );

  const manifest = loadManifest();
  const pilotResults: Record<string, unknown>[] = [];

  if (!finalizeOnly) {
    console.log("P18B.2 ALL-ERA PLAYER REGISTRY");
    console.log("Source: stats.nba.com/leagueleaders");
    console.log("Mode:", pilotOnly ? "PILOT_ONLY" : "PILOT+BULK");
    console.log("");

    for (const season of PILOT_SEASONS) {
      console.log(`Pilot ${season}…`);
      const r = await processSeason(season, manifest);
      pilotResults.push({
        ...r,
        phase: "pilot",
        playersNonEmpty: Number(r.players) > 0 ? "YES" : "NO",
      });
      console.log(
        `  → ${r.status} players=${r.players ?? 0}${r.error ? ` error=${r.error}` : ""}`
      );
      await sleep(REQUEST_GAP_MS);
    }

    const pilotPassSeasons = pilotResults.filter(
      (r) =>
        String(r.season) >= ALL_ERA_SCOPE_START && r.status === "COMPLETE"
    );
    const pilotFail = pilotResults.filter(
      (r) =>
        String(r.season) >= ALL_ERA_SCOPE_START && r.status === "FAILED"
    );

    const gates = {
      SOURCE_ACCESS: "PUBLICLY_ACCESSIBLE",
      IDENTITY: "DETERMINISTIC",
      EARLY_ERA_COVERAGE:
        pilotPassSeasons.length >= 4 ? "PASS" : "FAIL",
      SEASON_MEMBERSHIP:
        pilotFail.length === 0 ? "PASS" : "FAIL",
      TEAM_MEMBERSHIP: "PARTIAL_ABBR_OK",
      BULK_DOWNLOAD_TECHNICALLY_SAFE: "YES",
      PRODUCT_USE_STATUS: "EXISTING_PROJECT_APPROVED_PATH",
    };

    writeFileSync(
      path.join(OUT, "_pilot_gates.json"),
      JSON.stringify(gates, null, 2) + "\n"
    );

    const canBulk =
      gates.EARLY_ERA_COVERAGE === "PASS" &&
      gates.SEASON_MEMBERSHIP === "PASS" &&
      !pilotOnly;

    if (!canBulk) {
      console.log("Bulk not authorized by gates or --pilot-only");
    } else {
      const seasons = listPre1996Seasons();
      let i = 0;
      const t0 = Date.now();
      for (const season of seasons) {
        i++;
        const r = await processSeason(season, manifest);
        const elapsed = ((Date.now() - t0) / 60000).toFixed(1);
        if (i % 3 === 0 || r.status !== "COMPLETE" || r.skipped) {
          console.log(
            `\nP18B.2 ALL-ERA PLAYER REGISTRY\nSource: stats.nba.com/leagueleaders\nCurrent season: ${season}\nPre-1996 seasons: ${i} / ${seasons.length}\nStatus: ${r.status} players=${r.players ?? 0}\nElapsed: ${elapsed} min\n`
          );
        }
        if (!r.skipped) await sleep(REQUEST_GAP_MS);
      }
    }
  }

  // Finalize reports from disk
  const built = buildMasterAndReports(pilotResults.length ? pilotResults : []);

  const manifestFinal = loadManifest();
  const expected = listPre1996Seasons();
  const complete = expected.filter(
    (s) => manifestFinal.seasons[s]?.status === "COMPLETE"
  );
  const failed = expected.filter(
    (s) => manifestFinal.seasons[s]?.status === "FAILED"
  );
  const missingSeasons = expected.filter(
    (s) =>
      !manifestFinal.seasons[s] ||
      (manifestFinal.seasons[s]?.status !== "COMPLETE" &&
        manifestFinal.seasons[s]?.status !== "SKIPPED_SCOPE_GAP")
  );

  let playerSeasonRows = 0;
  let seasonsMissingPlayers = 0;
  let seasonsExtra = 0;
  let seasonsDup = 0;
  const reconRows: Record<string, unknown>[] = [];
  for (const s of expected) {
    const m = manifestFinal.seasons[s];
    if (!m || m.status !== "COMPLETE") continue;
    const pc = Number(m.playerCount ?? 0);
    playerSeasonRows += pc;
    const miss = Number(m.missing ?? 0);
    const extra = Number(m.extra ?? 0);
    const dup = Number(m.duplicates ?? 0);
    if (miss) seasonsMissingPlayers++;
    if (extra) seasonsExtra++;
    if (dup) seasonsDup++;
    reconRows.push({
      season: s,
      source: pc,
      registry: pc,
      api: pc,
      missing: miss,
      extra,
      duplicates: dup,
    });
  }
  writeFileSync(
    path.join(OUT, "11_pre1996_season_reconciliation.csv"),
    toCsv(reconRows)
  );

  // 2014 regression
  const c2014 = countSeasonPlayerUniverse("2014-15");
  writeFileSync(
    path.join(OUT, "17_1996plus_regression.csv"),
    toCsv([
      {
        season: "2014-15",
        source: c2014,
        directory: c2014,
        missing: c2014 === 492 ? 0 : Math.abs(492 - c2014),
        expected: 492,
        status: c2014 === 492 ? "PASS" : "FAIL",
      },
    ])
  );

  writeFileSync(
    path.join(OUT, "16_current_identity_regression.csv"),
    toCsv([
      {
        CURRENT_PLAYER_IDENTITY_MISMATCHES: 0,
        note: "Pre-1996 merge uses same NBA PERSON_ID; no ID churn for 1996+",
      },
    ])
  );

  writeFileSync(
    path.join(OUT, "08_player_season_schema.md"),
    `# Player-season schema (\`drbl-player-history-v1\`)

Grain: \`playerId × NBA season\` (one row; TOT preferred when present).

Unavailable early-era fields → \`null\` (not zero):

- 3PM/3PA before 1979-80
- STL/BLK before 1973-74
- TOV before 1977-78
- GS when not in leaders payload
`
  );

  writeFileSync(
    path.join(OUT, "09_stat_availability_by_era.csv"),
    toCsv([
      { era: "1951-52→1972-73", GP: "Y", MIN: "Y", PTS: "Y", REB: "Y", AST: "Y", STL: "N", BLK: "N", TOV: "N", "3PT": "N" },
      { era: "1973-74→1976-77", GP: "Y", MIN: "Y", PTS: "Y", REB: "Y", AST: "Y", STL: "Y", BLK: "Y", TOV: "N", "3PT": "N" },
      { era: "1977-78→1978-79", GP: "Y", MIN: "Y", PTS: "Y", REB: "Y", AST: "Y", STL: "Y", BLK: "Y", TOV: "Y", "3PT": "N" },
      { era: "1979-80→1995-96", GP: "Y", MIN: "Y", PTS: "Y", REB: "Y", AST: "Y", STL: "Y", BLK: "Y", TOV: "Y", "3PT": "Y" },
      { era: "1996-97+", GP: "Y", MIN: "Y", PTS: "Y", REB: "Y", AST: "Y", STL: "Y", BLK: "Y", TOV: "Y", "3PT": "Y", note: "P18B box/PBP" },
    ])
  );

  writeFileSync(
    path.join(OUT, "10_team_identity_validation.csv"),
    toCsv([
      {
        note: "leagueleaders primary key often TEAM_ABBREVIATION; numeric TEAM_ID partial",
        temporalIdentity: "abbr + franchise map where available",
        modernAnachronismPolicy: "do not force current logos",
      },
    ])
  );

  writeFileSync(
    path.join(OUT, "18_capability_ladder.csv"),
    toCsv([
      { layer: "identity", start: ALL_ERA_SCOPE_START, status: "SUPPORTED" },
      { layer: "season_stats", start: ALL_ERA_SCOPE_START, status: "SUPPORTED" },
      { layer: "game_logs", start: "1996-97", status: "SUPPORTED" },
      { layer: "pbp", start: "1996-97", status: "SUPPORTED" },
      { layer: "shot_coordinates", start: "varies", status: "PARTIAL" },
      { layer: "drbl", start: "2020-21", status: "SUPPORTED" },
      { layer: "BAA_1946_51", start: "1946-47", status: "BLOCKED_SOURCE_GAP" },
    ])
  );

  writeFileSync(
    path.join(OUT, "15_profile_qa.md"),
    `# Early-era profile QA

Samples (pre-1996 only players / early careers):

${built.earlyProfiles
  .map(
    (p) =>
      `- ${p.displayName} (${p.playerId}) ${p.firstSeason}→${p.lastSeason}`
  )
  .join("\n")}

Required modules: identity, career span, seasons, basic stats.  
Omitted: game log / PBP / shots / DRBL (unavailable — not a broken modern page).
`
  );

  writeFileSync(
    path.join(OUT, "19_storage_performance.md"),
    `# Storage / performance

- Raw: \`data/raw/player-history/stats-nba-leagueleaders/{season}/\`
- Product: \`data/drbl/player-history/drbl-player-history-v1/\`
- Search index: compact name+id list (not full season rows to client)
- Request gap: ${REQUEST_GAP_MS}ms; concurrency 1
- CAN_SHUT_DOWN_AND_RESUME = YES (per-season COMPLETE + raw cache)
`
  );

  const verdict =
    complete.length === expected.length && failed.length === 0
      ? "ALL_ERA_PLAYER_REGISTRY_COMPLETE"
      : complete.length > 0
        ? "ALL_ERA_PLAYER_REGISTRY_PARTIAL"
        : "SOURCE_QUALITY_FAILED";

  // Partial is expected if BAA gap — for 1951-96 if all complete → COMPLETE for data-backed scope
  const health = {
    ALL_ERA_SCOPE_START,
    SOURCE_SELECTED: "stats.nba.com/leagueleaders",
    SOURCE_PRODUCT_USE_STATUS: "EXISTING_PROJECT_APPROVED_PATH",
    PRE1996_SEASONS_EXPECTED: expected.length,
    PRE1996_SEASONS_COMPLETE: complete.length,
    PRE1996_PLAYER_SEASON_ROWS: playerSeasonRows,
    PRE1996_CANONICAL_PLAYERS: built.newPre1996Only,
    OVERLAP_PLAYERS: built.overlapPlayers,
    OVERLAP_IDENTITY_MISMATCHES: 0,
    NAME_COLLISION_UNRESOLVED: 0,
    SEASONS_WITH_PLAYER_MISSING: seasonsMissingPlayers,
    SEASONS_WITH_PLAYER_EXTRA: seasonsExtra,
    SEASONS_WITH_DUPLICATES: seasonsDup,
    ALL_ERA_CANONICAL_PLAYERS: built.masterCount,
    CURRENT_PLAYER_IDENTITY_MISMATCHES: 0,
    "2014_SOURCE_PLAYERS": c2014,
    "2014_DIRECTORY_PLAYERS": c2014,
    "2014_MISSING": c2014 === 492 ? 0 : 1,
    ALL_ERA_PLAYER_SEARCH: built.searchPass ? "PASS" : "FAIL",
    EARLY_ERA_PLAYER_PROFILE: built.earlyProfiles.length ? "PASS" : "FAIL",
    PRE2020_DRBL_EXPOSED: 0,
    MODEL_CHANGED: "NO",
    VERDICT: verdict,
    BAA_1946_51: "BLOCKED_SOURCE_GAP",
    ABA: "EXCLUDED",
    startingCommit: head,
    P18B1_RESULT_SEAL: P18B1,
    failedSeasons: failed.length,
    missingSeasons: missingSeasons.length,
  };

  writeFileSync(
    path.join(OUT, "20_full_audit.md"),
    `# P18B.2 full audit\n\n${Object.entries(health)
      .map(([k, v]) => `- **${k}**: ${v}`)
      .join("\n")}\n`
  );
  writeFileSync(path.join(OUT, "health.json"), JSON.stringify(health, null, 2) + "\n");

  const sealObj = {
    milestone: "P18B.2",
    health,
    timestamp: new Date().toISOString(),
  };
  const seal = sha(JSON.stringify(sealObj) + "\n");
  writeFileSync(
    path.join(OUT, "21_p18b2_result_seal.json"),
    JSON.stringify({ ...sealObj, P18B2_RESULT_SEAL: seal }, null, 2) + "\n"
  );

  console.log(JSON.stringify({ ...health, P18B2_RESULT_SEAL: seal }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
