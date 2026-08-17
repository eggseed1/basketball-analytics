import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { reconstructLineups } from "../reconstruct-lineups";
import { reconstructPossessions } from "../reconstruct-possessions";
import { reconcileLineupMinutes } from "../reconcile-lineups";
import { reconcileGame } from "../reconcile";
import type { DrblBoxScore, DrblEvent } from "../../types";

const HOME = "1610612738";
const AWAY = "1610612752";

function boxWithStarters(
  homeIds: string[],
  awayIds: string[],
  scores: { home: number; away: number } = { home: 0, away: 0 }
): DrblBoxScore {
  return {
    gameId: "test-game",
    season: "2024-25",
    gameDate: "2024-11-01",
    homeTeamId: HOME,
    awayTeamId: AWAY,
    homeTeamTricode: "BOS",
    awayTeamTricode: "NYK",
    homeScore: scores.home,
    awayScore: scores.away,
    players: [
      ...homeIds.map((id, i) => player(id, HOME, true, 12, i === 0 ? scores.home : 0)),
      ...awayIds.map((id, i) => player(id, AWAY, true, 12, i === 0 ? scores.away : 0)),
    ],
  };
}

function player(
  playerId: string,
  teamId: string,
  starter: boolean,
  minutes: number,
  points: number
) {
  return {
    playerId,
    playerName: `P${playerId}`,
    teamId,
    starter,
    minutes,
    points,
    fieldGoalsMade: 0,
    fieldGoalsAttempted: 0,
    threePointersMade: 0,
    threePointersAttempted: 0,
    freeThrowsMade: 0,
    freeThrowsAttempted: 0,
    offensiveRebounds: 0,
    defensiveRebounds: 0,
    rebounds: 0,
    assists: 0,
    steals: 0,
    blocks: 0,
    turnovers: 0,
    personalFouls: 0,
  };
}

function ev(
  partial: Partial<DrblEvent> &
    Pick<DrblEvent, "actionNumber" | "actionType" | "period" | "clockSeconds">
): DrblEvent {
  return {
    gameId: "test-game",
    orderNumber: partial.actionNumber,
    clockRaw: `PT${Math.floor(partial.clockSeconds / 60)}M${partial.clockSeconds % 60}.00S`,
    subType: "",
    teamId: null,
    playerId: null,
    playerName: null,
    possessionTeamId: null,
    description: "",
    shotResult: null,
    isFieldGoal: false,
    pointsOnAction: 0,
    scoreHome: 0,
    scoreAway: 0,
    x: null,
    y: null,
    qualifiers: [],
    substitutionSide: null,
    ...partial,
  };
}

const H = ["h1", "h2", "h3", "h4", "h5"];
const A = ["a1", "a2", "a3", "a4", "a5"];

describe("possession reconstruction edge cases", () => {
  it("closes possession on made FG (no and-1)", () => {
    const box = boxWithStarters(H, A, { home: 2, away: 0 });
    box.players[0]!.fieldGoalsMade = 1;
    box.players[0]!.fieldGoalsAttempted = 1;
    box.players[0]!.points = 2;
    const events = [
      ev({
        actionNumber: 1,
        period: 1,
        clockSeconds: 700,
        actionType: "2pt",
        teamId: HOME,
        playerId: "h1",
        shotResult: "Made",
        isFieldGoal: true,
        pointsOnAction: 2,
        scoreHome: 2,
        scoreAway: 0,
        description: "h1 makes 2pt",
      }),
    ];
    const lineups = reconstructLineups(events, box);
    const possessions = reconstructPossessions(events, box, lineups);
    assert.equal(possessions.length, 1);
    assert.equal(possessions[0]!.endReason, "made_fg");
    assert.equal(possessions[0]!.points, 2);
    assert.equal(possessions[0]!.offenseTeamId, HOME);
  });

  it("keeps possession open through offensive rebound", () => {
    const box = boxWithStarters(H, A);
    const events = [
      ev({
        actionNumber: 1,
        period: 1,
        clockSeconds: 700,
        actionType: "2pt",
        teamId: HOME,
        playerId: "h1",
        shotResult: "Missed",
        isFieldGoal: true,
        description: "miss",
      }),
      ev({
        actionNumber: 2,
        period: 1,
        clockSeconds: 698,
        actionType: "rebound",
        subType: "offensive",
        teamId: HOME,
        playerId: "h2",
        description: "oreb",
      }),
      ev({
        actionNumber: 3,
        period: 1,
        clockSeconds: 690,
        actionType: "2pt",
        teamId: HOME,
        playerId: "h1",
        shotResult: "Made",
        isFieldGoal: true,
        pointsOnAction: 2,
        scoreHome: 2,
        description: "putback",
      }),
    ];
    box.homeScore = 2;
    box.players[0]!.points = 2;
    box.players[0]!.fieldGoalsMade = 1;
    box.players[0]!.fieldGoalsAttempted = 2;
    box.players[1]!.offensiveRebounds = 1;
    box.players[1]!.rebounds = 1;

    const lineups = reconstructLineups(events, box);
    const possessions = reconstructPossessions(events, box, lineups);
    assert.equal(possessions.length, 1);
    assert.equal(possessions[0]!.points, 2);
    assert.equal(possessions[0]!.endReason, "made_fg");
  });

  it("closes on defensive rebound", () => {
    const box = boxWithStarters(H, A);
    const events = [
      ev({
        actionNumber: 1,
        period: 1,
        clockSeconds: 700,
        actionType: "2pt",
        teamId: HOME,
        playerId: "h1",
        shotResult: "Missed",
        isFieldGoal: true,
      }),
      ev({
        actionNumber: 2,
        period: 1,
        clockSeconds: 698,
        actionType: "rebound",
        subType: "defensive",
        teamId: AWAY,
        playerId: "a1",
      }),
    ];
    box.players[0]!.fieldGoalsAttempted = 1;
    box.players[5]!.defensiveRebounds = 1;
    box.players[5]!.rebounds = 1;

    const lineups = reconstructLineups(events, box);
    const possessions = reconstructPossessions(events, box, lineups);
    assert.equal(possessions.length, 1);
    assert.equal(possessions[0]!.endReason, "def_rebound");
    assert.equal(possessions[0]!.points, 0);
  });

  it("closes on turnover", () => {
    const box = boxWithStarters(H, A);
    const events = [
      ev({
        actionNumber: 1,
        period: 1,
        clockSeconds: 650,
        actionType: "turnover",
        teamId: HOME,
        playerId: "h1",
        description: "bad pass",
      }),
    ];
    box.players[0]!.turnovers = 1;
    const lineups = reconstructLineups(events, box);
    const possessions = reconstructPossessions(events, box, lineups);
    assert.equal(possessions.length, 1);
    assert.equal(possessions[0]!.endReason, "turnover");
  });

  it("keeps and-1 free throw on same possession", () => {
    const box = boxWithStarters(H, A, { home: 3, away: 0 });
    box.players[0]!.points = 3;
    box.players[0]!.fieldGoalsMade = 1;
    box.players[0]!.fieldGoalsAttempted = 1;
    box.players[0]!.freeThrowsMade = 1;
    box.players[0]!.freeThrowsAttempted = 1;
    const events = [
      ev({
        actionNumber: 1,
        period: 1,
        clockSeconds: 600,
        actionType: "2pt",
        teamId: HOME,
        playerId: "h1",
        shotResult: "Made",
        isFieldGoal: true,
        pointsOnAction: 2,
        scoreHome: 2,
      }),
      ev({
        actionNumber: 2,
        period: 1,
        clockSeconds: 600,
        actionType: "foul",
        teamId: AWAY,
        playerId: "a1",
        subType: "personal",
      }),
      ev({
        actionNumber: 3,
        period: 1,
        clockSeconds: 600,
        actionType: "freethrow",
        subType: "1 of 1",
        teamId: HOME,
        playerId: "h1",
        shotResult: "Made",
        pointsOnAction: 1,
        scoreHome: 3,
      }),
    ];
    const lineups = reconstructLineups(events, box);
    const possessions = reconstructPossessions(events, box, lineups);
    assert.equal(possessions.length, 1);
    assert.equal(possessions[0]!.points, 3);
    assert.equal(possessions[0]!.endReason, "made_ft");
  });
});

describe("lineup minute reconciliation", () => {
  it("reports lineup snapshots and compares to box minutes", () => {
    const box = boxWithStarters(H, A);
    const events = [
      ev({
        actionNumber: 1,
        period: 1,
        clockSeconds: 360,
        actionType: "2pt",
        teamId: HOME,
        playerId: "h1",
        shotResult: "Missed",
        isFieldGoal: true,
      }),
      ev({
        actionNumber: 2,
        period: 1,
        clockSeconds: 0,
        actionType: "period",
        subType: "end",
      }),
    ];
    // Full Q1 on floor ≈ 12 minutes each starter.
    for (const p of box.players) p.minutes = 12;

    const lineups = reconstructLineups(events, box);
    const report = reconcileLineupMinutes(box, events, lineups, {
      maxAbsMinuteDelta: 1,
    });
    assert.ok(report.lineupSnapshots >= 1);
    assert.equal(report.reconstructionVersion.length > 0, true);
    // Starters should be close to 12.
    assert.equal(report.ok, true, report.warnings.join("; "));
  });
});

describe("game reconcile quarantine", () => {
  it("quarantines when possession points disagree with box", () => {
    const box = boxWithStarters(H, A, { home: 10, away: 0 });
    const events = [
      ev({
        actionNumber: 1,
        period: 1,
        clockSeconds: 700,
        actionType: "2pt",
        teamId: HOME,
        playerId: "h1",
        shotResult: "Made",
        isFieldGoal: true,
        pointsOnAction: 2,
        scoreHome: 2,
      }),
    ];
    box.players[0]!.points = 2;
    box.players[0]!.fieldGoalsMade = 1;
    box.players[0]!.fieldGoalsAttempted = 1;
    const lineups = reconstructLineups(events, box);
    const possessions = reconstructPossessions(events, box, lineups);
    const lineup = reconcileLineupMinutes(box, events, lineups);
    const report = reconcileGame(box, events, possessions, { lineup });
    assert.equal(report.quarantined, true);
    assert.equal(report.ok, false);
  });
});
