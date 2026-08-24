import assert from "node:assert/strict";

import { mergePlayerSeasonRows } from "@/data/providers/nba/espn-stat-integrity";
import { MISSING_PLAYER_STAT, withPlayerSeasonDefaults } from "@/data/transformers/player-season-defaults";
import { toExplorePlayerBoardRow } from "@/data/queries/explore-players-board-pure";

const espn = withPlayerSeasonDefaults({
  playerId: "1628983",
  playerName: "Shai Gilgeous-Alexander",
  teamId: "25",
  teamName: "Oklahoma City Thunder",
  teamAbbreviation: "OKC",
  season: "2024-25",
  gamesPlayed: 76,
  minutes: 2600,
  points: 2485,
  rebounds: 450,
  assists: 486,
  steals: 131,
  blocks: 77,
  turnovers: 162,
  fieldGoalPct: 0.519,
  threePointPct: 0.375,
  freeThrowPct: 0.898,
  offensiveRebounds: MISSING_PLAYER_STAT,
  defensiveRebounds: MISSING_PLAYER_STAT,
});

const nba = withPlayerSeasonDefaults({
  playerId: "1628983",
  playerName: "Shai Gilgeous-Alexander",
  teamId: "25",
  teamName: "Oklahoma City Thunder",
  teamAbbreviation: "OKC",
  season: "2024-25",
  gamesPlayed: 76,
  minutes: 2600,
  points: 2485,
  rebounds: 450,
  assists: 486,
  steals: 131,
  blocks: 77,
  turnovers: 162,
  fieldGoalPct: 0.519,
  threePointPct: 0.375,
  freeThrowPct: 0.898,
  offensiveRebounds: 67,
  defensiveRebounds: 383,
  offensiveRating: 122.1,
  defensiveRating: 107.4,
  netRating: 14.7,
});

const merged = mergePlayerSeasonRows(espn, nba);
const board = toExplorePlayerBoardRow(merged);

assert.equal(board.offensiveRebounds, 67);
assert.equal(board.defensiveRebounds, 383);
assert.equal(board.defensiveRating, 107.4);
assert.equal(board.netRating, 14.7);

console.log("test-board-nba-overlay: ok");
