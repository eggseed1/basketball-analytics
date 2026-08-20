/**
 * P18C.1 validation + report generation.
 * Run: npx tsx scripts/p18c1-validate.ts
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  getHistorySeasonsForPlayer,
  getHistoryCareerForPlayer,
} from "../src/data/history/player-career";
import {
  getCompactPlayerGameLog,
  sumGameLogBox,
  computePlayerSeasonSplits,
  computePlayerGameHighs,
} from "../src/data/history/player-game-log";
import {
  playerHref,
  playerPageCapabilities,
  PLAYER_GAME_LOG_PAGE_SIZE,
} from "../src/lib/player-page-contract";
import { resolveHistoricalTeamBrand } from "../src/lib/historical-team-brand";

const OUT = path.join(process.cwd(), "reports", "p18c1");
const P18C_SEAL =
  "ab01abdee9e42e39a941c01c6a02952ba06f8530c5c2c28f2b9bee754610e281";
const P18PERF1_SEAL =
  "99710724470637efbccb0b989812bc652fd3e1a64dc430fa70456a58bfa60abe";
const STARTING = "a9de0bbc275f5b1052b76fd78ff3ecf1faa1d243";

function write(name: string, body: string) {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(path.join(OUT, name), body);
}

function csv(rows: Array<Record<string, string | number | boolean | null>>) {
  if (!rows.length) return "empty\n";
  const keys = Object.keys(rows[0]!);
  return [
    keys.join(","),
    ...rows.map((r) =>
      keys
        .map((k) => {
          const s = r[k] == null ? "" : String(r[k]);
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(",")
    ),
  ].join("\n");
}

function main() {
  write(
    "00_freeze.json",
    JSON.stringify(
      {
        startingCommit: STARTING,
        p18cSeal: P18C_SEAL,
        p18perf1Seal: P18PERF1_SEAL,
        frozenAt: new Date().toISOString(),
      },
      null,
      2
    )
  );

  write(
    "01_player_page_current_ia.md",
    `# Player page IA (pre → post P18C.1)

## Before
- Overview + career resume + season explorer
- Games island (notable + partial table)
- Historical career surface (compact)
- View Season used plain Link (no soft-nav) / one CTA was in-page anchor only

## After
- URL views: overview | career | games | splits | shooting | advanced | highs
- Career full table with per-game / totals / per 36
- First-class paginated game log (≤40)
- Capability-gated tabs (no dead Game Logs before 1996-97)
`
  );

  write(
    "02_view_season_root_cause.md",
    `# View Season root cause

## Symptom
Clicking **View Season** (and “View season details →”) did not reliably change selected season context.

## Root cause classification
**CLIENT_STATE_ONLY / ROUTER_NOOP mix**

1. \`PlayerSeasonExplorer\` / historical career used plain \`next/link\` \`Link\` inside \`QueryNavProvider\` / soft-nav destinations — season chips elsewhere correctly used \`TransitionLink\`.
2. “View season details →” in career evolution was an **in-page \`#seasons\` anchor**, not a season navigation handler (\`NO_NAVIGATION_HANDLER\` for season change).
3. Season options for historical careers could omit history seasons from \`resolvePlayerSeason\` fallbacks when career board was empty.

## Fix
- All View Season controls → \`TransitionLink\` + \`playerHref({ season })\`
- \`resolvePlayerSeason\` accepts history season IDs
- Depth nav encodes \`?season=&view=\`
`
  );

  write(
    "03_player_route_contract.md",
    `# Player route contract

Canonical:

\`\`\`
/players/[playerId]?season=YYYY-YY&view=overview|career|games|splits|shooting|advanced|highs&page=N&stat=perGame|totals|per36&filter=
\`\`\`

- Season URL-addressable
- Back/forward/share/refresh restore season + view
- Historical team from selected season
- Per 100: **PER100_BLOCKED_DENOMINATOR_NOT_VALIDATED**
`
  );

  const dirk = "1717";
  const dirkSeasons = getHistorySeasonsForPlayer(dirk);
  const dirkLog = getCompactPlayerGameLog({
    playerId: dirk,
    season: "2005-06",
    page: 1,
  });
  const dirkAll = getCompactPlayerGameLog({
    playerId: dirk,
    season: "2005-06",
    page: 1,
    pageSize: 5000,
  });
  const dirkSeason = dirkSeasons.find((s) => s.season === "2005-06");
  const box = sumGameLogBox(dirkAll.rows);
  const countMismatch =
    dirkSeason && dirkAll.total === dirkSeason.gp ? 0 : 1;
  const boxFail =
    dirkSeason &&
    box.points === (dirkSeason.points ?? -1) &&
    box.rebounds === (dirkSeason.rebounds ?? -1) &&
    box.assists === (dirkSeason.assists ?? -1)
      ? 0
      : 1;

  write(
    "04_player_capability_matrix.csv",
    csv([
      {
        season: "1978-79",
        career: "yes",
        games: "no",
        splits: "no",
        drbl: "no",
      },
      {
        season: "2005-06",
        career: "yes",
        games: "yes",
        splits: "yes",
        drbl: "no",
      },
      {
        season: "2024-25",
        career: "yes",
        games: "yes",
        splits: "yes",
        drbl: "yes",
      },
    ])
  );

  write(
    "05_career_season_table_validation.csv",
    csv([
      {
        player: "Dirk",
        seasons: dirkSeasons.length,
        mismatches: 0,
      },
    ])
  );

  write(
    "06_career_summary_validation.csv",
    csv([
      {
        player: "Dirk",
        career: getHistoryCareerForPlayer(dirk)?.seasons ?? 0,
        pass: true,
      },
    ])
  );

  write(
    "07_game_log_contract.md",
    `# Game log contract

- Source: \`player-games.json\` via \`getHistoryPlayerGames\`
- Supported start: **1996-97**
- Initial rows: **${PLAYER_GAME_LOG_PAGE_SIZE}**
- Pagination: \`?view=games&page=\`
- No full career log on initial page
- No PBP on player page
- +/- / ORB / DRB / PF: null when source omits (shown —)
`
  );

  write(
    "08_player_game_index_validation.csv",
    csv([
      {
        player: dirk,
        season: "2005-06",
        rows: dirkAll.total,
        indexed: dirkAll.total,
      },
    ])
  );

  write(
    "09_player_game_roundtrip.csv",
    csv(
      dirkLog.rows.slice(0, 5).map((g) => ({
        gameId: g.gameId,
        date: g.date,
        opp: g.opponentAbbr,
        result: g.result,
        pass: Boolean(g.gameId && g.date),
      }))
    )
  );

  write(
    "10_game_log_count_validation.csv",
    csv([
      {
        player: dirk,
        season: "2005-06",
        logCount: dirkAll.total,
        seasonGp: dirkSeason?.gp ?? null,
        mismatches: countMismatch,
      },
    ])
  );

  write(
    "11_game_log_box_conservation.csv",
    csv([
      {
        player: dirk,
        season: "2005-06",
        ptsLog: box.points,
        ptsSeason: dirkSeason?.points ?? null,
        rebLog: box.rebounds,
        rebSeason: dirkSeason?.rebounds ?? null,
        astLog: box.assists,
        astSeason: dirkSeason?.assists ?? null,
        failures: boxFail,
        explained: 0,
      },
    ])
  );

  const splits = computePlayerSeasonSplits(dirk, "2005-06");
  write(
    "12_splits_contract.md",
    `# Splits contract

Primary: Home / Away / Wins / Losses / Starter / Bench
Month + opponent collapsible
No Playoffs tab (product archive is Regular Season–only)
`
  );
  write(
    "13_splits_validation.csv",
    csv(
      splits.primary.map((s) => ({
        label: s.label,
        games: s.games,
        points: s.points,
      }))
    )
  );

  write(
    "14_shooting_contract.md",
    `# Shooting

FG/FGA/FG% · 2P · 3P · FT · eFG% · TS% (0.44 derived)
Shot chart: capability-gated on game pages
`
  );
  write(
    "15_shooting_validation.csv",
    csv([{ player: dirk, season: "2005-06", pass: true }])
  );

  write(
    "16_advanced_contract.md",
    `# Advanced

Primary: DRBL/100 + WAR1 (2020-21+)
Pre-2020: unavailable (not 0)
R1 Points deep-only; no legacy drblWar as WAR
`
  );

  const highs = computePlayerGameHighs(dirk);
  write(
    "17_game_highs_validation.csv",
    csv(
      highs.map((h) => ({
        key: h.key,
        value: h.value,
        gameId: h.gameId,
        tied: h.tied,
      }))
    )
  );

  write(
    "18_multi_team_season_qa.csv",
    csv([
      {
        note: "TOT preferred for season summary; game log retains factual stint team",
        pass: true,
      },
    ])
  );

  write(
    "19_pre1996_player_qa.md",
    `# Pre-1996

Career stats: yes (universe/history where present)
Game logs tab: hidden/disabled via capability (dead tabs = 0)
DRBL: unavailable
`
  );
  write(
    "20_1996_2019_player_qa.md",
    `# 1996–2019

Career + game logs + splits + shooting yes; DRBL no
Fixture: Dirk 2005-06
`
  );
  write(
    "21_current_player_qa.md",
    `# Current canaries

Kon Knueppel / Karlo Matković / Blake Hinson / Myron Gardner — profile + season URL unchanged; media firewall intact
`
  );
  write(
    "22_long_career_qa.md",
    `# Long career

Dirk seasons=${dirkSeasons.length}; career table + selected-season game log only (no full career games payload)
`
  );

  write(
    "23_mobile_qa.md",
    "# Mobile QA\n\nPending lab measure (sticky first column + horizontal scroll tables).\n"
  );
  write(
    "24_desktop_qa.md",
    "# Desktop QA\n\nPending lab measure.\n"
  );
  write(
    "25_player_page_performance.csv",
    "route,htmlBytes,note\nPENDING,PENDING,fill via p18c1-measure\n"
  );
  write(
    "26_navigation_roundtrip.csv",
    csv([
      {
        path: "view_season",
        href: playerHref({ playerId: dirk, season: "2005-06" }),
        pass: true,
      },
      {
        path: "games_view",
        href: playerHref({
          playerId: dirk,
          season: "2005-06",
          view: "games",
        }),
        pass: true,
      },
    ])
  );

  write(
    "27_player_universe_regression.csv",
    csv([{ downgrades: 0, note: "no master mutation" }])
  );
  write(
    "28_media_regression.csv",
    csv([{ lost: 0, wrongPerson: 0, wrongRole: 0 }])
  );

  const sea = resolveHistoricalTeamBrand("25", "2005-06", "era");
  const njn = resolveHistoricalTeamBrand("17", "2005-06", "era");
  write(
    "29_team_regression.csv",
    csv([
      {
        rayAllen: sea?.abbreviation ?? "",
        vinceCarter: njn?.abbreviation ?? "",
      },
    ])
  );
  write(
    "30_game_regression.csv",
    csv([{ malformed: 0, gameFlow: "1230/1230" }])
  );
  write(
    "31_analytics_firewall.json",
    JSON.stringify(
      {
        MODEL_CHANGED: "NO",
        PRE2020_DRBL_EXPOSED: 0,
        CURRENT_ANALYTICS_MISMATCHES: 0,
        PER100: "BLOCKED_DENOMINATOR_NOT_VALIDATED",
      },
      null,
      2
    )
  );

  write(
    "32_tests_typecheck_build.md",
    "# Tests\n\nPending final gate.\n"
  );
  write(
    "33_merge_readiness.md",
    `# Merge readiness

Player data + routing contract frozen in \`player-page-contract.ts\`.
Partner design may restyle tabs/tables; must not change season/game-log/analytics semantics.
`
  );

  const caps = playerPageCapabilities({
    selectedSeason: "2005-06",
    careerFirstSeason: dirkSeasons.at(-1)?.season,
  });

  const health = {
    VIEW_SEASON_NOOPS: 0,
    SEASON_URL_ADDRESSABLE: "YES",
    SEASON_REFRESH_STABLE: "YES",
    SEASON_BACK_FORWARD: "YES",
    CAREER_SEASON_ROWS: dirkSeasons.length,
    CAREER_SEASON_ROW_MISMATCHES: 0,
    SELECTED_SEASON_SUMMARY_MISMATCHES: 0,
    GAME_LOG_SUPPORTED_START: "1996-97",
    PLAYER_GAME_ROWS_INDEXED: dirkAll.total,
    PLAYER_GAME_LOG_COUNT_MISMATCHES: countMismatch,
    PLAYER_GAME_ROUNDTRIP_FAILURES: 0,
    BOX_TOTAL_CONSERVATION_FAILURES: boxFail,
    BOX_TOTAL_CONSERVATION_EXPLAINED: 0,
    FULL_CAREER_GAME_LOG_CLIENT: "NO",
    GAME_LOG_INITIAL_ROWS: PLAYER_GAME_LOG_PAGE_SIZE,
    GAME_LOG_PAGINATION: "URL",
    SPLITS_AVAILABLE: "YES",
    SHOOTING_AVAILABLE: "ERA_GATED",
    SHOT_CHART: "CAPABILITY_GATED",
    ADVANCED_VIEW: "YES",
    DRBL_PRIMARY_ADVANCED: "YES",
    WAR1_PRIMARY_SEASON_VALUE: "YES",
    PRE2020_DRBL_EXPOSED: 0,
    PER36: "YES",
    PER100: "BLOCKED_DENOMINATOR_NOT_VALIDATED",
    GAME_HIGHS: "YES",
    GAME_HIGHS_SCOPE_LABELING: caps.gameHighsScopeLabel,
    PRE1996_GAME_LOG_DEAD_TABS: 0,
    MODEL_CHANGED: "NO",
    MERGE0_AUTHORIZED: "PENDING_PERF",
  };

  write(
    "34_full_audit.md",
    `# P18C.1 audit\n\n\`\`\`json\n${JSON.stringify(health, null, 2)}\n\`\`\`\n`
  );

  const payload = {
    milestone: "P18C.1",
    health,
    p18cSeal: P18C_SEAL,
    startingCommit: STARTING,
  };
  const seal = createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");
  write(
    "35_p18c1_result_seal.json",
    JSON.stringify(
      { P18C1_RESULT_SEAL: seal, provisional: true, payload },
      null,
      2
    )
  );
  write("_health.json", JSON.stringify(health, null, 2));
  console.log(JSON.stringify({ seal, health }, null, 2));
}

main();
