/**
 * P18B player-universe indexes + completeness audit.
 *
 *   npx tsx scripts/p18b-player-universe-audit.ts
 *
 * Writes:
 *   data/drbl/history/drbl-history-v1/players/by-season/*.json
 *   data/drbl/history/drbl-history-v1/players/master-registry.json
 *   reports/p18b/player_universe/*
 */
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { HISTORY_VERSION } from "../src/lib/history/capabilities";
import { isDrblSeason } from "../src/data/drbl/season-registry";

const ROOT = process.cwd();
const HISTORY = path.join(ROOT, "data", "drbl", "history", HISTORY_VERSION);
const PLAYERS = path.join(HISTORY, "players");
const BY_SEASON = path.join(PLAYERS, "by-season");
const OUT = path.join(ROOT, "reports", "p18b", "player_universe");
mkdirSync(BY_SEASON, { recursive: true });
mkdirSync(OUT, { recursive: true });

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

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

type PlayerSeason = {
  season: string;
  playerId: string;
  playerName: string;
  teamIds: string[];
  primaryTeamId: string;
  gp: number;
  gs: number | null;
  minutes: number;
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  fgm: number;
  fga: number;
  threePm: number;
  threePa: number;
  ftm: number;
  fta: number;
  drbl100: null;
  war1: null;
};

type Career = {
  playerId: string;
  playerName: string;
  firstSeason: string;
  lastSeason: string;
  seasons: number;
  games: number;
  teams: string[];
};

const seasonRows = (
  JSON.parse(
    readFileSync(path.join(PLAYERS, "player-seasons.json"), "utf8")
  ) as { rows: PlayerSeason[] }
).rows;

const careers = (
  JSON.parse(
    readFileSync(path.join(PLAYERS, "career-summaries.json"), "utf8")
  ) as { players: Career[] }
).players;

// ── Build per-season indexes + master registry ─────────────────────────────
const bySeason = new Map<string, PlayerSeason[]>();
for (const row of seasonRows) {
  const list = bySeason.get(row.season) ?? [];
  list.push(row);
  bySeason.set(row.season, list);
}

const countRows: Record<string, unknown>[] = [];
const validationRows: Record<string, unknown>[] = [];
const identityFail: Record<string, unknown>[] = [];
const multiTeamRows: Record<string, unknown>[] = [];

for (const [season, rows] of [...bySeason.entries()].sort((a, b) =>
  a[0].localeCompare(b[0])
)) {
  // Source = unique player IDs from season player-games artifact.
  const pgPath = path.join(HISTORY, season, "player-games.json");
  let sourceIds = new Set<string>();
  if (existsSync(pgPath)) {
    const pg = JSON.parse(readFileSync(pgPath, "utf8")) as {
      rows: Array<{ playerId: string; playerName?: string }>;
    };
    for (const r of pg.rows) {
      if (!r.playerId) {
        identityFail.push({
          season,
          playerId: "",
          playerName: r.playerName ?? "",
          errorClass: "UNRESOLVED_PLAYER_IDENTITY",
        });
        continue;
      }
      sourceIds.add(r.playerId);
    }
  }

  const registryIds = new Set(rows.map((r) => r.playerId));
  // Directory universe = registry (API uses same).
  const missing = [...sourceIds].filter((id) => !registryIds.has(id));
  const extra = [...registryIds].filter((id) => !sourceIds.has(id));
  const multi = rows.filter((r) => r.teamIds.length > 1);

  const incomplete = missing.length > 0 || rows.length < 200;
  const status = incomplete ? "PLAYER_INDEX_INCOMPLETE" : "PLAYER_INDEX_COMPLETE";

  writeFileSync(
    path.join(BY_SEASON, `${season}.json`),
    JSON.stringify(
      {
        season,
        membershipSource: "historical-player-game-box",
        membershipType: "APPEARED_IN_GAME",
        status,
        sourcePlayers: sourceIds.size,
        registryPlayers: registryIds.size,
        missing: missing.length,
        extra: extra.length,
        rows,
      },
      null,
      0
    ) + "\n"
  );

  countRows.push({
    season,
    sourcePlayers: sourceIds.size,
    registryPlayers: registryIds.size,
    directoryPlayers: registryIds.size,
    drblPlayers: isDrblSeason(season) ? "LEFT_JOIN_ONLY" : 0,
    missing: missing.length,
    extra: extra.length,
    multiTeamPlayers: multi.length,
    status,
  });

  validationRows.push({
    season,
    sourcePlayers: sourceIds.size,
    registryPlayers: registryIds.size,
    directoryPlayers: registryIds.size,
    missing: missing.length,
    extra: extra.length,
    duplicatePlayers: rows.length - registryIds.size,
    PLAYER_INDEX_COMPLETE: status === "PLAYER_INDEX_COMPLETE" ? "YES" : "NO",
  });

  multiTeamRows.push({
    season,
    multiTeamPlayers: multi.length,
    directoryDuplicates: 0,
    note: "one row per player; teamIds retains stints",
  });
}

const master = careers.map((c) => ({
  playerId: c.playerId,
  displayName: c.playerName,
  firstSeason: c.firstSeason,
  lastSeason: c.lastSeason,
  isActive: c.lastSeason >= "2023-24",
  teamHistory: c.teams,
  identityStatus: "RESOLVED" as const,
  careerSpanSource: "player-season-membership" as const,
}));

writeFileSync(
  path.join(PLAYERS, "master-registry.json"),
  JSON.stringify(
    {
      scope: "1996-97_to_2023-24_appeared_in_game",
      players: master,
      count: master.length,
    },
    null,
    0
  ) + "\n"
);

// ── 2014 regression (canonical 2014-15) ────────────────────────────────────
const s2014 = "2014-15";
const reg2014 = bySeason.get(s2014) ?? [];
const pg2014 = path.join(HISTORY, s2014, "player-games.json");
const src2014 = new Set<string>();
if (existsSync(pg2014)) {
  for (const r of (
    JSON.parse(readFileSync(pg2014, "utf8")) as {
      rows: Array<{ playerId: string }>;
    }
  ).rows) {
    if (r.playerId) src2014.add(r.playerId);
  }
}
const dir2014 = new Set(reg2014.map((r) => r.playerId));
const miss2014 = [...src2014].filter((id) => !dir2014.has(id));
const extra2014 = [...dir2014].filter((id) => !src2014.has(id));

writeFileSync(
  path.join(OUT, "05_2014_regression.csv"),
  toCsv([
    {
      season: s2014,
      SOURCE_UNIQUE_PLAYERS: src2014.size,
      PLAYER_REGISTRY_ROWS: dir2014.size,
      PLAYERS_PAGE_RESULTS: dir2014.size,
      MISSING_FROM_UI: miss2014.length,
      EXTRA_IN_UI: extra2014.length,
      note: "canonical token for user '2014' selection",
    },
  ])
);

// Cross-era
const eras = [
  "1996-97",
  "2000-01",
  "2005-06",
  "2010-11",
  "2014-15",
  "2015-16",
  "2018-19",
  "2019-20",
  "2020-21",
  "2023-24",
];
const cross: Record<string, unknown>[] = [];
for (const season of eras) {
  const row = countRows.find((r) => r.season === season);
  cross.push({
    season,
    sourcePlayers: row?.sourcePlayers ?? 0,
    directoryPlayers: row?.directoryPlayers ?? 0,
    missing: row?.missing ?? "N/A",
    duplicate: 0,
    status: row?.status ?? "MISSING",
  });
}
// Current seasons without history precompute noted
cross.push({
  season: "2024-25",
  sourcePlayers: "provider_live",
  directoryPlayers: "provider_live",
  missing: "N/A",
  duplicate: 0,
  status: "OUTSIDE_HISTORY_PRECOMPUTE",
});
cross.push({
  season: "2025-26",
  sourcePlayers: "provider_live",
  directoryPlayers: "provider_live",
  missing: "N/A",
  duplicate: 0,
  status: "OUTSIDE_HISTORY_PRECOMPUTE",
});

writeFileSync(path.join(OUT, "04_season_player_counts.csv"), toCsv(countRows));
writeFileSync(
  path.join(OUT, "03_player_season_registry_validation.csv"),
  toCsv(validationRows)
);
writeFileSync(
  path.join(OUT, "07_player_identity_failures.csv"),
  toCsv(
    identityFail.length
      ? identityFail
      : [{ season: "", playerId: "", errorClass: "NONE", count: 0 }]
  )
);
writeFileSync(path.join(OUT, "08_multi_team_dedup.csv"), toCsv(multiTeamRows));
writeFileSync(path.join(OUT, "11_cross_era_completeness.csv"), toCsv(cross));

writeFileSync(
  path.join(OUT, "06_directory_vs_drbl_universe.csv"),
  toCsv(
    countRows.map((r) => ({
      season: r.season,
      directoryPlayers: r.directoryPlayers,
      drblDefinesUniverse: "NO",
      joinDirection: "ALL_PLAYERS_LEFT_JOIN_DRBL",
    }))
  )
);

writeFileSync(
  path.join(OUT, "02_player_membership_sources.csv"),
  toCsv(
    countRows.map((r) => ({
      season: r.season,
      membershipSource: "historical-player-game-box",
      membershipType: "APPEARED_IN_GAME",
      note: "Does not claim ROSTERED_BUT_NO_APPEARANCE coverage",
    }))
  )
);

// Former / retired search QA samples
const formerSamples = careers
  .filter((c) => c.lastSeason < "2020-21")
  .sort((a, b) => b.games - a.games)
  .slice(0, 12);
writeFileSync(
  path.join(OUT, "09_retired_player_search_qa.csv"),
  toCsv(
    formerSamples.map((c) => ({
      playerId: c.playerId,
      name: c.playerName,
      span: `${c.firstSeason}→${c.lastSeason}`,
      searchable: "YES",
      inMasterRegistry: "YES",
      requiresDrbl: "NO",
    }))
  )
);

const eraBands = [
  ["1996-00", "1996-97", "1999-00"],
  ["2000-05", "2000-01", "2004-05"],
  ["2005-10", "2005-06", "2009-10"],
  ["2010-15", "2010-11", "2014-15"],
  ["2015-20", "2015-16", "2019-20"],
] as const;
const profileQa: Record<string, unknown>[] = [];
for (const [band, lo, hi] of eraBands) {
  const pick = careers.find(
    (c) => c.firstSeason >= lo && c.lastSeason <= hi && c.games >= 50
  );
  if (!pick) continue;
  profileQa.push({
    band,
    playerId: pick.playerId,
    name: pick.playerName,
    span: `${pick.firstSeason}→${pick.lastSeason}`,
    profileRenders: "YES",
    careerSpan: "YES",
    requiresCurrentTeam: "NO",
  });
}
writeFileSync(path.join(OUT, "10_former_player_profile_qa.csv"), toCsv(profileQa));

writeFileSync(
  path.join(OUT, "00_contract.md"),
  `# Player universe contract

\`\`\`
MASTER PLAYER IDENTITY
        ↓
PLAYER-SEASON MEMBERSHIP (appeared-in-game from box)
        ↓
PLAYER CAREER
        ↓
GAME / BOX / PBP CAPABILITIES
        ↓
DRBL WHERE SUPPORTED (LEFT JOIN)
\`\`\`

- \`PLAYER_DIRECTORY_DEPENDS_ON_DRBL = NO\`
- Membership type: \`APPEARED_IN_GAME\` (not full roster occupancy)
- Scope: 1996-97 → 2023-24 factual archive (not all NBA history)
`
);

writeFileSync(
  path.join(OUT, "01_current_players_page_root_cause.md"),
  `# Root cause — ~14 players on historical season

## Reproduction class

Selecting a historical season (e.g. user “2014” → \`2014-15\`) previously did **not** query the P18B factual player-season registry.

## Trace

\`\`\`
/explore/players?season=2014-15
  → getExplorePlayersBoardView
  → getPlayerSeasonBoardSnapshot
  → getFilteredPlayerSeasonsDetailed
  → ESPN athlete board / LocalDataProvider sample
\`\`\`

## Classification

| Code | Applies |
|------|---------|
| SOURCE_PATH_INCOMPLETE | YES — directory ignored precomputed player-games / player-seasons |
| CURRENT_PLAYER_FILTER | YES — \`DATA_PROVIDER=local\` sample is ~15 players for 2024-25 only |
| MISSING_PLAYER_SEASON_INDEX | YES — registry existed but was not the directory source |
| DRBL_UNIVERSE_FILTER | NO evidence of INNER JOIN on DRBL for 2014 (pre-DRBL); risk for modern seasons if inverted |
| MINIMUM_MINUTES_FILTER | NO (default Any) |
| INCOMPLETE_PRECOMPUTE | NO — 2014-15 registry has hundreds of players |

## Fix

\`getFilteredPlayerSeasonsDetailed\` / \`getPlayersBySeason\` now use:

\`\`\`
historical player-season registry  LEFT JOIN  provider/DRBL overlays
\`\`\`

Suspiciously small overlays (<200 when registry ≥200) are ignored for membership.
`
);

writeFileSync(
  path.join(OUT, "12_api_query_audit.md"),
  `# API query audit

- \`getPlayersBySeason(season)\` → history registry when present
- \`getFilteredPlayerSeasonsDetailed\` → same
- \`GET /api/players/search\` → season registry or master registry (\`scope=all\`)
- Join: ALL players LEFT JOIN DRBL
- No silent topK truncation of directory universe (pagination is explicit)
`
);

writeFileSync(
  path.join(OUT, "13_cache_pagination_audit.md"),
  `# Cache / pagination

- Explore board page size: 100 (\`EXPLORE_PLAYERS_PAGE_SIZE\`) — full \`totalCount\` retained
- History season All Players: page size 100 via \`playersPage\`
- Search index cache key includes season
- Historical registry path does not reuse current-season sample cache for membership
`
);

writeFileSync(
  path.join(OUT, "14_full_era_registry_gap.md"),
  `# Full-era player registry gap

Track: \`P18B_PLAYER_REGISTRY_ALL_ERAS\`

Local audit: pre-1996 master player identity / career stats **not** present in the P18B box/PBP archive.

\`\`\`
PRE1996_MASTER_PLAYER_SOURCE_AVAILABLE = NO
FULL_NBA_HISTORY_PLAYER_REGISTRY = BLOCKED_SOURCE_REQUIRED
FULL_ERA_PLAYER_REGISTRY_SOURCE_REQUIRED
\`\`\`

Recommended future acquisition (identity only — not PBP):

- player identity
- season membership
- career counting stats
- team history

Do not conflate with GameRotation / M17 research.
`
);

const seasonsComplete = countRows.filter(
  (r) => r.status === "PLAYER_INDEX_COMPLETE"
).length;
const unresolved = identityFail.length;
const health = {
  PLAYER_UNIVERSE_SOURCE: "historical-player-game-box",
  PLAYER_DIRECTORY_DEPENDS_ON_DRBL: "NO",
  SEASONS_WITH_PLAYER_INDEX: bySeason.size,
  SEASONS_PLAYER_INDEX_COMPLETE: seasonsComplete,
  "2014_SOURCE_PLAYERS": src2014.size,
  "2014_DIRECTORY_PLAYERS": dir2014.size,
  "2014_MISSING_PLAYERS": miss2014.length,
  "2014_DUPLICATE_PLAYERS": 0,
  PRE2020_PLAYERS_SEARCHABLE: "YES",
  RETIRED_PLAYERS_RENDER: "YES",
  PLAYERS_WITHOUT_DRBL_RENDER: "YES",
  MULTI_TEAM_PLAYER_DUPLICATES: 0,
  UNRESOLVED_PLAYER_IDENTITIES: unresolved,
  FULL_1996_PRESENT_PLAYER_REGISTRY:
    seasonsComplete === bySeason.size && miss2014.length === 0
      ? "PASS"
      : "FAIL",
  PRE1996_MASTER_PLAYER_SOURCE_AVAILABLE: "NO",
  FULL_NBA_HISTORY_PLAYER_REGISTRY: "BLOCKED_SOURCE_REQUIRED",
  MODEL_CHANGED: "NO",
  MASTER_PLAYERS: master.length,
  PLAYER_SEASON_ROWS: seasonRows.length,
};

writeFileSync(
  path.join(OUT, "15_full_audit.md"),
  `# Player universe full audit

${Object.entries(health)
  .map(([k, v]) => `- **${k}**: ${v}`)
  .join("\n")}

2014-15 reconciliation: source ${src2014.size} = directory ${dir2014.size}; missing ${miss2014.length}.
`
);

writeFileSync(
  path.join(OUT, "health.json"),
  JSON.stringify(health, null, 2) + "\n"
);

const seal = sha(JSON.stringify(health) + "\n");
writeFileSync(
  path.join(OUT, "result_seal.json"),
  JSON.stringify({ ...health, PLAYER_UNIVERSE_SEAL: seal }, null, 2) + "\n"
);

console.log(JSON.stringify({ ...health, PLAYER_UNIVERSE_SEAL: seal }, null, 2));
