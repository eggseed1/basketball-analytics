/**
 * Explore Players board window contract — sort/filter/page without full payload.
 * Also guards DRtg/NET missing≠zero (ESPN boards omit individual DRtg).
 * Run: npx tsx scripts/test-explore-players-board.ts
 */
import assert from "node:assert/strict";

import {
  EXPLORE_PLAYERS_PAGE_SIZE,
  parseExplorePlayersPage,
  parseExplorePlayersSortDir,
  sortExplorePlayerRows,
  toExplorePlayerBoardRow,
  type ExplorePlayerBoardRow,
} from "../src/data/queries/explore-players-board";
import {
  buildLeaderboardContextIndex,
  buildLeaderboardRowContext,
  leaderboardContextIndexFromPools,
} from "../src/analytics/leaderboard-context";
import { transformEspnPlayerSeason } from "../src/data/transformers/espn";
import type { PlayerSeason } from "../src/data/types";
import {
  filterPlayerBoardViewColumns,
  PLAYER_BOARD_CATEGORY_VIEWS,
  PLAYER_BOARD_VIEW_COLUMNS,
} from "../src/lib/explore-players-display";
import { boardStatValue, formatBoardStat } from "../src/lib/player-board-stats";
import {
  SHEET_STAT_CATEGORY_ORDER,
  SHEET_STAT_DEFS,
  sheetStatIdFor,
} from "../src/lib/player-stat-sheet-registry";
import { normalizeTeamParam } from "../src/lib/team-identity";

function fakeSeason(
  id: string,
  opts: Partial<PlayerSeason> & { teamId: string; points: number }
): PlayerSeason {
  return {
    playerId: id,
    playerName: `Player ${id}`,
    teamId: opts.teamId,
    teamName: opts.teamName ?? `Team ${opts.teamId}`,
    season: "2025-26",
    position: opts.position ?? "PG",
    gamesPlayed: opts.gamesPlayed ?? 50,
    minutes: opts.minutes ?? 1500,
    points: opts.points,
    assists: opts.assists ?? 100,
    rebounds: opts.rebounds ?? 200,
    steals: opts.steals ?? 40,
    blocks: opts.blocks ?? 20,
    turnovers: opts.turnovers ?? 50,
    fieldGoalPct: 0.45,
    threePointPct: 0.35,
    freeThrowPct: 0.8,
    trueShootingPct: 0.55,
    effectiveFieldGoalPct: 0.5,
    usagePct: 0.2,
    offensiveRating: opts.offensiveRating,
    defensiveRating: opts.defensiveRating,
    netRating: opts.netRating,
    darkoDpm: opts.darkoDpm,
  };
}

function main() {
  assert.equal(EXPLORE_PLAYERS_PAGE_SIZE, 25);
  assert.equal(parseExplorePlayersPage(undefined), 1);
  assert.equal(parseExplorePlayersPage("3"), 3);
  assert.equal(parseExplorePlayersPage("0"), 1);
  assert.equal(parseExplorePlayersSortDir("asc", "ppg"), "asc");
  assert.equal(parseExplorePlayersSortDir(undefined, "ppg"), "desc");
  assert.equal(parseExplorePlayersSortDir(undefined, "tov"), "asc");

  const board: PlayerSeason[] = [
    fakeSeason("a", {
      teamId: "2",
      points: 1000,
      darkoDpm: 1.2,
      offensiveRating: 110,
      defensiveRating: 108,
      netRating: 2,
    }),
    fakeSeason("b", {
      teamId: "2",
      points: 500,
      darkoDpm: 2.5,
      offensiveRating: 112,
      defensiveRating: 109,
      netRating: 3,
    }),
    fakeSeason("c", {
      teamId: "25",
      points: 800,
      darkoDpm: 0.5,
      offensiveRating: 108,
      defensiveRating: 111,
      netRating: -3,
    }),
    fakeSeason("d", {
      teamId: "25",
      points: 1200,
      darkoDpm: 3.1,
      offensiveRating: 115,
      defensiveRating: 105,
      netRating: 10,
    }),
    fakeSeason("e", {
      teamId: "2",
      points: 600,
      darkoDpm: 1.0,
      offensiveRating: 111,
      defensiveRating: 110,
      netRating: 1,
    }),
    fakeSeason("f", {
      teamId: "25",
      points: 700,
      darkoDpm: 1.5,
      offensiveRating: 109,
      defensiveRating: 112,
      netRating: -3,
    }),
  ];

  const slim = board.map(toExplorePlayerBoardRow);
  assert.equal("winsAdded" in slim[0]!, false);
  // Per-game rates are derived at read time, not stored on the row.
  assert.equal("ppg" in slim[0]!, false);
  assert.ok((boardStatValue(slim[0]!, "ppg", "perGame") ?? 0) > 0);
  assert.equal(slim[0]!.defensiveRating, 108);
  assert.equal(slim[0]!.offensiveRating, 110);
  assert.equal(slim[0]!.netRating, 2);

  const byPpg = sortExplorePlayerRows(slim, "ppg", "desc");
  assert.equal(byPpg[0]!.playerId, "d");
  assert.equal(byPpg[1]!.playerId, "a");

  const byDarko = sortExplorePlayerRows(slim, "darkoDpm", "desc");
  assert.equal(byDarko[0]!.playerId, "d");
  assert.equal(byDarko[1]!.playerId, "b");

  const byDrtgAsc = sortExplorePlayerRows(slim, "defensiveRating", "asc");
  assert.equal(byDrtgAsc[0]!.playerId, "d");
  assert.equal(byDrtgAsc[0]!.defensiveRating, 105);
  const byDrtgDesc = sortExplorePlayerRows(slim, "defensiveRating", "desc");
  assert.equal(byDrtgDesc[0]!.defensiveRating, 112);

  const byNetDesc = sortExplorePlayerRows(slim, "netRating", "desc");
  assert.equal(byNetDesc[0]!.playerId, "d");
  assert.equal(byNetDesc[0]!.netRating, 10);

  // Screenshot relationship: ORtg 113.4 / DRtg 110.0 / NET +3.4
  const jokicLike = fakeSeason("jokic", {
    teamId: "7",
    points: 1400,
    offensiveRating: 113.4,
    defensiveRating: 110.0,
    netRating: 3.4,
    darkoDpm: 4.2,
  });
  const jokicSlim = toExplorePlayerBoardRow(jokicLike);
  assert.equal(jokicSlim.offensiveRating, 113.4);
  assert.equal(jokicSlim.defensiveRating, 110.0);
  assert.equal(jokicSlim.netRating, 3.4);
  assert.notEqual(jokicSlim.defensiveRating, 0);

  const missingDrtg = fakeSeason("miss", {
    teamId: "2",
    points: 900,
    offensiveRating: 113.4,
  });
  const missSlim = toExplorePlayerBoardRow(missingDrtg);
  assert.equal(missSlim.defensiveRating, undefined);
  assert.equal(missSlim.netRating, undefined);
  assert.equal(missSlim.offensiveRating, 113.4);

  const mixed: ExplorePlayerBoardRow[] = [...slim, missSlim];
  const drtgAscMissingLast = sortExplorePlayerRows(
    mixed,
    "defensiveRating",
    "asc"
  );
  assert.equal(
    drtgAscMissingLast[drtgAscMissingLast.length - 1]!.playerId,
    "miss"
  );
  const drtgDescMissingLast = sortExplorePlayerRows(
    mixed,
    "defensiveRating",
    "desc"
  );
  assert.equal(
    drtgDescMissingLast[drtgDescMissingLast.length - 1]!.playerId,
    "miss"
  );

  const espnRow = transformEspnPlayerSeason(
    {
      athlete: {
        id: "203999",
        displayName: "Nikola Jokic",
        teamId: "7",
        position: { abbreviation: "C" },
      },
      categories: [
        {
          name: "general",
          totals: [
            "70",
            "2400",
            "1800",
            "500",
            "700",
            "50",
            "40",
            "200",
            "600",
            "1000",
            "80",
            "250",
            "300",
            "0.5",
            "0.4",
            "0.8",
          ],
        },
      ],
    } as never,
    "2025-26",
    new Map([
      [
        "7",
        {
          teamId: "7",
          abbreviation: "DEN",
          fullName: "Denver Nuggets",
          gamesPlayed: 70,
          fieldGoalsAttempted: 6000,
          freeThrowsAttempted: 2000,
          turnovers: 1000,
          points: 8000,
        },
      ],
    ]),
    [
      {
        name: "general",
        displayName: "General",
        names: [
          "gamesPlayed",
          "minutes",
          "points",
          "assists",
          "rebounds",
          "steals",
          "blocks",
          "turnovers",
          "fieldGoalsMade",
          "fieldGoalsAttempted",
          "threePointFieldGoalsMade",
          "freeThrowsAttempted",
          "freeThrowsMade",
          "fieldGoalPct",
          "threePointFieldGoalPct",
          "freeThrowPct",
        ],
      },
    ] as never
  );
  assert.equal(espnRow.defensiveRating, undefined);
  assert.equal(espnRow.netRating, undefined);
  assert.ok(
    espnRow.offensiveRating == null || espnRow.offensiveRating > 0,
    "ORtg when present is derived from counting stats"
  );
  const espnSlim = toExplorePlayerBoardRow(espnRow);
  assert.equal(espnSlim.defensiveRating, undefined);
  assert.equal(espnSlim.netRating, undefined);

  const pageSize = 2;
  const page1 = byPpg.slice(0, pageSize);
  assert.equal(page1.length, 2);
  assert.equal(page1[0]!.playerId, "d");
  assert.equal(page1[1]!.playerId, "a");
  const page2 = byPpg.slice(pageSize, pageSize * 2);
  assert.equal(page2.map((r) => r.playerId).join(","), "c,f");

  const bos = normalizeTeamParam("BOS");
  const id2 = normalizeTeamParam("2");
  assert.equal(bos?.canonicalTeamId, id2?.canonicalTeamId);
  assert.equal(bos?.canonicalTeamId, "2");

  const index = buildLeaderboardContextIndex(board, "ppg");
  const pools: Record<string, number[]> = {};
  for (const [k, v] of index.pools) pools[k] = v;
  const rehydrated = leaderboardContextIndexFromPools({
    sortKey: "ppg",
    sampleSize: board.length,
    pools,
  });
  assert.equal(rehydrated.sampleSize, 6);
  const ctx = buildLeaderboardRowContext(board[3]!, rehydrated);
  assert.ok(ctx);
  assert.equal(ctx!.playerId, "d");
  assert.ok(ctx!.primary.percentile >= 0);
  assert.ok(ctx!.playerHref.includes("season=2025-26"));

  const pageRow = page1[0] as ExplorePlayerBoardRow;
  const pageCtx = buildLeaderboardRowContext(
    pageRow as unknown as PlayerSeason,
    rehydrated
  );
  assert.ok(pageCtx);
  assert.equal(pageCtx!.primary.context.sampleSize, pools.pts?.length);

  const drtgIndex = buildLeaderboardContextIndex(board, "defensiveRating");
  const drtgCtx = buildLeaderboardRowContext(board[3]!, drtgIndex);
  assert.ok(drtgCtx);
  assert.equal(drtgCtx!.primary.id, "defense");

  // Every sheet stat sits on the board, in the same category as the sheet.
  for (const def of SHEET_STAT_DEFS) {
    const owner = PLAYER_BOARD_CATEGORY_VIEWS.find((cat) =>
      PLAYER_BOARD_VIEW_COLUMNS[cat.id].some(
        (key) => sheetStatIdFor(key) === def.id
      )
    );
    assert.equal(owner?.id, def.category, `${def.id} on the board`);
  }
  assert.deepEqual(
    PLAYER_BOARD_CATEGORY_VIEWS.map((cat) => cat.id),
    SHEET_STAT_CATEGORY_ORDER
  );
  assert.deepEqual(
    filterPlayerBoardViewColumns("advanced", new Set()).slice(-6),
    ["per", "ows", "winShares", "winSharesPer48", "obpm", "bpm"]
  );
  assert.equal(filterPlayerBoardViewColumns("profile", new Set())[0], "gamesPlayed");
  assert.ok(
    !filterPlayerBoardViewColumns("profile", new Set(["plusMinus"])).includes(
      "plusMinus"
    )
  );

  const bref = toExplorePlayerBoardRow({
    ...fakeSeason("ws", { teamId: "2", points: 900 }),
    fieldGoalsMade: 350,
    fieldGoalsAttempted: 700,
    threePointersMade: 100,
    threePointersAttempted: 280,
    freeThrowsMade: 100,
    personalFouls: 120,
    winShares: 7.4,
    winSharesPer48: 0.162,
    vorp: 2.9,
    per: 19.8,
    ows: 4.5,
    dws: 2.9,
    obpm: 2.1,
    dbpm: 0,
    stealPct: 0.018,
  });
  assert.equal(bref.winShares, 7.4);
  assert.equal(bref.vorp, 2.9);
  assert.equal(bref.dbpm, undefined, "exact 0 BRef box value is unpublished");
  assert.equal(boardStatValue(bref, "twoPointersMade", "totals"), 250);
  assert.equal(boardStatValue(bref, "twoPointersAttempted", "perGame"), 420 / 50);
  // 1500 minutes at 2025-26 league pace (99.9 possessions per 48).
  assert.equal(bref.possessions, (1500 * 99.9) / 48);
  assert.equal(
    boardStatValue(bref, "personalFouls", "per100"),
    (120 * 100) / bref.possessions!
  );
  const drblRow = toExplorePlayerBoardRow({
    ...fakeSeason("drbl", { teamId: "2", points: 900 }),
    drblPossessions: 6000,
  });
  assert.equal(drblRow.possessions, 3000, "DRBL counts both ends");
  const preTurnovers = toExplorePlayerBoardRow({
    ...fakeSeason("old", { teamId: "2", points: 900 }),
    season: "1965-66",
  });
  assert.equal(preTurnovers.possessions, undefined);
  assert.equal(boardStatValue(preTurnovers, "ppg", "per100"), null);
  assert.equal(boardStatValue(bref, "assistToTurnover", "totals"), 2);
  assert.equal(formatBoardStat("winSharesPer48", 0.162, "perGame"), "0.162");
  assert.equal(formatBoardStat("dbpm", null, "perGame"), "-");
  assert.equal(formatBoardStat("obpm", 2.1, "perGame"), "+2.1");

  // Sort follows the rate toggle: per game and totals can disagree.
  const iron = toExplorePlayerBoardRow(
    fakeSeason("iron", { teamId: "2", points: 1600, gamesPlayed: 82 })
  );
  const short = toExplorePlayerBoardRow(
    fakeSeason("short", { teamId: "2", points: 1000, gamesPlayed: 40 })
  );
  assert.equal(sortExplorePlayerRows([iron, short], "ppg", "desc", "perGame")[0]!.playerId, "short");
  assert.equal(sortExplorePlayerRows([iron, short], "ppg", "desc", "totals")[0]!.playerId, "iron");

  console.log("test-explore-players-board: ok");
}

main();
