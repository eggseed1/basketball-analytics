/**
 * Scoreboard-only Game Lab shell.
 * Run: npm run test:game-shell
 */
import assert from "node:assert/strict";

import { analyzeGame } from "../src/analytics/game-lab";
import { parseSeasonEvidenceArrival } from "../src/analytics/game-season-context";
import { getLearnConcept } from "../src/content/learn/registry";
import { getGameAnalysis } from "../src/data/queries/game-lab";
import {
  getGameShell,
  looksLikeEspnEventId,
} from "../src/data/queries/games";
import type { Game, PlayerGame } from "../src/data/types";
import type { TeamSeasonStats } from "../src/data/types/team-season";
import { buildGameMatchupTheme } from "../src/lib/game-matchup-theme";

function scoreboardGame(partial: Partial<Game> = {}): Game {
  return {
    id: "15908541",
    season: "2024-25",
    gameDate: "2025-02-22",
    homeTeamId: "22",
    awayTeamId: "30",
    homeTeamAbbr: "POR",
    awayTeamAbbr: "CHA",
    homeTeamName: "Portland Trail Blazers",
    awayTeamName: "Charlotte Hornets",
    homeScore: 141,
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
    season: "2024-25",
    abbreviation:
      partial.abbreviation ?? (partial.teamId === "22" ? "POR" : "CHA"),
    fullName:
      partial.fullName ??
      (partial.teamId === "22"
        ? "Portland Trail Blazers"
        : "Charlotte Hornets"),
    conference: partial.conference ?? "West",
    gamesPlayed: 60,
    avgDiff: 8,
    rpg: 44,
    apg: 26,
    spg: 9,
    bpg: 6,
    topg: 12,
    fieldGoalPct: 0.48,
    threePointPct: 0.37,
    freeThrowPct: 0.82,
    effectiveFieldGoalPct: 0.55,
    trueShootingPct: 0.6,
    assistToTurnover: 2.1,
    offensiveReboundPct: 0.26,
    points: 7000,
    fieldGoalsMade: 2500,
    fieldGoalsAttempted: 5200,
    threePointersMade: 900,
    threePointersAttempted: 2400,
    freeThrowsMade: 1100,
    freeThrowsAttempted: 1350,
    assists: 1600,
    turnovers: 750,
    ...partial,
  };
}

function playerRow(
  partial: Partial<PlayerGame> &
    Pick<PlayerGame, "playerId" | "teamId" | "points">
): PlayerGame {
  const teamId = partial.teamId;
  return {
    minutes: 30,
    rebounds: 5,
    assists: 4,
    steals: 1,
    blocks: 0,
    turnovers: 2,
    fieldGoalsMade: 8,
    fieldGoalsAttempted: 14,
    threePointersMade: 2,
    threePointersAttempted: 5,
    freeThrowsMade: 2,
    freeThrowsAttempted: 2,
    offensiveRebounds: 1,
    defensiveRebounds: 4,
    personalFouls: 2,
    plusMinus: 10,
    playerName: "Player",
    ...partial,
    id: partial.id ?? `${partial.playerId}-row`,
    gameId: partial.gameId ?? "fixture-full",
    season: partial.season ?? "2024-25",
    gameDate: partial.gameDate ?? "2025-02-22",
    opponentTeamId: partial.opponentTeamId ?? (teamId === "22" ? "30" : "22"),
    isHome: partial.isHome ?? teamId === "22",
  };
}

console.log("id space helpers…");
assert.equal(looksLikeEspnEventId("401585741"), true);
assert.equal(looksLikeEspnEventId("15908541"), false);

console.log("scoreboard-only analyzeGame…");
const game = scoreboardGame();
const analysis = analyzeGame({
  game,
  players: [],
  homeLabel: "POR",
  awayLabel: "CHA",
  homeName: "Portland Trail Blazers",
  awayName: "Charlotte Hornets",
  homeSeason: teamSeason({
    teamId: "22",
    ppg: 112,
    oppPpg: 114,
    abbreviation: "POR",
  }),
  awaySeason: teamSeason({
    teamId: "30",
    ppg: 108,
    oppPpg: 112,
    abbreviation: "CHA",
    fullName: "Charlotte Hornets",
    conference: "East",
  }),
});

assert.equal(analysis.coverage.availability, "scoreboard");
assert.equal(analysis.coverage.hasBoxScore, false);
assert.equal(analysis.coverage.hasTeamTotals, false);
assert.equal(analysis.home, null);
assert.equal(analysis.away, null);
assert.equal(analysis.winningFactors.length, 0);
assert.equal(analysis.overallEdge, "unavailable");
assert.match(analysis.overallReason, /box-score data is not available/i);
assert.equal(analysis.playerHighlights.scoring.length, 0);
assert.equal(analysis.outcome.homeScore, 141);
assert.equal(analysis.outcome.awayScore, 88);

console.log("score context without fabricating rates…");
assert.equal(analysis.gameSeasonContext.availability, "ready");
assert.ok(analysis.gameSeasonContext.home?.available);
const porPts = analysis.gameSeasonContext.home!.metrics.find(
  (m) => m.id === "points"
)!;
assert.equal(porPts.gameValue, 141);
assert.ok(porPts.meaningful);
assert.ok(
  !analysis.gameSeasonContext.home!.metrics.some((m) => m.id === "efg"),
  "no fabricated eFG"
);

console.log("no season baseline → context unavailable…");
const noBaseline = analyzeGame({
  game,
  players: [],
  homeLabel: "POR",
  awayLabel: "CHA",
  homeName: "Portland Trail Blazers",
  awayName: "Charlotte Hornets",
});
assert.equal(noBaseline.gameSeasonContext.availability, "unavailable");

console.log("no linescore → flow unavailable…");
assert.equal(analysis.flow.available, false);

console.log("with linescore → flow available…");
const withFlow = analyzeGame({
  game: scoreboardGame({
    homePeriodScores: [30, 35, 40, 36],
    awayPeriodScores: [22, 20, 24, 22],
  }),
  players: [],
  homeLabel: "POR",
  awayLabel: "CHA",
  homeName: "Portland Trail Blazers",
  awayName: "Charlotte Hornets",
});
assert.equal(withFlow.flow.available, true);
assert.ok(withFlow.whatChanged.length >= 1);
assert.equal(withFlow.coverage.availability, "partial");

console.log("live scoreboard shell keeps status…");
const live = analyzeGame({
  game: scoreboardGame({
    status: "in_progress",
    homeScore: 40,
    awayScore: 35,
    period: 2,
    displayClock: "4:21",
  }),
  players: [],
  homeLabel: "POR",
  awayLabel: "CHA",
  homeName: "POR",
  awayName: "CHA",
});
assert.equal(live.status, "in_progress");
assert.equal(live.gameSeasonContext.availability, "hidden_live");

console.log("matchup theme without box rows…");
const theme = buildGameMatchupTheme("30", "22");
assert.equal(theme.awayBrand?.abbr, "CHA");
assert.equal(theme.homeBrand?.abbr, "POR");
assert.ok(theme.fullyResolved);

console.log("evidence arrival preserved…");
const arrival = parseSeasonEvidenceArrival({
  from: "evidence",
  evidence: "largest_win",
});
assert.equal(arrival?.label, "Largest win");

console.log("scheduled shell…");
const scheduled = analyzeGame({
  game: scoreboardGame({
    status: "scheduled",
    homeScore: 0,
    awayScore: 0,
    tipOffAt: "2025-02-22T01:00:00Z",
  }),
  players: [],
  homeLabel: "POR",
  awayLabel: "CHA",
  homeName: "POR",
  awayName: "CHA",
});
assert.equal(scheduled.status, "scheduled");
assert.equal(scheduled.coverage.availability, "scoreboard");

assert.ok(getLearnConcept("scoreboard_only"));

console.log("full-data path still marks full when box rows exist…");
const fullFixture = analyzeGame({
  game: scoreboardGame({
    id: "fixture-full",
    homePeriodScores: [30, 30, 30, 30],
    awayPeriodScores: [20, 20, 20, 20],
    homeScore: 120,
    awayScore: 80,
  }),
  players: [
    playerRow({
      playerId: "h1",
      teamId: "22",
      points: 40,
      fieldGoalsMade: 15,
      fieldGoalsAttempted: 25,
    }),
    playerRow({
      playerId: "h2",
      teamId: "22",
      points: 80,
      fieldGoalsMade: 30,
      fieldGoalsAttempted: 50,
    }),
    playerRow({
      playerId: "a1",
      teamId: "30",
      points: 40,
      fieldGoalsMade: 12,
      fieldGoalsAttempted: 40,
      turnovers: 8,
    }),
    playerRow({
      playerId: "a2",
      teamId: "30",
      points: 40,
      fieldGoalsMade: 12,
      fieldGoalsAttempted: 40,
      turnovers: 8,
    }),
  ],
  homeLabel: "POR",
  awayLabel: "CHA",
  homeName: "Portland Trail Blazers",
  awayName: "Charlotte Hornets",
});
assert.equal(fullFixture.coverage.availability, "full");
assert.equal(fullFixture.coverage.hasBoxScore, true);
assert.ok(fullFixture.winningFactors.length > 0);
assert.ok(fullFixture.playerHighlights.scoring.length > 0);

async function liveRegression() {
  console.log("live shell: 15908541 (Season Evidence id)…");
  const shell = await getGameShell("15908541");
  if (!shell) {
    console.log(
      "  (skip live shell - 15908541 unavailable in this environment)"
    );
    return;
  }
  assert.equal(shell.availability, "scoreboard");
  assert.equal(shell.hasBoxScore, false);
  assert.equal(shell.players.length, 0);
  assert.equal(shell.game.homeScore, 141);
  assert.equal(shell.game.awayScore, 88);
  assert.equal(shell.game.status, "final");
  // Abbrs are trustworthy; BDL numeric team ids collide with ESPN.
  assert.equal(shell.game.homeTeamAbbr, "POR");
  assert.equal(shell.game.awayTeamAbbr, "CHA");
  assert.equal(shell.game.homeTeamId, "22"); // canonical ESPN POR
  assert.equal(shell.game.teamIdProvider, "bdl");
  assert.equal(shell.game.homeProviderTeamId, "25");

  const payload = await getGameAnalysis("15908541");
  assert.ok(payload, "Game Lab must not 404 for known schedule game");
  assert.equal(payload!.availability, "scoreboard");
  assert.equal(payload!.players.length, 0);
  assert.equal(payload!.analysis.winningFactors.length, 0);
  assert.match(
    payload!.analysis.overallReason,
    /box-score data is not available/i
  );
  assert.equal(payload!.analysis.outcome.homeLabel, "POR");
  assert.equal(payload!.analysis.outcome.awayLabel, "CHA");
  assert.ok(
    payload!.analysis.gameSeasonContext.availability === "ready" ||
      payload!.analysis.gameSeasonContext.availability === "unavailable"
  );

  console.log("truly unknown game → null…");
  const missing = await getGameShell("not-a-real-game-id");
  assert.equal(missing, null);
  const missingAnalysis = await getGameAnalysis("not-a-real-game-id");
  assert.equal(missingAnalysis, null);

  console.log("OK - game-shell");
}

liveRegression().catch((err) => {
  console.error(err);
  process.exit(1);
});
