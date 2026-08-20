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
  assert.equal(EXPLORE_PLAYERS_PAGE_SIZE, 50);
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
  assert.ok(slim[0]!.ppg > 0);
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

  console.log("test-explore-players-board: ok");
}

main();
