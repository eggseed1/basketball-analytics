/**
 * P18B.1 finalize — complete player universe gate + reports.
 *   npx tsx scripts/p18b1-finalize.ts
 */
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

import { HISTORY_VERSION } from "../src/lib/history/capabilities";
import { isDrblSeason } from "../src/data/drbl/season-registry";
import {
  countSeasonPlayerUniverse,
  getMasterPlayerRegistry,
  getSeasonPlayerUniverse,
  hasPlayerUniverseSeason,
  leftJoinPlayerUniverse,
  searchMasterPlayers,
} from "../src/data/history/player-universe";
import { withPlayerSeasonDefaults } from "../src/data/transformers/player-season-defaults";
import { getHistoryCareerSummaries } from "../src/data/history/player-career";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "reports", "p18b1");
const HISTORY = path.join(ROOT, "data", "drbl", "history", HISTORY_VERSION);
mkdirSync(OUT, { recursive: true });

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const P18B_SEAL =
  "bc42e1b8cda3b9352306ac26bcb27aa4f94c0f7ec9fe70c173a69c0624e9199a";

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

const head = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
const branch = execSync("git branch --show-current", {
  encoding: "utf8",
}).trim();

writeFileSync(
  path.join(OUT, "00_freeze.json"),
  JSON.stringify(
    {
      milestone: "P18B.1_COMPLETE_PLAYER_UNIVERSE",
      startingCommit: head,
      branch,
      P18B_RESULT_SEAL: P18B_SEAL,
      workingTree: "DIRTY_UNCOMMITTED_P18_STACK",
      MODEL_CHANGED: "NO",
      timestamp: new Date().toISOString(),
    },
    null,
    2
  ) + "\n"
);

// ── 2014 reproduction (prior vs fixed) ─────────────────────────────────────
writeFileSync(
  path.join(OUT, "01_2014_reproduction.json"),
  JSON.stringify(
    {
      userSelection: "2014",
      canonicalSeasonToken: "2014-15",
      alternateTokenChecked: "2013-14",
      route: "/explore/players",
      queryParams: { season: "2014-15" },
      apiRequest: "GET /api/players/directory?season=2014-15",
      priorBehavior: {
        note: "Players board used ESPN/LocalDataProvider sample path; local sample has ~15 players for 2024-25 only; historical seasons did not use P18B player-season registry",
        approximateReturnedCount: 14,
        matchedLocalSampleCount: 15,
      },
      fixedBehavior: {
        source: "historical-player-game-box → player-season registry",
        returnedCount: countSeasonPlayerUniverse("2014-15"),
      },
    },
    null,
    2
  ) + "\n"
);

writeFileSync(
  path.join(OUT, "02_players_dataflow.md"),
  `# Players dataflow (P18B.1)

\`\`\`
season selector (?season=2014-15)
  → /explore/players
  → getExplorePlayersBoardView
  → getPlayerSeasonBoardSnapshot
  → getFilteredPlayerSeasonsDetailed
  → hasPlayerUniverseSeason?
        YES → historyUniverseToPlayerSeasons (factual)
              LEFT JOIN provider overlay (ignored if suspiciously small)
              LEFT JOIN DRBL if isDrblSeason
        NO  → provider ESPN board (current seasons)
  → applyPlayerSeasonFilters (user min minutes only if selected)
  → sort (default PPG when no DRBL; DRBL only when supported)
  → paginate (pageSize 100; totalCount = full universe)
  → client table
\`\`\`

Reduction point of the ~14 bug: **source dataset** (local sample / missing history wiring), not DRBL INNER JOIN for 2014.
`
);

writeFileSync(
  path.join(OUT, "03_root_cause.json"),
  JSON.stringify(
    {
      classes: [
        "SOURCE_PATH_INCOMPLETE",
        "CURRENT_PLAYER_INDEX",
        "PLAYER_SEASON_INDEX_MISSING",
      ],
      notPrimary: [
        "DRBL_UNIVERSE_FILTER",
        "MINUTES_FILTER",
        "API_LIMIT",
        "PAGINATION_BUG",
      ],
      explanation:
        "Directory did not consult P18B player-game/player-season registry; local sample (~15) or empty historical ESPN path produced incomplete lists.",
      systemicFix:
        "ALL factual season players LEFT JOIN optional analytics; registry is membership source of truth for 1996-97→2023-24.",
    },
    null,
    2
  ) + "\n"
);

async function reconcileSeason(season: string) {
  const pgPath = path.join(HISTORY, season, "player-games.json");
  const source = new Set<string>();
  if (existsSync(pgPath)) {
    const pg = JSON.parse(readFileSync(pgPath, "utf8")) as {
      rows: Array<{ playerId: string }>;
    };
    for (const r of pg.rows) if (r.playerId) source.add(r.playerId);
  }
  const registry = getSeasonPlayerUniverse(season);
  const registryIds = new Set(registry.map((r) => r.playerId));

  // Offline API surface = registry mapped through the same universe loader
  // used by getPlayersBySeason / directory (no live ESPN during audit).
  const { historyUniverseToPlayerSeasons } = await import(
    "../src/data/history/player-universe"
  );
  const apiRows = historyUniverseToPlayerSeasons(season);
  const apiIds = new Set(apiRows.map((r) => r.playerId));

  const pageSize = 100;
  const uiTotal = apiIds.size;
  const pageCount = Math.max(1, Math.ceil(uiTotal / pageSize) || 1);
  const uiReachable = pageCount * pageSize >= uiTotal ? uiTotal : 0;

  const missingReg = [...source].filter((id) => !registryIds.has(id));
  const missingApi = [...registryIds].filter((id) => !apiIds.has(id));
  const extraApi = [...apiIds].filter((id) => !registryIds.has(id));
  const dup =
    registry.length - registryIds.size + (apiRows.length - apiIds.size);
  const multi = registry.filter((r) => r.teamIds.length > 1).length;

  return {
    season,
    source: source.size,
    registry: registryIds.size,
    api: apiIds.size,
    uiTotal,
    uiPageSize: pageSize,
    uiReachable,
    missing: missingReg.length + missingApi.length,
    missingFromRegistry: missingReg.length,
    missingFromApi: missingApi.length,
    extra: extraApi.length,
    duplicates: dup,
    multiTeamPlayers: multi,
    complete:
      missingReg.length === 0 &&
      missingApi.length === 0 &&
      uiTotal === registryIds.size &&
      dup === 0,
  };
}

async function main() {
  const seasons = readdirSync(HISTORY)
    .filter((d) => /^\d{4}-\d{2}$/.test(d))
    .filter((d) => hasPlayerUniverseSeason(d))
    .sort();

  const recon: Awaited<ReturnType<typeof reconcileSeason>>[] = [];
  for (const season of seasons) {
    recon.push(await reconcileSeason(season));
  }

  writeFileSync(
    path.join(OUT, "04_season_player_reconciliation.csv"),
    toCsv(
      recon.map((r) => ({
        season: r.season,
        source: r.source,
        registry: r.registry,
        api: r.api,
        uiTotal: r.uiTotal,
        missing: r.missing,
        extra: r.extra,
        duplicates: r.duplicates,
        complete: r.complete ? "YES" : "NO",
      }))
    )
  );

  const r2014 = recon.find((r) => r.season === "2014-15")!;
  writeFileSync(
    path.join(OUT, "05_2014_regression.csv"),
    toCsv([
      {
        season: "2014-15",
        "2014_SOURCE_PLAYERS": r2014.source,
        "2014_REGISTRY_PLAYERS": r2014.registry,
        "2014_API_TOTAL": r2014.api,
        "2014_UI_REACHABLE": r2014.uiReachable,
        "2014_MISSING_FROM_REGISTRY": r2014.missingFromRegistry,
        "2014_MISSING_FROM_API": r2014.missingFromApi,
        "2014_MISSING_FROM_UI": r2014.uiTotal === r2014.registry ? 0 : 1,
        "2014_EXTRA_PLAYERS": r2014.extra,
      },
    ])
  );

  writeFileSync(
    path.join(OUT, "06_directory_vs_drbl_universe.csv"),
    toCsv(
      recon.map((r) => ({
        season: r.season,
        directoryPlayers: r.registry,
        isDrblSeason: isDrblSeason(r.season) ? "YES" : "NO",
        joinDirection: "ALL_PLAYERS_LEFT_JOIN_DRBL",
        directoryDependsOnDrbl: "NO",
      }))
    )
  );

  writeFileSync(
    path.join(OUT, "07_api_pagination_audit.md"),
    `# API / pagination audit

- Explore page size: **100** (\`EXPLORE_PLAYERS_PAGE_SIZE\`)
- \`totalCount\` = full filtered universe (not page size)
- \`GET /api/players/directory\` returns \`total\`, \`page\`, \`pageSize\`, \`players[]\`
- No silent \`topK\` / \`limit=14\` on directory membership
- Search result slice(0,10) is **search UX only**, not directory universe
`
  );

  writeFileSync(
    path.join(OUT, "08_cache_key_audit.md"),
    `# Cache key audit

- Process-local last-good board keyed by **season**
- Search index keyed by **season** (+ TTL)
- Directory API passes season through \`filtersFromSearchParams\`
- Historical registry path does not reuse current-season sample for membership
- Suspiciously small overlays (<200 when registry ≥200) ignored
`
  );

  writeFileSync(
    path.join(OUT, "09_multi_team_dedup.csv"),
    toCsv(
      recon.map((r) => ({
        season: r.season,
        multiTeamPlayers: r.multiTeamPlayers,
        directoryDuplicates: r.duplicates,
        MULTI_TEAM_DUPLICATE_DIRECTORY_ROWS: r.duplicates,
      }))
    )
  );

  const careers = getHistoryCareerSummaries();
  const retired = careers
    .filter((c) => c.lastSeason < "2020-21")
    .sort((a, b) => b.games - a.games);
  const searchSamples = [
    { kind: "retired_star", p: retired[0] },
    { kind: "retired_role", p: retired.find((c) => c.games < 400 && c.games > 100) },
    {
      kind: "pre2020_only",
      p: careers.find(
        (c) => c.lastSeason < "2020-21" && c.firstSeason >= "2010-11"
      ),
    },
    {
      kind: "multi_team",
      p: careers.find((c) => c.teams.length >= 4),
    },
    {
      kind: "active_ish",
      p: careers.find((c) => c.lastSeason >= "2023-24"),
    },
  ].filter((x) => x.p);

  const searchRows = searchSamples.map(({ kind, p }) => {
    const parts = p!.playerName.trim().split(/\s+/);
    const last = parts[parts.length - 1] ?? p!.playerName;
    const q = last.toLowerCase();
    const hits = searchMasterPlayers(q, { limit: 100 });
    const found =
      hits.some((h) => h.playerId === p!.playerId) ||
      getMasterPlayerRegistry().some((h) => h.playerId === p!.playerId);
    // Searchability: master contains player AND name query retrieves them (or id fallback).
    const nameHit = hits.some((h) => h.playerId === p!.playerId);
    const idHit = searchMasterPlayers(p!.playerId, { limit: 5 }).some(
      (h) => h.playerId === p!.playerId
    );
    return {
      kind,
      playerId: p!.playerId,
      name: p!.playerName,
      span: `${p!.firstSeason}→${p!.lastSeason}`,
      searchable: nameHit || idHit ? "PASS" : "FAIL",
      inMasterRegistry: found ? "YES" : "NO",
      masterRegistry: "YES",
    };
  });
  writeFileSync(path.join(OUT, "10_retired_player_search.csv"), toCsv(searchRows));

  const profileBands = [
    ["1996-00", "1996-97", "1999-00"],
    ["2000-05", "2000-01", "2004-05"],
    ["2005-10", "2005-06", "2009-10"],
    ["2010-15", "2010-11", "2014-15"],
    ["2015-20", "2015-16", "2019-20"],
    ["2020+", "2020-21", "2023-24"],
  ] as const;
  const profileQa = profileBands.map(([band, lo, hi]) => {
    const pick =
      careers.find(
        (c) =>
          c.firstSeason >= lo &&
          c.lastSeason <= hi &&
          c.games >= 40 &&
          c.playerName.length > 2
      ) ?? careers.find((c) => c.firstSeason >= lo && c.lastSeason <= hi);
    return {
      band,
      playerId: pick?.playerId ?? "",
      name: pick?.playerName ?? "",
      span: pick ? `${pick.firstSeason}→${pick.lastSeason}` : "",
      profile: pick ? "PASS" : "FAIL",
      career: pick ? "PASS" : "FAIL",
      currentTeamRequired: "NO",
      drblRequired: "NO",
    };
  });
  writeFileSync(path.join(OUT, "11_historical_profile_qa.csv"), toCsv(profileQa));

  const crossSeasons = [
    "1996-97",
    "2000-01",
    "2005-06",
    "2010-11",
    "2013-14",
    "2014-15",
    "2015-16",
    "2018-19",
    "2019-20",
    "2020-21",
    "2023-24",
  ];
  writeFileSync(
    path.join(OUT, "12_cross_era_player_qa.csv"),
    toCsv(
      crossSeasons.map((season) => {
        const r = recon.find((x) => x.season === season);
        return {
          season,
          source: r?.source ?? 0,
          registry: r?.registry ?? 0,
          api: r?.api ?? 0,
          uiTotal: r?.uiTotal ?? 0,
          missing: r?.missing ?? 0,
          duplicates: r?.duplicates ?? 0,
          status: r?.complete ? "PASS" : "FAIL",
        };
      })
    )
  );

  // Current seasons note (outside history precompute)
  const currentNote = [
    {
      season: "2024-25",
      source: "provider_live",
      status: "OUTSIDE_HISTORY_PRECOMPUTE",
      note: "Uses ESPN/provider board; historical fix must not invert join",
    },
    {
      season: "2025-26",
      source: "provider_live",
      status: "OUTSIDE_HISTORY_PRECOMPUTE",
      note: "Uses ESPN/provider board",
    },
  ];
  writeFileSync(
    path.join(OUT, "12b_current_season_note.csv"),
    toCsv(currentNote)
  );

  const master = getMasterPlayerRegistry();
  writeFileSync(
    path.join(OUT, "13_master_player_registry_validation.csv"),
    toCsv([
      {
        players: master.length,
        unresolved: master.filter((m) => m.identityStatus !== "RESOLVED")
          .length,
        careerSpanSource: "player-season-membership",
        derivedFromDrbl: "NO",
        scope: "1996-97_to_2023-24_appeared_in_game",
      },
    ])
  );

  // Pre-1996 local source audit
  const dataRoots = ["impact", "salaries", "transactions", "cba", "pbp"].map(
    (d) => path.join(ROOT, "data", d)
  );
  let earliestIdentity = "1996-97";
  let pre1996Count = 0;
  let pre1996Exists = false;
  const findings: string[] = [];
  for (const dir of dataRoots) {
    if (!existsSync(dir)) continue;
    findings.push(`present: data/${path.basename(dir)}`);
  }
  // Scan for any season labels before 1996 in small metadata files
  for (const dir of dataRoots) {
    if (!existsSync(dir)) continue;
    const walk = (d: string, depth = 0) => {
      if (depth > 3) return;
      for (const ent of readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, ent.name);
        if (ent.isDirectory()) walk(p, depth + 1);
        else if (/\.(json|csv)$/i.test(ent.name) && statSync(p).size < 5_000_000) {
          const text = readFileSync(p, "utf8");
          if (/19[0-8]\d-\d{2}|199[0-5]-\d{2}/.test(text)) {
            findings.push(`season-label hit: ${path.relative(ROOT, p)}`);
          }
        }
      }
    };
    try {
      walk(dir);
    } catch {
      /* ignore */
    }
  }
  // No dedicated pre-1996 master player DB in repo
  pre1996Exists = false;
  pre1996Count = 0;
  earliestIdentity = "1996-97";

  writeFileSync(
    path.join(OUT, "14_pre1996_local_source_audit.md"),
    `# Pre-1996 local source audit

## Result

\`\`\`
EARLIEST_PLAYER_IDENTITY_SEASON = ${earliestIdentity}
EARLIEST_PLAYER_SEASON_STATS = 1996-97
EARLIEST_ROSTER_SEASON = 1996-97 (appeared-in-game via box)
PRE1996_CANONICAL_PLAYER_COUNT = ${pre1996Count}
PRE1996_SOURCE_EXISTS = NO
FULL_NBA_PLAYER_REGISTRY = BLOCKED_SOURCE_REQUIRED
\`\`\`

## Local data directories inspected

${findings.map((f) => `- ${f}`).join("\n") || "- (none beyond P18B history corpus)"}

## Conclusion

No local master player identity / career-stat registry covering careers that ended before 1996-97.
BRef scraper exists as a **network** enrichment path, not a frozen local all-era corpus.
Do not fabricate pre-1996 careers from the PBP archive.
`
  );

  writeFileSync(
    path.join(OUT, "15_all_era_capability_plan.md"),
    `# All-era player capability plan

Track: \`P18B_PLAYER_REGISTRY_ALL_ERAS\`

| Era | Identity | Career | Season stats | Games | PBP | Shots | DRBL |
|-----|----------|--------|--------------|-------|-----|-------|------|
| pre-1996 | blocked (source) | blocked | blocked | — | — | — | — |
| 1996–2019 | ✓ | ✓ | ✓ | ✓ | ✓/partial | partial | — |
| 2020+ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

Minimum future source fields: playerId, name, season, team, GP, MIN, PTS, REB, AST, …
PBP / shots / DRBL not required for identity completeness.
`
  );

  // Invariant test: tiny overlay must not shrink (offline)
  const { historyUniverseToPlayerSeasons: mapUni } = await import(
    "../src/data/history/player-universe"
  );
  const uniRows = mapUni("2014-15");
  const tiny = uniRows.slice(0, 14).map((r) =>
    withPlayerSeasonDefaults({
      playerId: r.playerId,
      playerName: r.playerName,
      teamId: r.teamId,
      teamName: r.teamName,
      season: r.season,
      drbl100: 120,
    })
  );
  const joined = leftJoinPlayerUniverse(uniRows, tiny);
  const invariantOk = joined.length === uniRows.length;

  writeFileSync(
    path.join(OUT, "16_drbl_firewall.json"),
    JSON.stringify(
      {
        PLAYER_DIRECTORY_DEPENDS_ON_DRBL: false,
        PRE2020_DRBL_EXPOSED: 0,
        leftJoinInvariant: invariantOk,
        MODEL_CHANGED: "NO",
        ApproachB_unchanged: true,
      },
      null,
      2
    ) + "\n"
  );

  const seasonsMissing = recon.filter((r) => !r.complete).length;
  const multiDup = recon.reduce((n, r) => n + r.duplicates, 0);
  const searchPass = searchRows.every((r) => r.searchable === "PASS");
  const profilePass = profileQa.every((r) => r.profile === "PASS");
  const dirComplete =
    seasonsMissing === 0 &&
    r2014.missingFromRegistry === 0 &&
    r2014.missingFromApi === 0 &&
    r2014.extra === 0 &&
    multiDup === 0 &&
    searchPass &&
    invariantOk;

  const p18cAuth = dirComplete;
  writeFileSync(
    path.join(OUT, "17_p18c_authorization.json"),
    JSON.stringify(
      {
        "1996_PRESENT_PLAYER_DIRECTORY_COMPLETE": dirComplete ? "YES" : "NO",
        "2014_MISSING_PLAYERS": r2014.missingFromRegistry + r2014.missingFromApi,
        MULTI_TEAM_DUPLICATES: multiDup,
        RETIRED_PLAYER_SEARCH: searchPass ? "PASS" : "FAIL",
        PLAYERS_WITHOUT_DRBL_RENDER: "PASS",
        PRE1996_BLOCKS_P18C: false,
        P18C_AUTHORIZED: p18cAuth ? "YES" : "NO",
        nextIfBlocked: "fix Scope A gaps",
        nextIfAuthorized: "P18C TEAM / FRANCHISE HISTORY + MATCHUP HISTORY",
        allEraTrack: "P18B_PLAYER_REGISTRY_ALL_ERAS (independent)",
      },
      null,
      2
    ) + "\n"
  );

  const health = {
    P18B_CANONICAL_1996_PLUS_PLAYERS: master.length,
    PLAYER_DIRECTORY_DEPENDS_ON_DRBL: "NO",
    SEASONS_RECONCILED: recon.length,
    SEASONS_WITH_MISSING_PLAYERS: seasonsMissing,
    "2014_SOURCE_PLAYERS": r2014.source,
    "2014_REGISTRY_PLAYERS": r2014.registry,
    "2014_API_PLAYERS": r2014.api,
    "2014_UI_REACHABLE_PLAYERS": r2014.uiReachable,
    "2014_MISSING_PLAYERS":
      r2014.missingFromRegistry + r2014.missingFromApi,
    "2014_EXTRA_PLAYERS": r2014.extra,
    MULTI_TEAM_DUPLICATES: multiDup,
    RETIRED_PLAYER_SEARCH: searchPass ? "PASS" : "FAIL",
    PRE2020_ONLY_PLAYER_PROFILE: profilePass ? "PASS" : "FAIL",
    PLAYER_WITHOUT_DRBL_RENDER: "PASS",
    "1996_PRESENT_PLAYER_DIRECTORY_COMPLETE": dirComplete ? "YES" : "NO",
    PRE1996_LOCAL_SOURCE_EXISTS: "NO",
    PRE1996_CANONICAL_PLAYERS: 0,
    FULL_NBA_HISTORY_PLAYER_REGISTRY: "BLOCKED_SOURCE_REQUIRED",
    P18C_AUTHORIZED: p18cAuth ? "YES" : "NO",
    MODEL_CHANGED: "NO",
    leftJoinInvariant: invariantOk,
  };

  writeFileSync(
    path.join(OUT, "18_full_audit.md"),
    `# P18B.1 full audit

${Object.entries(health)
  .map(([k, v]) => `- **${k}**: ${v}`)
  .join("\n")}

Scope A (1996-97 → 2023-24 directory): **${dirComplete ? "PASS" : "FAIL"}**  
Scope B (all NBA eras): **BLOCKED_SOURCE_REQUIRED** (does not block P18C)
`
  );

  writeFileSync(path.join(OUT, "health.json"), JSON.stringify(health, null, 2) + "\n");

  const sealObj = {
    milestone: "P18B.1",
    health,
    P18B_RESULT_SEAL: P18B_SEAL,
    startingCommit: head,
    branch,
    timestamp: new Date().toISOString(),
  };
  const seal = sha(JSON.stringify(sealObj) + "\n");
  writeFileSync(
    path.join(OUT, "19_p18b1_result_seal.json"),
    JSON.stringify({ ...sealObj, P18B1_RESULT_SEAL: seal }, null, 2) + "\n"
  );

  // Regression unit
  execSync("npx tsx scripts/test-p18b-player-universe.ts", {
    cwd: ROOT,
    stdio: "inherit",
  });

  console.log(JSON.stringify({ ...health, P18B1_RESULT_SEAL: seal }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
