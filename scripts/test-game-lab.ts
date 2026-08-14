/**
 * Deterministic Game Lab analyzer checks.
 * Run: npx tsx scripts/test-game-lab.ts
 */
import assert from "node:assert/strict";

import {
  GAME_LAB_TOLERANCE,
  analyzeGame,
  buildGameFlow,
  computeWinningFactors,
  sumTeamTotals,
} from "../src/analytics/game-lab";
import type { Game, PlayerGame } from "../src/data/types";
import type { TeamSeasonStats } from "../src/data/types/team-season";

function player(
  partial: Partial<PlayerGame> &
    Pick<PlayerGame, "playerId" | "teamId" | "points">
): PlayerGame {
  return {
    id: `${partial.playerId}-g`,
    gameId: "g1",
    playerName: partial.playerName ?? partial.playerId,
    season: "2024-25",
    gameDate: "2025-01-15",
    opponentTeamId: partial.teamId === "2" ? "1" : "2",
    isHome: partial.teamId === "2",
    minutes: 30,
    assists: 0,
    rebounds: 0,
    steals: 0,
    blocks: 0,
    turnovers: 0,
    fieldGoalsMade: 0,
    fieldGoalsAttempted: 0,
    threePointersMade: 0,
    threePointersAttempted: 0,
    freeThrowsMade: 0,
    freeThrowsAttempted: 0,
    plusMinus: 0,
    ...partial,
  };
}

function baseGame(partial: Partial<Game> = {}): Game {
  return {
    id: "g1",
    season: "2024-25",
    gameDate: "2025-01-15",
    homeTeamId: "2",
    awayTeamId: "1",
    homeTeamAbbr: "BOS",
    awayTeamAbbr: "NYK",
    homeTeamName: "Boston Celtics",
    awayTeamName: "New York Knicks",
    homeScore: 118,
    awayScore: 111,
    gameType: "regular",
    status: "final",
    ...partial,
  };
}

function teamSeason(
  partial: Partial<TeamSeasonStats> & Pick<TeamSeasonStats, "teamId" | "ppg">
): TeamSeasonStats {
  return {
    season: "2024-25",
    abbreviation: partial.teamId === "2" ? "BOS" : "NYK",
    fullName: partial.teamId === "2" ? "Boston Celtics" : "New York Knicks",
    conference: "East",
    gamesPlayed: 40,
    oppPpg: 110,
    avgDiff: 5,
    rpg: 44,
    apg: 25,
    spg: 7,
    bpg: 5,
    topg: 13,
    fieldGoalPct: 0.47,
    threePointPct: 0.36,
    freeThrowPct: 0.8,
    effectiveFieldGoalPct: 0.54,
    trueShootingPct: 0.58,
    assistToTurnover: 1.8,
    offensiveReboundPct: 0.26,
    points: 4500,
    fieldGoalsMade: 1600,
    fieldGoalsAttempted: 3400,
    threePointersMade: 500,
    threePointersAttempted: 1400,
    freeThrowsMade: 700,
    freeThrowsAttempted: 880,
    assists: 1000,
    turnovers: 520,
    ...partial,
  };
}

function assertJsonSafe(value: unknown) {
  const json = JSON.stringify(value);
  assert.ok(json);
  const parsed = JSON.parse(json);
  assert.equal(typeof parsed, "object");
}

// --- Team totals ---
{
  const players = [
    player({
      playerId: "a",
      teamId: "2",
      points: 30,
      fieldGoalsMade: 10,
      fieldGoalsAttempted: 20,
      threePointersMade: 4,
      threePointersAttempted: 10,
      freeThrowsMade: 6,
      freeThrowsAttempted: 6,
      rebounds: 8,
      offensiveRebounds: 3,
      turnovers: 2,
    }),
    player({
      playerId: "b",
      teamId: "2",
      points: 20,
      fieldGoalsMade: 8,
      fieldGoalsAttempted: 15,
      threePointersMade: 2,
      threePointersAttempted: 5,
      freeThrowsMade: 2,
      freeThrowsAttempted: 2,
      rebounds: 5,
      offensiveRebounds: 1,
      turnovers: 1,
    }),
    player({
      playerId: "c",
      teamId: "1",
      points: 25,
      fieldGoalsMade: 9,
      fieldGoalsAttempted: 22,
      threePointersMade: 3,
      threePointersAttempted: 12,
      rebounds: 6,
      turnovers: 5,
    }),
  ];
  const home = sumTeamTotals(players, "2", "home", "BOS");
  assert.ok(home);
  assert.equal(home.points, 50);
  assert.equal(home.offensiveRebounds, 4);
  assert.ok(home.effectiveFieldGoalPct != null);
  assert.ok(Math.abs(home.effectiveFieldGoalPct! - (18 + 0.5 * 6) / 35) < 1e-9);

  const noOreb = sumTeamTotals(
    [
      player({
        playerId: "x",
        teamId: "1",
        points: 10,
        fieldGoalsMade: 4,
        fieldGoalsAttempted: 10,
      }),
    ],
    "1",
    "away",
    "NYK"
  );
  assert.ok(noOreb);
  assert.equal(noOreb.offensiveRebounds, undefined);
}

// --- Winning factors + tolerances ---
{
  const home = sumTeamTotals(
    [
      player({
        playerId: "h1",
        teamId: "2",
        points: 110,
        fieldGoalsMade: 40,
        fieldGoalsAttempted: 80,
        threePointersMade: 12,
        threePointersAttempted: 30,
        freeThrowsMade: 18,
        freeThrowsAttempted: 20,
        rebounds: 48,
        offensiveRebounds: 14,
        turnovers: 10,
        assists: 28,
      }),
    ],
    "2",
    "home",
    "BOS"
  )!;
  const away = sumTeamTotals(
    [
      player({
        playerId: "a1",
        teamId: "1",
        points: 100,
        fieldGoalsMade: 35,
        fieldGoalsAttempted: 85,
        threePointersMade: 8,
        threePointersAttempted: 28,
        freeThrowsMade: 22,
        freeThrowsAttempted: 28,
        rebounds: 40,
        offensiveRebounds: 8,
        turnovers: 16,
        assists: 20,
      }),
    ],
    "1",
    "away",
    "NYK"
  )!;

  const factors = computeWinningFactors(home, away);
  assert.ok(factors.some((f) => f.id === "efg" && f.edge === "home"));
  assert.ok(factors.some((f) => f.id === "tov" && f.edge === "home"));
  assert.ok(factors.some((f) => f.id === "oreb" && f.edge === "home"));

  // Tiny eFG difference should not clear tolerance.
  const closeHome = { ...home, effectiveFieldGoalPct: 0.5, trueShootingPct: 0.55 };
  const closeAway = { ...away, effectiveFieldGoalPct: 0.501, trueShootingPct: 0.551 };
  const tiny = computeWinningFactors(closeHome, closeAway).filter(
    (f) => f.id === "efg" || f.id === "ts"
  );
  assert.equal(tiny.length, 0);
  assert.ok(GAME_LAB_TOLERANCE.shootingPct === 0.02);
}

// --- Even / no decisive factor ---
{
  const t = sumTeamTotals(
    [
      player({
        playerId: "h",
        teamId: "2",
        points: 100,
        fieldGoalsMade: 40,
        fieldGoalsAttempted: 90,
        threePointersMade: 10,
        threePointersAttempted: 30,
        freeThrowsMade: 10,
        freeThrowsAttempted: 12,
        rebounds: 40,
        offensiveRebounds: 10,
        turnovers: 12,
        assists: 22,
        steals: 7,
        blocks: 4,
      }),
    ],
    "2",
    "home",
    "BOS"
  )!;
  const mirror = { ...t, side: "away" as const, teamId: "1", label: "NYK" };
  const factors = computeWinningFactors(t, mirror);
  assert.equal(factors.length, 0);

  const result = analyzeGame({
    game: baseGame({ homeScore: 100, awayScore: 100 }),
    players: [
      player({
        playerId: "h",
        teamId: "2",
        points: 100,
        fieldGoalsMade: 40,
        fieldGoalsAttempted: 90,
        threePointersMade: 10,
        threePointersAttempted: 30,
        freeThrowsMade: 10,
        freeThrowsAttempted: 12,
        rebounds: 40,
        offensiveRebounds: 10,
        turnovers: 12,
      }),
      player({
        playerId: "a",
        teamId: "1",
        points: 100,
        fieldGoalsMade: 40,
        fieldGoalsAttempted: 90,
        threePointersMade: 10,
        threePointersAttempted: 30,
        freeThrowsMade: 10,
        freeThrowsAttempted: 12,
        rebounds: 40,
        offensiveRebounds: 10,
        turnovers: 12,
      }),
    ],
    homeLabel: "BOS",
    awayLabel: "NYK",
    homeName: "Boston",
    awayName: "New York",
  });
  assert.equal(result.overallEdge, "even");
  assert.equal(result.outcome.winner, "even");
  assertJsonSafe(result);
}

// --- Flow + what changed ---
{
  const flow = buildGameFlow(
    baseGame({
      homePeriodScores: [28, 30, 34, 26],
      awayPeriodScores: [30, 28, 19, 34],
    })
  );
  assert.equal(flow.available, true);
  assert.equal(flow.periods.length, 4);
  assert.ok(flow.biggestPeriodSwing?.periodLabel === "Q3");
  assert.equal(flow.biggestPeriodSwing?.edge, "home");
  assert.ok(flow.largestEndOfPeriodLead);

  const empty = buildGameFlow(baseGame());
  assert.equal(empty.available, false);
}

// --- Season matching / wrong season ignored ---
{
  const players = [
    player({
      playerId: "h",
      teamId: "2",
      points: 118,
      fieldGoalsMade: 45,
      fieldGoalsAttempted: 90,
      threePointersMade: 15,
      threePointersAttempted: 40,
      freeThrowsMade: 13,
      freeThrowsAttempted: 15,
      rebounds: 45,
      offensiveRebounds: 12,
      turnovers: 11,
    }),
    player({
      playerId: "a",
      teamId: "1",
      points: 111,
      fieldGoalsMade: 40,
      fieldGoalsAttempted: 92,
      threePointersMade: 12,
      threePointersAttempted: 38,
      freeThrowsMade: 19,
      freeThrowsAttempted: 24,
      rebounds: 42,
      offensiveRebounds: 9,
      turnovers: 15,
    }),
  ];

  const wrongSeason = analyzeGame({
    game: baseGame(),
    players,
    homeLabel: "BOS",
    awayLabel: "NYK",
    homeName: "Boston",
    awayName: "New York",
    homeSeason: teamSeason({ teamId: "2", ppg: 112, season: "2023-24" }),
    awaySeason: teamSeason({ teamId: "1", ppg: 110, season: "2023-24" }),
  });
  assert.equal(wrongSeason.teamContext.length, 0);
  assert.equal(wrongSeason.coverage.hasHomeSeasonContext, false);

  const rightSeason = analyzeGame({
    game: baseGame(),
    players,
    homeLabel: "BOS",
    awayLabel: "NYK",
    homeName: "Boston",
    awayName: "New York",
    homeSeason: teamSeason({
      teamId: "2",
      ppg: 112.7,
      effectiveFieldGoalPct: 0.538,
      trueShootingPct: 0.58,
      topg: 13,
      rpg: 44,
    }),
    awaySeason: teamSeason({
      teamId: "1",
      ppg: 110,
      effectiveFieldGoalPct: 0.52,
      trueShootingPct: 0.56,
      topg: 14,
      rpg: 43,
    }),
  });
  assert.ok(rightSeason.teamContext.some((m) => m.id === "home-points"));
  assert.ok(rightSeason.homeAdvantages.length >= 1);
  assert.equal(rightSeason.outcome.winner, "home");
  assert.ok(rightSeason.coverage.depth === "full");
  assert.equal(rightSeason.coverage.pbpAvailable, false);
  assertJsonSafe(rightSeason);
}

// --- Thin / minimal historical ---
{
  const thin = analyzeGame({
    game: baseGame({
      id: "hist",
      season: "1985-86",
      homeScore: 98,
      awayScore: 94,
      homePeriodScores: undefined,
      awayPeriodScores: undefined,
    }),
    players: [],
    homeLabel: "BOS",
    awayLabel: "LAL",
    homeName: "Boston",
    awayName: "LA Lakers",
  });
  assert.equal(thin.coverage.depth, "minimal");
  assert.equal(thin.winningFactors.length, 0);
  assert.equal(thin.flow.available, false);
  assert.ok(thin.coverage.notes.some((n) => /possession/i.test(n)));
  assertJsonSafe(thin);
}

// --- Blowout scoring edge ---
{
  const blowout = analyzeGame({
    game: baseGame({ homeScore: 130, awayScore: 95 }),
    players: [
      player({
        playerId: "h",
        teamId: "2",
        points: 130,
        fieldGoalsMade: 50,
        fieldGoalsAttempted: 90,
        threePointersMade: 20,
        threePointersAttempted: 45,
        freeThrowsMade: 10,
        freeThrowsAttempted: 12,
        rebounds: 50,
        offensiveRebounds: 15,
        turnovers: 8,
      }),
      player({
        playerId: "a",
        teamId: "1",
        points: 95,
        fieldGoalsMade: 35,
        fieldGoalsAttempted: 95,
        threePointersMade: 8,
        threePointersAttempted: 40,
        freeThrowsMade: 17,
        freeThrowsAttempted: 22,
        rebounds: 35,
        offensiveRebounds: 8,
        turnovers: 18,
      }),
    ],
    homeLabel: "BOS",
    awayLabel: "NYK",
    homeName: "Boston",
    awayName: "New York",
  });
  assert.equal(blowout.overallEdge, "home");
  assert.ok(blowout.homeAdvantages.length > blowout.awayAdvantages.length);
  assert.equal(blowout.playerHighlights.scoring[0]?.value, 130);
}

console.log("test-game-lab: all assertions passed");
