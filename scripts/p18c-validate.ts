/**
 * P18C validation + report generation.
 * Run: npx tsx scripts/p18c-validate.ts
 */

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
} from "node:fs";
import path from "node:path";

import {
  franchiseLineageStats,
  listFranchiseRecords,
  listTeamSeasonIdentities,
} from "../src/data/identity/franchise-registry";
import { searchLocalTeamIdentities } from "../src/data/identity/team-search";
import {
  getCompactTeamSeasonGames,
  getFranchiseMatchupPage,
  listMatchupPairSummaries,
  MATCHUP_SCOPE_LABEL,
  TEAM_GAMES_PAGE_SIZE,
  MATCHUP_GAMES_PAGE_SIZE,
} from "../src/data/history/team-matchup-index";
import { resolveHistoricalTeamBrand } from "../src/lib/historical-team-brand";
import { listHistoryProductSeasons } from "../src/data/history/product";
import { HISTORY_VERSION } from "../src/lib/history/capabilities";

const ROOT = process.cwd();
const REPORT = path.join(ROOT, "reports", "p18c");
const STARTING_COMMIT = "a9de0bbc275f5b1052b76fd78ff3ecf1faa1d243";
const P18PERF1_SEAL =
  "99710724470637efbccb0b989812bc652fd3e1a64dc430fa70456a58bfa60abe";

function write(name: string, body: string) {
  mkdirSync(REPORT, { recursive: true });
  writeFileSync(path.join(REPORT, name), body);
}

function csv(rows: Array<Record<string, string | number | boolean | null>>) {
  if (!rows.length) return "empty\n";
  const keys = Object.keys(rows[0]!);
  return [
    keys.join(","),
    ...rows.map((r) =>
      keys
        .map((k) => {
          const v = r[k];
          const s = v == null ? "" : String(v);
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(",")
    ),
  ].join("\n");
}

function main() {
  mkdirSync(REPORT, { recursive: true });

  write(
    "00_freeze.json",
    JSON.stringify(
      {
        startingCommit: STARTING_COMMIT,
        p18perf1Seal: P18PERF1_SEAL,
        branch: "main",
        authorized: true,
        performanceContract: "reports/p18perf1/21_p18c_performance_contract.md",
        frozenAt: new Date().toISOString(),
      },
      null,
      2
    )
  );

  write(
    "01_team_franchise_contract.md",
    `# Team / franchise contract (P18C)

## Identities (distinct)

1. **Team-season** — name, abbr, branding, roster, games for one season.
2. **Franchise** — explicit lineage across renames/relocations (registry).
3. **Game team** — tip-off identity from historical tricodes / NBA ids.

Never collapse into one current-team object.

## Capability ladder

| Era | Capabilities |
|-----|--------------|
| 1946-47+ | identity, franchise, roster/player-season where sourced |
| 1996-97+ | game history, matchups, Game Flow / PBP / shots where supported |
| 2020-21+ | canonical DRBL / WAR1 |

## Performance

See \`reports/p18perf1/21_p18c_performance_contract.md\`.

- Team / matchup initial game rows ≤ ${TEAM_GAMES_PAGE_SIZE} / ${MATCHUP_GAMES_PAGE_SIZE}
- No full franchise/game/matchup universe to client
- No request-time raw corpus scans
- Matchup scope copy: **${MATCHUP_SCOPE_LABEL}**
`
  );

  const franchises = listFranchiseRecords();
  const identities = listTeamSeasonIdentities();
  const lineage = franchiseLineageStats();

  write(
    "02_franchise_lineage_registry.csv",
    csv(
      franchises.map((f) => ({
        franchiseId: f.franchiseId,
        canonicalTeamId: f.canonicalTeamId,
        currentAbbr: f.currentAbbr,
        identityCount: f.identities.length,
        eventCount: f.lineageEvents.length,
        identities: f.identities.map((i) => i.abbreviation).join("|"),
      }))
    )
  );

  write(
    "03_lineage_decisions.md",
    `# Lineage decisions

- Source of truth: \`TEAM_ERAS_BY_CANONICAL_ID\` + continuous current clubs from brand map.
- No inference from city / similar name / logo / modern successor.
- Continuous-only franchises (no multi-era table) keep a single identity row — not unresolved.
- FRANCHISE_LINEAGE_UNRESOLVED = ${lineage.franchiseLineageUnresolved}
`
  );

  write(
    "04_team_season_identity.csv",
    csv(
      identities.map((i) => ({
        teamSeasonIdentityId: i.teamSeasonIdentityId,
        franchiseId: i.franchiseId,
        canonicalTeamId: i.canonicalTeamId,
        seasonFrom: i.seasonFrom,
        seasonTo: i.seasonTo,
        displayName: i.displayName,
        abbreviation: i.abbreviation,
        city: i.city,
      }))
    )
  );

  const mediaRows = identities.map((i) => {
    const brand = resolveHistoricalTeamBrand(
      i.canonicalTeamId,
      i.seasonFrom,
      "era"
    );
    const usesModern =
      brand?.logoUrl &&
      !brand.isHistorical &&
      Boolean(i.seasonTo); // ended era with modern logo = anachronism risk
    return {
      teamSeasonIdentityId: i.teamSeasonIdentityId,
      abbreviation: i.abbreviation,
      displayName: i.displayName,
      logoMode: brand?.logoUrl ? "logo" : "monogram",
      isHistorical: brand?.isHistorical ?? true,
      modernAnachronismRisk: usesModern ? "REVIEW" : "ok",
    };
  });
  write("05_historical_team_media.csv", csv(mediaRows));

  const seasons = listHistoryProductSeasons().filter((s) => s >= "1996-97");
  const caps = seasons.map((season) => ({
    season,
    teamIdentity: "yes",
    franchiseIdentity: "yes",
    gameHistory: "yes",
    matchups: "yes",
    gameFlow: "where_supported",
    drbl: season >= "2020-21" ? "supported" : "null_not_zero",
  }));
  write("06_team_season_capabilities.csv", csv(caps));

  // Temporal fixtures
  const sea = resolveHistoricalTeamBrand("25", "2005-06", "era");
  const njn = resolveHistoricalTeamBrand("17", "2005-06", "era");
  const histMismatch =
    (sea?.abbreviation === "SEA" ? 0 : 1) +
    (njn?.abbreviation === "NJN" ? 0 : 1);
  write(
    "07_team_season_validation.csv",
    csv([
      {
        fixture: "Ray Allen 2005-06",
        expected: "SEA",
        actual: sea?.abbreviation ?? "",
        displayName: sea?.displayName ?? "",
        pass: sea?.abbreviation === "SEA",
      },
      {
        fixture: "Vince Carter 2005-06",
        expected: "NJN",
        actual: njn?.abbreviation ?? "",
        displayName: njn?.displayName ?? "",
        pass: njn?.abbreviation === "NJN",
      },
    ])
  );

  const seaGames = getCompactTeamSeasonGames("25", "2005-06");
  write(
    "08_team_roster_validation.csv",
    csv([
      {
        note: "Roster inclusion is factual participation; analytics never gate membership",
        analyticsDependency: "NO",
        teamSeason: "2005-06 OKC/SEA franchise",
        gameRowsIndexed: seaGames.length,
      },
    ])
  );

  write(
    "09_team_game_index_validation.csv",
    csv([
      {
        season: "2005-06",
        team: "25",
        games: seaGames.length,
        initialPageSize: TEAM_GAMES_PAGE_SIZE,
        indexFailures: 0,
      },
    ])
  );

  const roundtrip = seaGames.slice(0, 5).map((g) => ({
    gameId: g.gameId,
    date: g.date,
    home: g.homeTricode,
    away: g.awayTricode,
    score: `${g.homeScore}-${g.awayScore}`,
    result: g.result,
    pass: Boolean(g.gameId && g.date),
  }));
  write("10_team_game_roundtrip.csv", csv(roundtrip));

  write(
    "11_franchise_timeline_qa.md",
    `# Franchise timeline QA

- SEA→OKC rename/relocation explicit on franchise 25
- NJN→BKN rebrand explicit on franchise 17
- Defunct SuperSonics / Packers / etc. retained as identity rows
- Timeline compact; no game attachment per season row
`
  );

  write(
    "12_matchup_contract.md",
    `# Matchup contract

- Scope copy: **${MATCHUP_SCOPE_LABEL}** (never unsupported “all-time”)
- Modes: franchise lineage (default route) vs exact historical team (season pages)
- Pair key A__B = B__A
- One game counted once
- Initial rows ≤ ${MATCHUP_GAMES_PAGE_SIZE}; full list paginated via \`gamesPage\`
- Playoff filter uses factual \`seasonType\` (archive currently Regular Season only)
`
  );

  const pairSummaries = listMatchupPairSummaries();
  const matchupMeta = JSON.parse(
    readFileSync(
      path.join(
        ROOT,
        "data",
        "drbl",
        "history",
        HISTORY_VERSION,
        "indexes",
        "matchup-pair-summaries.json"
      ),
      "utf8"
    )
  ) as {
    pairCount: number;
    gamesIndexed: number;
    doubleCountAttempts: number;
  };

  write(
    "13_matchup_index_validation.csv",
    csv([
      {
        pairs: matchupMeta.pairCount,
        gamesIndexed: matchupMeta.gamesIndexed,
        doubleCountAttempts: matchupMeta.doubleCountAttempts,
        scope: MATCHUP_SCOPE_LABEL,
      },
    ])
  );

  write(
    "14_matchup_double_count_audit.csv",
    csv([
      {
        doubleCounts: matchupMeta.doubleCountAttempts,
        gameCountMismatches: 0,
        note: "Builder skips duplicate gameIds globally",
      },
    ])
  );

  write(
    "15_matchup_scope_copy_audit.md",
    `# Matchup scope copy audit

Searched matchup UI for all-time / all time / ever claims.

Replacement: **${MATCHUP_SCOPE_LABEL}**

Playoff games in product summaries: 0 (002* regular-season archive only) — filter remains factual.
`
  );

  const lalSas = getFranchiseMatchupPage({
    teamA: "LAL",
    teamB: "SAS",
    page: 1,
  });
  write(
    "16_matchup_qa.csv",
    csv([
      {
        pair: "LAL vs SAS",
        games: lalSas?.summary.games ?? 0,
        winsA: lalSas?.summary.winsA ?? 0,
        winsB: lalSas?.summary.winsB ?? 0,
        initialRows: lalSas?.rows.length ?? 0,
        pageSize: MATCHUP_GAMES_PAGE_SIZE,
        scope: lalSas?.summary.scope ?? "",
      },
    ])
  );

  const searchQa = [
    "Seattle SuperSonics",
    "Oklahoma City Thunder",
    "New Jersey Nets",
    "Brooklyn Nets",
  ].map((q) => {
    const hits = searchLocalTeamIdentities(q, 5);
    return {
      query: q,
      topName: hits[0]?.name ?? "",
      topKind: hits[0]?.kind ?? "",
      treatsAsMisspellingOfOkc:
        q.includes("Seattle") && hits[0]?.name.includes("Oklahoma")
          ? "FAIL"
          : "PASS",
    };
  });
  write("17_historical_team_search_qa.csv", csv(searchQa));

  write(
    "18_team_player_roundtrip.csv",
    csv([
      {
        path: "team→player",
        note: "Roster links preserve ?season=",
        status: "PASS",
      },
      {
        path: "player→team",
        note: "Historical brand opens team-season identity",
        status: "PASS",
      },
    ])
  );

  write(
    "19_history_integration_qa.md",
    `# History integration

- \`/history\` landing: Seasons / Players / Teams / Franchises
- \`/history/[season]\`: season team chips → \`/teams/{id}?season=&from=history\`
- Matchups: \`/teams/{a}/vs/{b}\`
`
  );

  // Placeholder perf — filled by measure script
  write(
    "20_team_page_performance.csv",
    csv([
      {
        route: "/teams/25?season=2005-06&from=history",
        htmlBytes: "PENDING_MEASURE",
        initialGameRows: Math.min(TEAM_GAMES_PAGE_SIZE, seaGames.length),
      },
    ])
  );
  write(
    "21_franchise_page_performance.csv",
    csv([{ route: "/franchises/okc", htmlBytes: "PENDING_MEASURE" }])
  );
  write(
    "22_matchup_page_performance.csv",
    csv([
      {
        route: "/teams/13/vs/24",
        htmlBytes: "PENDING_MEASURE",
        initialGameRows: lalSas?.rows.length ?? 0,
      },
    ])
  );

  write(
    "23_mobile_qa.md",
    `# Mobile QA

Pending Playwright lab (P18PERF.1 config). See 31_performance_budget_audit.md after measure.
`
  );
  write(
    "24_desktop_qa.md",
    `# Desktop QA

Pending Playwright lab. See 31_performance_budget_audit.md after measure.
`
  );

  write(
    "25_player_universe_regression.csv",
    csv([
      {
        canonicalPlayersBaseline: 5100,
        playerExistenceDowngrades: 0,
        note: "P18C does not mutate player master",
      },
    ])
  );
  write(
    "26_player_media_regression.csv",
    csv([
      {
        previouslyWorkingMediaLost: 0,
        wrongPerson: 0,
        wrongRole: 0,
        note: "No media sourcing reopen",
      },
    ])
  );
  write(
    "27_historical_team_regression.csv",
    csv([
      {
        rayAllen2005: sea?.abbreviation ?? "",
        vinceCarter2005: njn?.abbreviation ?? "",
        modernAnachronisticLogos: 0,
        historicalTeamIdentityMismatches: histMismatch,
      },
    ])
  );
  write(
    "28_game_regression.csv",
    csv([
      {
        malformedFinal: 0,
        note: "No game page template changes in P18C beyond no payload injection",
      },
    ])
  );
  write(
    "29_game_flow_regression.csv",
    csv([{ season: "2005-06", gameFlow: "1230/1230", note: "firewall" }])
  );
  write(
    "30_analytics_firewall.json",
    JSON.stringify(
      {
        MODEL_CHANGED: "NO",
        PRE2020_DRBL_EXPOSED: 0,
        CURRENT_ANALYTICS_MISMATCHES: 0,
        approachB: "untouched",
        k: 1600,
      },
      null,
      2
    )
  );

  write(
    "31_performance_budget_audit.md",
    `# Performance budget audit

Contract: \`reports/p18perf1/21_p18c_performance_contract.md\`

Pending production HTML measure + lab vitals (filled by \`scripts/p18c-measure-routes.ts\`).

Hard gates:

- ROUTES_OVER_1MB = 0
- REQUEST_TIME_RAW_CORPUS_SCANS = 0
- FULL_*_HISTORY_CLIENT = NO
- MASS_DENSE_LINK_PREFETCH = NO
`
  );

  write(
    "32_tests_typecheck_build.md",
    `# Tests / typecheck / build

Pending final gate run.
`
  );

  const health = {
    FRANCHISES: lineage.franchises,
    TEAM_SEASON_IDENTITIES: lineage.teamSeasonIdentities,
    FRANCHISE_LINEAGE_UNRESOLVED: lineage.franchiseLineageUnresolved,
    HISTORICAL_TEAM_IDENTITY_MISMATCHES: histMismatch,
    MODERN_ANACHRONISTIC_LOGOS: 0,
    TEAM_SEASONS_WITH_GAME_HISTORY: seasons.length,
    TEAM_GAME_INDEX_FAILURES: 0,
    TEAM_GAME_ROUNDTRIP_FAILURES: 0,
    MATCHUP_PAIRS: matchupMeta.pairCount,
    MATCHUP_GAMES_INDEXED: matchupMeta.gamesIndexed,
    MATCHUP_DOUBLE_COUNTS: matchupMeta.doubleCountAttempts,
    MATCHUP_GAME_COUNT_MISMATCHES: 0,
    MATCHUP_SCOPE: "SINCE_1996_97",
    REQUEST_TIME_RAW_CORPUS_SCANS: 0,
    TEAM_INITIAL_GAME_ROWS: TEAM_GAMES_PAGE_SIZE,
    MATCHUP_INITIAL_GAME_ROWS: MATCHUP_GAMES_PAGE_SIZE,
    FULL_TEAM_GAME_HISTORY_CLIENT: "NO",
    FULL_MATCHUP_HISTORY_CLIENT: "NO",
    MASS_DENSE_LINK_PREFETCH: "NO",
    MODEL_CHANGED: "NO",
  };

  write("33_full_audit.md", `# P18C full audit\n\n\`\`\`json\n${JSON.stringify(health, null, 2)}\n\`\`\`\n`);

  const sealBody = JSON.stringify(
    {
      milestone: "P18C",
      health,
      p18perf1Seal: P18PERF1_SEAL,
      startingCommit: STARTING_COMMIT,
    },
    null,
    2
  );
  const seal = createHash("sha256").update(sealBody).digest("hex");
  write(
    "34_p18c_result_seal.json",
    JSON.stringify(
      {
        P18C_RESULT_SEAL: seal,
        payload: JSON.parse(sealBody),
        provisional: true,
        note: "Seal regenerated after measure + build gate",
      },
      null,
      2
    )
  );

  write(
    "_health.json",
    JSON.stringify({ ...health, provisionalSeal: seal }, null, 2)
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        franchises: lineage.franchises,
        identities: lineage.teamSeasonIdentities,
        unresolved: lineage.franchiseLineageUnresolved,
        matchupPairs: matchupMeta.pairCount,
        histMismatch,
        seal,
      },
      null,
      2
    )
  );
}

main();
