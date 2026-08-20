/**
 * P17.3 - player-season / multi-team / brand context unit tests.
 * Run: npx tsx scripts/test-player-team-context.ts
 */
import assert from "node:assert/strict";

import type { PlayerSeason } from "../src/data/types";
import { dedupeCareerSeasons } from "../src/analytics/career-resume";
import {
  brandableTeamKey,
  enrichCareerRowKeepTeam,
  isMultiTeamSeasonRow,
  multiTeamDisplayLabel,
  pickPlayerSeasonBoardRow,
  primaryTeamForSeason,
  resolveCurrentTeamId,
  resolveSelectedSeasonTeamContext,
  seasonHasMultipleFranchises,
  cardStintsForSeason,
  lastCardStint,
} from "../src/lib/player-team-context";
import { buildSeasonTeamsMap } from "../src/lib/player-destination";

function row(
  partial: Partial<PlayerSeason> &
    Pick<PlayerSeason, "playerId" | "teamId" | "season" | "gamesPlayed">
): PlayerSeason {
  return {
    playerId: partial.playerId,
    playerName: partial.playerName ?? "Test Player",
    teamId: partial.teamId,
    teamName: partial.teamName ?? partial.teamId,
    teamAbbreviation: partial.teamAbbreviation,
    season: partial.season,
    gamesPlayed: partial.gamesPlayed,
    gamesStarted: 0,
    minutes: partial.gamesPlayed * 20,
    points: 0,
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
    offensiveRebounds: 0,
    defensiveRebounds: 0,
    personalFouls: 0,
    plusMinus: 0,
    fieldGoalPct: 0,
    twoPointPct: 0,
    threePointPct: 0,
    freeThrowPct: 0,
    threePointAttemptRate: 0,
    freeThrowRate: 0,
    turnoverPct: 0,
    assistPct: 0,
    offensiveReboundPct: 0,
    defensiveReboundPct: 0,
    reboundPct: 0,
    stealPct: 0,
    blockPct: 0,
    pie: 0,
    per: 0,
    ows: 0,
    dws: 0,
    winShares: 0,
    winSharesPer48: 0,
    obpm: 0,
    dbpm: 0,
    bpm: 0,
    vorp: 0,
    dpm: 0,
    oDpm: 0,
    dDpm: 0,
    boxDpm: 0,
    onOffDpm: 0,
    drbl100: 0,
    drblP: 0,
    drblLn: 0,
    drblB: 0,
    drblO: 0,
    drblD: 0,
    sdv100: 0,
    shotMaking100: 0,
    epvShootMean: 0,
    vContMean: 0,
    r1Points: null,
    r1WinEquivalents: null,
    drblWar: 0,
    drblSeasonalImpact: 0,
    drblL: 0,
    drblMeanLeverage: 0,
    drblDisagreement: 0,
    drblUncertainty: 0,
    drblIntervalLo: 0,
    drblIntervalHi: 0,
    ...partial,
  };
}

console.log("player-season-team-context…");
{
  const career = [
    row({
      playerId: "1",
      teamId: "2", // ESPN BOS
      teamAbbreviation: "BOS",
      season: "2023-24",
      gamesPlayed: 70,
    }),
    row({
      playerId: "1",
      teamId: "13", // ESPN LAL - verify via brand
      teamAbbreviation: "LAL",
      season: "2024-25",
      gamesPlayed: 40,
    }),
  ];
  // Normalize LAL to real ESPN id via brandable
  career[1]!.teamId = brandableTeamKey("lal") ?? brandableTeamKey("LAL") ?? "13";
  const oldCtx = resolveSelectedSeasonTeamContext(career, "2023-24");
  const newCtx = resolveSelectedSeasonTeamContext(career, "2024-25");
  assert.equal(oldCtx.brandTeamKey, "2");
  assert.ok(newCtx.brandTeamKey);
  assert.notEqual(oldCtx.brandTeamKey, newCtx.brandTeamKey);
  const map = buildSeasonTeamsMap(career);
  assert.equal(map["2023-24"], "2");
  assert.equal(map["2024-25"], newCtx.brandTeamKey);
}

console.log("player-multi-team-season…");
{
  const career = [
    row({
      playerId: "2",
      teamId: "TOT",
      teamAbbreviation: "TOT",
      season: "2024-25",
      gamesPlayed: 60,
    }),
    row({
      playerId: "2",
      teamId: "bos",
      teamAbbreviation: "BOS",
      season: "2024-25",
      gamesPlayed: 30,
    }),
    row({
      playerId: "2",
      teamId: "dal",
      teamAbbreviation: "DAL",
      season: "2024-25",
      gamesPlayed: 30,
    }),
  ];
  assert.equal(seasonHasMultipleFranchises(career, "2024-25"), true);
  const primary = primaryTeamForSeason(career, "2024-25");
  assert.ok(primary && isMultiTeamSeasonRow(primary));
  const ctx = resolveSelectedSeasonTeamContext(career, "2024-25");
  assert.equal(ctx.kind, "MULTI_TEAM_AGGREGATE");
  assert.equal(ctx.brandTeamKey, undefined);
  assert.equal(ctx.teamLinkId, undefined);
  assert.equal(multiTeamDisplayLabel(primary), "TOT");
  assert.equal(buildSeasonTeamsMap(career)["2024-25"], "TOT");
  const stints = cardStintsForSeason(career, "2024-25");
  assert.equal(stints.length, 2);
  assert.equal(stints[0]!.teamLabel, "BOS");
  assert.equal(stints[1]!.teamLabel, "DAL");
  assert.equal(lastCardStint(stints)?.teamLabel, "DAL");
  const laterLast = cardStintsForSeason(
    [
      row({
        playerId: "2",
        teamId: "TOT",
        teamAbbreviation: "TOT",
        season: "2024-25",
        gamesPlayed: 60,
      }),
      row({
        playerId: "2",
        teamId: "dal",
        teamAbbreviation: "DAL",
        season: "2024-25",
        gamesPlayed: 10,
      }),
      row({
        playerId: "2",
        teamId: "bos",
        teamAbbreviation: "BOS",
        season: "2024-25",
        gamesPlayed: 50,
      }),
    ],
    "2024-25"
  );
  // Last franchise row in source order wins - not max games.
  assert.equal(lastCardStint(laterLast)?.teamLabel, "BOS");
  const deduped = dedupeCareerSeasons(career);
  assert.equal(deduped.length, 1);
  assert.equal(deduped[0]!.teamId, "TOT");
}

console.log("player-team-change board pick…");
{
  const board = [
    row({
      playerId: "3",
      teamId: "chi",
      teamAbbreviation: "CHI",
      season: "2024-25",
      gamesPlayed: 20,
    }),
    row({
      playerId: "3",
      teamId: "nyk",
      teamAbbreviation: "NYK",
      season: "2024-25",
      gamesPlayed: 45,
    }),
  ];
  const picked = pickPlayerSeasonBoardRow(board, "3");
  assert.equal(picked?.teamId, "nyk");
}

console.log("enrich keeps career team…");
{
  const careerRow = row({
    playerId: "4",
    teamId: "bos",
    teamAbbreviation: "BOS",
    season: "2024-25",
    gamesPlayed: 25,
    playerName: "Career Name",
  });
  const rich = row({
    playerId: "4",
    teamId: "dal",
    teamAbbreviation: "DAL",
    season: "2024-25",
    gamesPlayed: 40,
    playerName: "Rich Name",
    drbl100: 2.5,
  });
  const merged = enrichCareerRowKeepTeam(careerRow, rich);
  assert.equal(merged.teamId, "bos");
  assert.equal(merged.drbl100, 2.5);
  assert.equal(merged.playerName, "Rich Name");
}

console.log("brandable + current team precedence…");
{
  assert.equal(brandableTeamKey("TOT"), undefined);
  assert.equal(brandableTeamKey("9999999999"), undefined);
  assert.equal(brandableTeamKey("2"), "2"); // ESPN BOS
  assert.equal(brandableTeamKey("1610612738"), "2"); // NBA BOS → canonical
  const cur = resolveCurrentTeamId({
    currentSeasonRowTeamId: "18", // NYK-ish - resolve via brandable
    providerCurrentTeamId: "2",
    latestCareerTeamId: "13",
  });
  assert.ok(cur.teamId);
  assert.equal(cur.source, "CURRENT_SEASON_PLAYER_ROW");
}

console.log("OK - player-team-context (P17.3)");
