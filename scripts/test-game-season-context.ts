/**
 * Game Lab V1.1 — Game vs Season Context.
 * Run: npx tsx scripts/test-game-season-context.ts
 */
import assert from "node:assert/strict";

import {
  GAME_SEASON_CONTEXT_TOLERANCE,
  GAME_SEASON_CONTEXT_UNUSUAL_MULTIPLE,
  buildGameSeasonContext,
  parseSeasonEvidenceArrival,
  performanceFromBand,
  seasonEvidenceGameLabHref,
} from "../src/analytics/game-season-context";
import {
  analyzeGame,
  sumTeamTotals,
  type GameTeamTotals,
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
    season: "2023-24",
    gameDate: "2024-03-01",
    opponentTeamId: partial.teamId === "2" ? "9" : "2",
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
    season: "2023-24",
    gameDate: "2024-03-01",
    homeTeamId: "2",
    awayTeamId: "9",
    homeTeamAbbr: "BOS",
    awayTeamAbbr: "GSW",
    homeTeamName: "Boston Celtics",
    awayTeamName: "Golden State Warriors",
    homeScore: 140,
    awayScore: 88,
    gameType: "regular",
    status: "final",
    ...partial,
  };
}

function teamSeason(
  partial: Partial<TeamSeasonStats> &
    Pick<TeamSeasonStats, "teamId" | "ppg" | "oppPpg">
): TeamSeasonStats {
  return {
    season: "2023-24",
    abbreviation: partial.teamId === "2" ? "BOS" : "GSW",
    fullName:
      partial.teamId === "2" ? "Boston Celtics" : "Golden State Warriors",
    conference: "East",
    gamesPlayed: 70,
    avgDiff: 10,
    rpg: 44,
    apg: 26,
    spg: 7,
    bpg: 5,
    topg: 12,
    fieldGoalPct: 0.48,
    threePointPct: 0.38,
    freeThrowPct: 0.8,
    effectiveFieldGoalPct: 0.55,
    trueShootingPct: 0.6,
    assistToTurnover: 2,
    offensiveReboundPct: 0.25,
    points: 8000,
    fieldGoalsMade: 3000,
    fieldGoalsAttempted: 6200,
    threePointersMade: 1200,
    threePointersAttempted: 3200,
    freeThrowsMade: 1400,
    freeThrowsAttempted: 1750,
    assists: 1800,
    turnovers: 900,
    ...partial,
  };
}

function fatBox(): PlayerGame[] {
  // High-efficiency home blowout box so eFG/TS/REB/TOV exist.
  return [
    player({
      playerId: "tatum",
      playerName: "Jayson Tatum",
      teamId: "2",
      points: 32,
      fieldGoalsMade: 12,
      fieldGoalsAttempted: 18,
      threePointersMade: 4,
      threePointersAttempted: 8,
      freeThrowsMade: 4,
      freeThrowsAttempted: 4,
      rebounds: 10,
      assists: 6,
      turnovers: 1,
    }),
    player({
      playerId: "brown",
      playerName: "Jaylen Brown",
      teamId: "2",
      points: 28,
      fieldGoalsMade: 11,
      fieldGoalsAttempted: 16,
      threePointersMade: 3,
      threePointersAttempted: 6,
      freeThrowsMade: 3,
      freeThrowsAttempted: 4,
      rebounds: 8,
      assists: 4,
      turnovers: 2,
    }),
    player({
      playerId: "filler-h",
      teamId: "2",
      points: 80,
      fieldGoalsMade: 30,
      fieldGoalsAttempted: 40,
      threePointersMade: 10,
      threePointersAttempted: 18,
      freeThrowsMade: 10,
      freeThrowsAttempted: 12,
      rebounds: 30,
      assists: 20,
      turnovers: 5,
    }),
    player({
      playerId: "curry",
      playerName: "Stephen Curry",
      teamId: "9",
      points: 22,
      fieldGoalsMade: 8,
      fieldGoalsAttempted: 22,
      threePointersMade: 4,
      threePointersAttempted: 14,
      freeThrowsMade: 2,
      freeThrowsAttempted: 2,
      rebounds: 4,
      assists: 5,
      turnovers: 6,
    }),
    player({
      playerId: "filler-a",
      teamId: "9",
      points: 66,
      fieldGoalsMade: 24,
      fieldGoalsAttempted: 60,
      threePointersMade: 8,
      threePointersAttempted: 28,
      freeThrowsMade: 10,
      freeThrowsAttempted: 14,
      rebounds: 28,
      assists: 15,
      turnovers: 12,
    }),
  ];
}

console.log("direction rules…");
assert.equal(
  performanceFromBand("unusually_high", "higher_better"),
  "unusually_strong"
);
assert.equal(
  performanceFromBand("unusually_low", "lower_better"),
  "unusually_strong"
);
assert.equal(
  performanceFromBand("unusually_high", "lower_better"),
  "unusually_weak"
);
assert.equal(performanceFromBand("near_normal", "higher_better"), "near_normal");

console.log("blowout vs season baseline…");
const bos = teamSeason({
  teamId: "2",
  ppg: 120.5,
  oppPpg: 109.2,
  effectiveFieldGoalPct: 0.55,
  trueShootingPct: 0.6,
  topg: 12,
  rpg: 44,
  apg: 26,
});
const gsw = teamSeason({
  teamId: "9",
  ppg: 117,
  oppPpg: 115,
  abbreviation: "GSW",
  fullName: "Golden State Warriors",
  conference: "West",
  effectiveFieldGoalPct: 0.54,
  trueShootingPct: 0.59,
  topg: 13,
  rpg: 44,
  apg: 28,
});

const homeTotals = sumTeamTotals(
  fatBox(),
  "2",
  "home",
  "BOS"
) as GameTeamTotals;
const awayTotals = sumTeamTotals(
  fatBox(),
  "9",
  "away",
  "GSW"
) as GameTeamTotals;

const ctx = buildGameSeasonContext({
  game: baseGame(),
  homeLabel: "BOS",
  awayLabel: "GSW",
  homeName: "Boston Celtics",
  awayName: "Golden State Warriors",
  homeTotals,
  awayTotals,
  homeSeason: bos,
  awaySeason: gsw,
});

assert.equal(ctx.availability, "ready");
assert.ok(ctx.home?.available);
assert.ok(ctx.away?.available);

const bosPts = ctx.home!.metrics.find((m) => m.id === "points")!;
assert.equal(bosPts.gameValue, 140);
assert.ok(Math.abs(bosPts.delta - (140 - 120.5)) < 1e-9);
assert.equal(bosPts.direction, "higher_better");
assert.ok(bosPts.meaningful);
assert.ok(
  bosPts.performance === "unusually_strong" ||
    bosPts.performance === "above_normal"
);

const bosOpp = ctx.home!.metrics.find((m) => m.id === "opponent_points")!;
assert.equal(bosOpp.gameValue, 88);
assert.equal(bosOpp.direction, "lower_better");
// 88 − 109.2 = −21.2 → unusually low raw band → unusually_strong defense
assert.equal(bosOpp.performance, "unusually_strong");
assert.ok(bosOpp.meaningful);

console.log("tolerance / near-normal…");
const quiet = buildGameSeasonContext({
  game: baseGame({ homeScore: 122, awayScore: 110 }),
  homeLabel: "BOS",
  awayLabel: "GSW",
  homeName: "Boston",
  awayName: "Golden State",
  homeTotals: null,
  awayTotals: null,
  homeSeason: bos,
  awaySeason: gsw,
});
const quietPts = quiet.home!.metrics.find((m) => m.id === "points")!;
assert.ok(Math.abs(quietPts.delta) < GAME_SEASON_CONTEXT_TOLERANCE.points);
assert.equal(quietPts.band, "near_normal");
assert.equal(quietPts.meaningful, false);
assert.ok(
  quiet.findings.every((f) => f.metricId !== "points" || f.side !== "home")
);

console.log("lower-is-better: turnovers…");
const tovHome: GameTeamTotals = {
  ...homeTotals,
  turnovers: 6, // vs 12 topg → −6 → unusually strong ball security
};
const tovCtx = buildGameSeasonContext({
  game: baseGame(),
  homeLabel: "BOS",
  awayLabel: "GSW",
  homeName: "Boston",
  awayName: "Golden State",
  homeTotals: tovHome,
  awayTotals,
  homeSeason: bos,
  awaySeason: gsw,
});
const tov = tovCtx.home!.metrics.find((m) => m.id === "turnovers")!;
assert.ok(tov.delta < 0);
assert.equal(tov.performance, "unusually_strong");
assert.ok(
  tovCtx.findings.some((f) =>
    f.text.includes("turned the ball over well below")
  )
);

console.log("missing / wrong season / thin GP…");
const missing = buildGameSeasonContext({
  game: baseGame(),
  homeLabel: "BOS",
  awayLabel: "GSW",
  homeName: "Boston",
  awayName: "Golden State",
  homeTotals,
  awayTotals,
  homeSeason: null,
  awaySeason: null,
});
assert.equal(missing.home?.available, false);
assert.equal(missing.away?.available, false);
assert.equal(missing.availability, "unavailable");

const wrong = buildGameSeasonContext({
  game: baseGame(),
  homeLabel: "BOS",
  awayLabel: "GSW",
  homeName: "Boston",
  awayName: "Golden State",
  homeTotals,
  awayTotals,
  homeSeason: teamSeason({
    teamId: "2",
    ppg: 120,
    oppPpg: 110,
    season: "2022-23",
  }),
  awaySeason: gsw,
});
assert.equal(wrong.home?.available, false);
assert.ok(wrong.home?.unavailableReason?.includes("match"));

const thin = buildGameSeasonContext({
  game: baseGame(),
  homeLabel: "BOS",
  awayLabel: "GSW",
  homeName: "Boston",
  awayName: "Golden State",
  homeTotals,
  awayTotals,
  homeSeason: teamSeason({
    teamId: "2",
    ppg: 120,
    oppPpg: 110,
    gamesPlayed: 3,
  }),
  awaySeason: gsw,
});
assert.equal(thin.home?.available, false);

console.log("score-only minimal depth…");
const scoreOnly = buildGameSeasonContext({
  game: baseGame(),
  homeLabel: "BOS",
  awayLabel: "GSW",
  homeName: "Boston",
  awayName: "Golden State",
  homeTotals: null,
  awayTotals: null,
  homeSeason: bos,
  awaySeason: gsw,
});
assert.equal(scoreOnly.depth, "minimal");
assert.ok(scoreOnly.home!.metrics.every((m) =>
  m.id === "points" || m.id === "opponent_points"
));
assert.ok(!scoreOnly.home!.metrics.some((m) => m.id === "efg"));

console.log("live / incomplete hidden…");
const live = buildGameSeasonContext({
  game: baseGame({ status: "in_progress", homeScore: 40, awayScore: 30 }),
  homeLabel: "BOS",
  awayLabel: "GSW",
  homeName: "Boston",
  awayName: "Golden State",
  homeTotals,
  awayTotals,
  homeSeason: bos,
  awaySeason: gsw,
});
assert.equal(live.availability, "hidden_live");
assert.equal(live.findings.length, 0);
assert.equal(live.home, null);

const scheduled = buildGameSeasonContext({
  game: baseGame({ status: "scheduled", homeScore: 0, awayScore: 0 }),
  homeLabel: "BOS",
  awayLabel: "GSW",
  homeName: "Boston",
  awayName: "Golden State",
  homeTotals: null,
  awayTotals: null,
  homeSeason: bos,
  awaySeason: gsw,
});
assert.equal(scheduled.availability, "hidden_incomplete");

console.log("player context reuse via analyzeGame…");
const analysis = analyzeGame({
  game: baseGame(),
  players: fatBox(),
  homeLabel: "BOS",
  awayLabel: "GSW",
  homeName: "Boston Celtics",
  awayName: "Golden State Warriors",
  homeSeason: bos,
  awaySeason: gsw,
  seasonByPlayerId: new Map([
    [
      "tatum",
      {
        playerId: "tatum",
        playerName: "Jayson Tatum",
        teamId: "2",
        teamName: "Boston Celtics",
        season: "2023-24",
        gamesPlayed: 60,
        minutes: 2100,
        points: 1600,
        rebounds: 500,
        assists: 300,
        steals: 60,
        blocks: 40,
        turnovers: 150,
        fieldGoalPct: 0.46,
        threePointPct: 0.36,
        freeThrowPct: 0.83,
        trueShootingPct: 0.6,
        effectiveFieldGoalPct: 0.54,
        usagePct: 0.3,
        offensiveRating: 118,
        defensiveRating: 110,
        netRating: 8,
      },
    ],
  ]),
});
assert.ok(analysis.gameSeasonContext.availability === "ready");
assert.ok(analysis.boxScoreContext);
assert.ok(Array.isArray(analysis.playerHighlights.vsSeason));
assert.ok(analysis.boxScoreContext.byPlayerId["tatum"]);

console.log("arrival / Season Evidence linkage…");
assert.equal(
  seasonEvidenceGameLabHref("401585601", "largest_win"),
  "/games/401585601?from=evidence&evidence=largest_win"
);
assert.equal(
  seasonEvidenceGameLabHref("401585601"),
  "/games/401585601"
);
const arrival = parseSeasonEvidenceArrival({
  from: "evidence",
  evidence: "largest_win",
});
assert.deepEqual(arrival, {
  from: "evidence",
  evidenceId: "largest_win",
  label: "Largest win",
});
assert.equal(parseSeasonEvidenceArrival({ from: "x", evidence: "largest_win" }), null);

console.log("unusual multiple documented…");
assert.equal(GAME_SEASON_CONTEXT_UNUSUAL_MULTIPLE, 2);
assert.equal(GAME_SEASON_CONTEXT_TOLERANCE.points, 5);
assert.equal(GAME_SEASON_CONTEXT_TOLERANCE.shootingPct, 0.025);

console.log("no causal phrasing in findings…");
for (const f of ctx.findings) {
  assert.ok(!/because/i.test(f.text), f.text);
  assert.ok(!/won the game/i.test(f.text), f.text);
}

console.log("OK — game-season-context");
