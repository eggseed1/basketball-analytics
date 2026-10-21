/**
 * Career table must not keep the real NBA year once Franchise Lab owns it.
 * Run: npx tsx scripts/test-gm-career-overlay.ts
 */
import assert from "node:assert/strict";

import {
  entrySeasonIsCurrentSaveYear,
  overlaySimCareerSeasons,
} from "../src/gm/lib/career-overlay";
import type { GmBoxScore, GmCountingLine, GmLeagueState, GmPlayer } from "../src/gm/types";

function line(partial: Partial<GmCountingLine> & Pick<GmCountingLine, "season" | "team">): GmCountingLine {
  return {
    gp: 0,
    min: 0,
    pts: 0,
    reb: 0,
    ast: 0,
    stl: 0,
    blk: 0,
    tov: 0,
    fgm: 0,
    fga: 0,
    tpm: 0,
    tpa: 0,
    ftm: 0,
    fta: 0,
    ...partial,
  };
}

function player(partial: Partial<GmPlayer> & Pick<GmPlayer, "id" | "name">): GmPlayer {
  return {
    position: "SF",
    age: 26,
    heightIn: 80,
    weightLb: 210,
    teamId: "bos",
    ratings: {
      impact: 4,
      offense: 4,
      defense: 2,
      potential: 5,
      shooting: 70,
      finishing: 70,
      playmaking: 60,
      rebounding: 55,
      durability: 70,
    },
    morale: 70,
    ...partial,
  } as GmPlayer;
}

function main() {
  const real2726 = {
    season: "2026-27",
    teamAbbreviation: "BOS",
    gamesPlayed: 16,
    minutes: 520,
    points: 348,
    rebounds: 120,
    assists: 80,
    fieldGoalsMade: 120,
    fieldGoalsAttempted: 280,
    threePointersMade: 40,
    threePointersAttempted: 120,
    freeThrowsMade: 68,
    freeThrowsAttempted: 80,
  };
  const real2526 = {
    season: "2025-26",
    teamAbbreviation: "BOS",
    gamesPlayed: 70,
    minutes: 2500,
    points: 1800,
    rebounds: 600,
    assists: 400,
    fieldGoalsMade: 600,
    fieldGoalsAttempted: 1300,
    threePointersMade: 200,
    threePointersAttempted: 550,
    freeThrowsMade: 400,
    freeThrowsAttempted: 480,
  };

  const box: GmBoxScore = {
    id: "box1",
    gameId: "g1",
    season: 2027,
    day: 10,
    homeTeamId: "bos",
    awayTeamId: "nyk",
    homeScore: 110,
    awayScore: 100,
    players: [
      {
        playerId: "tatum",
        playerName: "Jayson Tatum",
        teamId: "bos",
        minutes: 36,
        points: 28,
        assists: 5,
        rebounds: 8,
        steals: 1,
        blocks: 0,
        turnovers: 2,
        fgm: 10,
        fga: 20,
        tpm: 3,
        tpa: 8,
        ftm: 5,
        fta: 6,
        plusMinus: 12,
        trueShootingPct: 0.6,
        usagePct: 0.3,
        gameScore: 22,
      },
    ],
  };

  const tatum = player({
    id: "tatum",
    name: "Jayson Tatum",
    nbaPlayerId: "1628369",
    nbaSeason: line({
      season: "2026-27",
      team: "bos",
      gp: 16,
      pts: 348,
      min: 520,
      reb: 120,
      ast: 80,
      fgm: 120,
      fga: 280,
      tpm: 40,
      tpa: 120,
      ftm: 68,
      fta: 80,
    }),
    seasonLine: line({
      season: "2027",
      team: "bos",
      gp: 1,
      min: 36,
      pts: 28,
      reb: 8,
      ast: 5,
      fgm: 10,
      fga: 20,
      tpm: 3,
      tpa: 8,
      ftm: 5,
      fta: 6,
    }),
  });

  const league = {
    season: 2027,
    boxScores: [box],
    players: [tatum],
  } as unknown as GmLeagueState;

  assert.equal(entrySeasonIsCurrentSaveYear(tatum.nbaSeason, 2027), true);

  const merged = overlaySimCareerSeasons([real2726, real2526], league, tatum);
  assert.equal(merged[0]?.season, "2026-27");
  assert.equal(merged[0]?.fromSim, true);
  assert.equal(merged[0]?.gamesPlayed, 1);
  assert.equal(merged[0]?.points, 28);
  assert.ok(merged.some((row) => row.season === "2025-26" && !row.fromSim));
  assert.ok(!merged.some((row) => row.season === "2026-27" && !row.fromSim));

  // Before tip-off: strip real overlapping year even with no sim row yet.
  const coldPlayer = { ...tatum, seasonLine: undefined };
  const cold = overlaySimCareerSeasons(
    [real2726, real2526],
    { ...league, boxScores: [], players: [coldPlayer] } as GmLeagueState,
    coldPlayer
  );
  assert.ok(!cold.some((row) => row.season === "2026-27"));
  assert.ok(cold.some((row) => row.season === "2025-26"));

  console.log("career overlay ok");
}

main();
