/**
 * Deterministic box-score Level-2 context checks.
 * Run: npx tsx scripts/test-box-score-context.ts
 */
import assert from "node:assert/strict";

import {
  BOX_SCORE_MIN_SEASON_GAMES,
  BOX_SCORE_MIN_SELF_GAMES,
  buildBoxScoreGameContext,
  buildBoxScorePlayerContext,
  buildBoxScoreTeamContext,
  primaryBoxScoreLine,
} from "../src/analytics/box-score-context";
import type { PlayerGame, PlayerSeason } from "../src/data/types";
import type { TeamSeasonStats } from "../src/data/types/team-season";

function game(
  partial: Partial<PlayerGame> &
    Pick<PlayerGame, "playerId" | "points" | "minutes">
): PlayerGame {
  return {
    id: `${partial.playerId}-g`,
    gameId: "g1",
    playerName: partial.playerName ?? partial.playerId,
    teamId: partial.teamId ?? "bos",
    season: partial.season ?? "2024-25",
    gameDate: "2025-01-15",
    opponentTeamId: "atl",
    isHome: true,
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

function season(
  partial: Partial<PlayerSeason> &
    Pick<PlayerSeason, "playerId" | "gamesPlayed" | "points">
): PlayerSeason {
  return {
    playerName: partial.playerName ?? partial.playerId,
    teamId: "bos",
    teamName: "Boston",
    season: partial.season ?? "2024-25",
    minutes: (partial.gamesPlayed ?? 20) * 32,
    assists: (partial.gamesPlayed ?? 20) * 5,
    rebounds: (partial.gamesPlayed ?? 20) * 6,
    steals: 0,
    blocks: 0,
    turnovers: 0,
    fieldGoalPct: 0.45,
    threePointPct: 0.35,
    freeThrowPct: 0.8,
    trueShootingPct: 0.58,
    effectiveFieldGoalPct: 0.52,
    usagePct: 0.28,
    offensiveRating: 115,
    defensiveRating: 110,
    netRating: 5,
    ...partial,
  };
}

function teamSeason(
  partial: Partial<TeamSeasonStats> & Pick<TeamSeasonStats, "teamId" | "ppg">
): TeamSeasonStats {
  return {
    season: "2024-25",
    abbreviation: "BOS",
    fullName: "Boston Celtics",
    conference: "East",
    gamesPlayed: 50,
    oppPpg: 110,
    avgDiff: 5,
    rpg: 44,
    apg: 25,
    spg: 7,
    bpg: 5,
    topg: 12,
    fieldGoalPct: 0.47,
    threePointPct: 0.37,
    freeThrowPct: 0.8,
    effectiveFieldGoalPct: 0.54,
    trueShootingPct: 0.58,
    assistToTurnover: 2,
    offensiveReboundPct: 0.25,
    points: 5600,
    fieldGoalsMade: 2000,
    fieldGoalsAttempted: 4200,
    threePointersMade: 700,
    threePointersAttempted: 1900,
    freeThrowsMade: 900,
    freeThrowsAttempted: 1100,
    assists: 1250,
    turnovers: 600,
    ...partial,
  };
}

// --- Above-average scoring night ---
{
  const player = game({
    playerId: "p1",
    points: 28,
    assists: 8,
    rebounds: 6,
    minutes: 36,
  });
  const peers = [
    player,
    game({ playerId: "p2", points: 12, minutes: 28 }),
    game({ playerId: "p3", points: 10, minutes: 24 }),
    game({ playerId: "p4", points: 8, minutes: 20 }),
    game({ playerId: "p5", points: 6, minutes: 18 }),
  ];
  const row = season({
    playerId: "p1",
    gamesPlayed: 40,
    points: 40 * 22,
  });
  const ctx = buildBoxScorePlayerContext({
    player,
    gamePlayers: peers,
    seasonRow: row,
  });
  const pts = primaryBoxScoreLine(ctx);
  assert.ok(pts);
  assert.equal(pts!.id, "points");
  assert.ok(pts!.vsSeason != null && pts!.vsSeason > 0);
  assert.equal(pts!.inGameRank, 1);
  assert.ok(pts!.seasonAvg != null && Math.abs(pts!.seasonAvg - 22) < 1e-6);
}

// --- Below-average night ---
{
  const player = game({ playerId: "p1", points: 10, minutes: 30 });
  const peers = Array.from({ length: 6 }, (_, i) =>
    game({ playerId: `x${i}`, points: 8 + i, minutes: 20 })
  );
  peers.push(player);
  const row = season({ playerId: "p1", gamesPlayed: 40, points: 40 * 22 });
  const ctx = buildBoxScorePlayerContext({
    player,
    gamePlayers: peers,
    seasonRow: row,
  });
  const pts = ctx.lines.find((l) => l.id === "points");
  assert.ok(pts?.vsSeason != null && pts.vsSeason < 0);
}

// --- Insufficient season games → no vs-average ---
{
  const player = game({ playerId: "p1", points: 28, minutes: 30 });
  const row = season({
    playerId: "p1",
    gamesPlayed: BOX_SCORE_MIN_SEASON_GAMES - 1,
    points: 80,
  });
  const ctx = buildBoxScorePlayerContext({
    player,
    gamePlayers: [player, ...Array.from({ length: 5 }, (_, i) =>
      game({ playerId: `p${i + 2}`, points: 10, minutes: 20 })
    )],
    seasonRow: row,
  });
  const pts = ctx.lines.find((l) => l.id === "points");
  assert.equal(pts?.seasonAvg, undefined);
  assert.equal(pts?.vsSeason, undefined);
}

// --- Missing season row ---
{
  const player = game({ playerId: "p1", points: 20, minutes: 30 });
  const ctx = buildBoxScorePlayerContext({
    player,
    gamePlayers: Array.from({ length: 6 }, (_, i) =>
      game({ playerId: `p${i}`, points: 10 + i, minutes: 20 })
    ),
    seasonRow: null,
  });
  const pts = ctx.lines.find((l) => l.id === "points");
  assert.equal(pts?.vsSeason, undefined);
}

// --- Season mismatch ignored ---
{
  const player = game({
    playerId: "p1",
    points: 30,
    minutes: 30,
    season: "2024-25",
  });
  const row = season({
    playerId: "p1",
    season: "2023-24",
    gamesPlayed: 40,
    points: 40 * 10,
  });
  const ctx = buildBoxScorePlayerContext({
    player,
    gamePlayers: Array.from({ length: 6 }, (_, i) =>
      game({ playerId: `p${i}`, points: 10, minutes: 20, season: "2024-25" })
    ),
    seasonRow: row,
  });
  assert.equal(ctx.lines.find((l) => l.id === "points")?.vsSeason, undefined);
}

// --- Self game percentile when log pool is large enough ---
{
  const player = game({ playerId: "p1", points: 35, minutes: 34 });
  const log: PlayerGame[] = [];
  for (let i = 0; i < BOX_SCORE_MIN_SELF_GAMES + 2; i++) {
    log.push(
      game({
        playerId: "p1",
        points: 15 + (i % 5),
        minutes: 30,
        gameId: `log-${i}`,
      })
    );
  }
  log.push(player);
  const ctx = buildBoxScorePlayerContext({
    player,
    gamePlayers: Array.from({ length: 6 }, (_, i) =>
      game({ playerId: `t${i}`, points: 10, minutes: 20 })
    ).concat([player]),
    seasonRow: season({ playerId: "p1", gamesPlayed: 40, points: 40 * 20 }),
    playerGameLog: log,
  });
  const pts = ctx.lines.find((l) => l.id === "points");
  assert.ok(pts?.playerGamePercentile != null);
  assert.ok(pts!.playerGamePercentile! >= 80);
}

// --- Self percentile omitted when sample too small ---
{
  const player = game({ playerId: "p1", points: 30, minutes: 30 });
  const log = [
    game({ playerId: "p1", points: 20, minutes: 30, gameId: "a" }),
    game({ playerId: "p1", points: 18, minutes: 30, gameId: "b" }),
  ];
  const ctx = buildBoxScorePlayerContext({
    player,
    gamePlayers: Array.from({ length: 6 }, (_, i) =>
      game({ playerId: `t${i}`, points: 10, minutes: 20 })
    ).concat([player]),
    playerGameLog: log,
  });
  assert.equal(
    ctx.lines.find((l) => l.id === "points")?.playerGamePercentile,
    undefined
  );
}

// --- Zero / DNP minutes excluded from in-game pool ---
{
  const star = game({ playerId: "star", points: 40, minutes: 38 });
  const dnp = game({ playerId: "dnp", points: 0, minutes: 0 });
  const others = Array.from({ length: 5 }, (_, i) =>
    game({ playerId: `o${i}`, points: 8, minutes: 15 })
  );
  const ctx = buildBoxScorePlayerContext({
    player: star,
    gamePlayers: [star, dnp, ...others],
  });
  const pts = ctx.lines.find((l) => l.id === "points");
  assert.equal(pts?.inGamePoolSize, 6); // star + 5 others, not DNP
}

// --- Team scoring context ---
{
  const team = buildBoxScoreTeamContext({
    teamId: "bos",
    season: "2024-25",
    points: 128,
    seasonTeam: teamSeason({ teamId: "bos", ppg: 118 }),
  });
  assert.ok(team.vsSeason != null && team.vsSeason > 0);
  assert.equal(team.seasonPpg, 118);
}

// --- Team season mismatch ---
{
  const team = buildBoxScoreTeamContext({
    teamId: "bos",
    season: "2024-25",
    points: 110,
    seasonTeam: teamSeason({
      teamId: "bos",
      season: "2023-24",
      ppg: 100,
    }),
  });
  assert.equal(team.vsSeason, undefined);
}

// --- Game index serialization shape ---
{
  const players = Array.from({ length: 6 }, (_, i) =>
    game({
      playerId: `p${i}`,
      points: 10 + i,
      minutes: 20,
      teamId: i < 3 ? "bos" : "atl",
    })
  );
  const index = buildBoxScoreGameContext({
    gameId: "g1",
    season: "2024-25",
    players,
    seasonByPlayerId: new Map([
      [
        "p5",
        season({ playerId: "p5", gamesPlayed: 40, points: 40 * 12 }),
      ],
    ]),
    homeTeamId: "bos",
    awayTeamId: "atl",
    homeScore: 110,
    awayScore: 105,
  });
  assert.ok(index.byPlayerId.p5);
  assert.ok(
    index.byPlayerId.p5!.lines.find((l) => l.id === "points")?.vsSeason != null
  );
  assert.equal(index.teams.length, 2);
  // Plain object - JSON round-trip safe
  const json = JSON.parse(JSON.stringify(index));
  assert.ok(json.byPlayerId.p5);
}

console.log("box-score-context checks passed");
