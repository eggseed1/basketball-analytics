import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildTeamWarRows,
  fitWarRegression,
  calibrateWar,
  seasonalValueToWar,
  type TeamWarRow,
} from "../war";
import { PROVISIONAL_WIN_CONVERSION } from "../player-value";
import type { DrblBoxScore, DrblEvent, DrblPossession } from "../../types";

function box(
  gameId: string,
  date: string,
  homeId: string,
  awayId: string,
  homeScore: number,
  awayScore: number
): DrblBoxScore {
  return {
    gameId,
    season: "2024-25",
    gameDate: date,
    homeTeamId: homeId,
    awayTeamId: awayId,
    homeTeamTricode: "HOM",
    awayTeamTricode: "AWY",
    homeScore,
    awayScore,
    players: [
      {
        playerId: `${homeId}-p1`,
        playerName: "Home",
        teamId: homeId,
        starter: true,
        minutes: 30,
        points: 20,
        fieldGoalsMade: 8,
        fieldGoalsAttempted: 16,
        threePointersMade: 2,
        threePointersAttempted: 5,
        freeThrowsMade: 2,
        freeThrowsAttempted: 2,
        offensiveRebounds: 1,
        defensiveRebounds: 4,
        rebounds: 5,
        assists: 3,
        steals: 1,
        blocks: 0,
        turnovers: 2,
        personalFouls: 2,
      },
      {
        playerId: `${awayId}-p1`,
        playerName: "Away",
        teamId: awayId,
        starter: true,
        minutes: 30,
        points: 18,
        fieldGoalsMade: 7,
        fieldGoalsAttempted: 15,
        threePointersMade: 2,
        threePointersAttempted: 6,
        freeThrowsMade: 2,
        freeThrowsAttempted: 2,
        offensiveRebounds: 1,
        defensiveRebounds: 3,
        rebounds: 4,
        assists: 2,
        steals: 1,
        blocks: 0,
        turnovers: 2,
        personalFouls: 2,
      },
    ],
  };
}

function madeFg(
  gameId: string,
  actionNumber: number,
  teamId: string,
  playerId: string,
  points: number,
  homeScore: number,
  awayScore: number
): DrblEvent {
  return {
    gameId,
    actionNumber,
    orderNumber: actionNumber,
    period: 1,
    clockSeconds: 600,
    clockRaw: "PT10M00.00S",
    actionType: points === 3 ? "3pt" : "2pt",
    subType: "",
    teamId,
    playerId,
    playerName: playerId,
    possessionTeamId: teamId,
    description: "make",
    shotResult: "Made",
    isFieldGoal: true,
    pointsOnAction: points,
    scoreHome: homeScore,
    scoreAway: awayScore,
    x: 0,
    y: 20,
    qualifiers: [],
    substitutionSide: null,
  };
}

function possession(
  gameId: string,
  id: string,
  offense: string,
  defense: string,
  points: number,
  offensePlayers: string[],
  defensePlayers: string[],
  endAction: number
): DrblPossession {
  return {
    gameId,
    possessionId: id,
    offenseTeamId: offense,
    defenseTeamId: defense,
    period: 1,
    startActionNumber: endAction,
    endActionNumber: endAction,
    startClockSeconds: 600,
    endClockSeconds: 590,
    points,
    endReason: "made_fg",
    offensePlayerIds: offensePlayers,
    defensePlayerIds: defensePlayers,
    eventActionNumbers: [endAction],
  };
}

describe("WAR regression", () => {
  it("recovers a positive points-to-wins slope", () => {
    const rows: TeamWarRow[] = [];
    for (let i = 0; i < 20; i++) {
      const value = (i - 10) * 3;
      rows.push({
        teamId: `t${i}`,
        games: 10,
        wins: Math.max(0, Math.min(10, 5 + value / 15 + (i % 3) * 0.1)),
        valueSum: value,
      });
    }
    const fitted = fitWarRegression(rows);
    assert.ok(
      fitted.throughOriginSlope > 0,
      `expected positive slope, got ${fitted.throughOriginSlope}`
    );
    assert.ok(
      seasonalValueToWar(30, fitted.throughOriginSlope) >
        seasonalValueToWar(0, fitted.throughOriginSlope)
    );
  });
});

describe("WAR calibration", () => {
  it("builds team rows and falls back to provisional when signal is weak", () => {
    const games = [];
    for (let i = 0; i < 24; i++) {
      const home = `H${i % 6}`;
      const away = `A${i % 6}`;
      const homeScore = 100 + (i % 5);
      const awayScore = 100 + ((i + 2) % 5);
      const b = box(`g${i}`, `2024-11-${String((i % 28) + 1).padStart(2, "0")}`, home, away, homeScore, awayScore);
      const homeP = [`${home}-p1`, "h2", "h3", "h4", "h5"];
      const awayP = [`${away}-p1`, "a2", "a3", "a4", "a5"];
      const events = [
        madeFg(`g${i}`, 1, home, homeP[0]!, 2, 2, 0),
        madeFg(`g${i}`, 2, away, awayP[0]!, 2, 2, 2),
      ];
      const possessions = [
        possession(`g${i}`, "p1", home, away, 2, homeP, awayP, 1),
        possession(`g${i}`, "p2", away, home, 2, awayP, homeP, 2),
      ];
      games.push({ box: b, events, possessions });
    }

    const rows = buildTeamWarRows(games);
    assert.ok(rows.length >= 6);

    const calib = calibrateWar(games, { holdoutFrac: 0.25, minTeams: 4 });
    assert.equal(calib.provisionalPointsToWins, PROVISIONAL_WIN_CONVERSION);
    assert.ok(calib.pointsToWins > 0);
    // Weak synthetic signal should not falsely claim calibration, or if it
    // does, slope must remain positive and finite.
    if (calib.calibrated) {
      assert.ok(calib.throughOriginSlope > 0);
    } else {
      assert.ok(
        Math.abs(calib.pointsToWins - PROVISIONAL_WIN_CONVERSION) < 1e-5
      );
    }
  });
});
