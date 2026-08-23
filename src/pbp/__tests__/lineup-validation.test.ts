import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { normalizePlayByPlay } from "../../../drbl/ingest/normalize";
import { reconstructLineups } from "../../../drbl/possessions/reconstruct-lineups";
import { reconstructPossessions } from "../../../drbl/possessions/reconstruct-possessions";
import type { DrblBoxScore, DrblEvent } from "../../../drbl/types";
import { normalizeBoxScore } from "../../../drbl/ingest/normalize";
import { statsBoxScoreV3ToCdnShape } from "../../../drbl/download/stats-boxscore-adapt";

const FIXTURE_ROOT = path.join(
  process.cwd(),
  "scripts",
  "fixtures",
  "pbp",
  "games"
);

function load(gameId: string, kind: string): unknown {
  return JSON.parse(
    readFileSync(path.join(FIXTURE_ROOT, gameId, `${kind}.json`), "utf8")
  );
}

function findSequence(
  events: DrblEvent[],
  predicate: (e: DrblEvent, i: number) => boolean,
  window = 6
): DrblEvent[] {
  for (let i = 0; i < events.length; i++) {
    if (!predicate(events[i]!, i)) continue;
    return events.slice(i, i + window);
  }
  return [];
}

describe("recorded event sequences", () => {
  it("0022400001 contains multi free-throw trip (recorded)", () => {
    const events = normalizePlayByPlay(
      "0022400001",
      load("0022400001", "playbyplay")
    );
    const trip = events.filter(
      (e) =>
        e.actionType === "freethrow" &&
        /1 of 2|2 of 2|1 of 3|2 of 3|3 of 3/.test(e.subType)
    );
    assert.ok(trip.length >= 2);
  });

  it("0021900001 overtime transition (recorded)", () => {
    const events = normalizePlayByPlay(
      "0021900001",
      load("0021900001", "playbyplay")
    );
    const periods = [...new Set(events.map((e) => e.period))].sort((a, b) => a - b);
    assert.ok(periods.includes(5));
    const otStart = events.find(
      (e) => e.actionType === "period" && e.period === 5 && /start/i.test(e.subType)
    );
    assert.ok(otStart);
  });

  it("0022400001 same-clock multiple actions (recorded)", () => {
    const events = normalizePlayByPlay(
      "0022400001",
      load("0022400001", "playbyplay")
    );
    const sameClock = events.filter(
      (e, i, arr) =>
        i > 0 &&
        e.period === arr[i - 1]!.period &&
        e.clockSeconds === arr[i - 1]!.clockSeconds
    );
    assert.ok(sameClock.length > 0);
  });

  it("0021500001 stats fallback normalization preserves substitutions (recorded)", () => {
    const events = normalizePlayByPlay(
      "0021500001",
      load("0021500001", "playbyplay")
    );
    assert.ok(events.some((e) => e.actionType === "substitution"));
  });
});

describe("synthetic event invariants", () => {
  const HOME = "1610612738";
  const AWAY = "1610612752";
  const H = ["h1", "h2", "h3", "h4", "h5"];
  const A = ["a1", "a2", "a3", "a4", "a5"];

  function box(scores = { home: 0, away: 0 }): DrblBoxScore {
    return {
      gameId: "synthetic",
      season: "2024-25",
      gameDate: "2024-11-01",
      homeTeamId: HOME,
      awayTeamId: AWAY,
      homeTeamTricode: "BOS",
      awayTeamTricode: "NYK",
      homeScore: scores.home,
      awayScore: scores.away,
      players: [
        ...H.map((id) => ({
          playerId: id,
          playerName: id,
          teamId: HOME,
          starter: true,
          minutes: 12,
          points: 0,
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
        })),
        ...A.map((id) => ({
          playerId: id,
          playerName: id,
          teamId: AWAY,
          starter: true,
          minutes: 12,
          points: 0,
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
        })),
      ],
    };
  }

  function ev(
    partial: Partial<DrblEvent> &
      Pick<DrblEvent, "actionNumber" | "actionType" | "period" | "clockSeconds">
  ): DrblEvent {
    return {
      gameId: "synthetic",
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

  it("technical free throw without possession change (synthetic)", () => {
    const events = [
      ev({
        actionNumber: 1,
        period: 1,
        clockSeconds: 600,
        actionType: "freethrow",
        subType: "1 of 1",
        teamId: HOME,
        playerId: "h1",
        shotResult: "Made",
        pointsOnAction: 1,
        scoreHome: 1,
      }),
      ev({
        actionNumber: 2,
        period: 1,
        clockSeconds: 590,
        actionType: "2pt",
        teamId: HOME,
        playerId: "h2",
        shotResult: "Made",
        isFieldGoal: true,
        pointsOnAction: 2,
        scoreHome: 3,
      }),
    ];
    const b = box({ home: 3, away: 0 });
    const lineups = reconstructLineups(events, b);
    const possessions = reconstructPossessions(events, b, lineups);
    assert.ok(possessions.length >= 1);
  });

  it("team turnover closes possession (synthetic)", () => {
    const events = [
      ev({
        actionNumber: 1,
        period: 1,
        clockSeconds: 600,
        actionType: "turnover",
        subType: "bad pass",
        teamId: HOME,
        playerId: "h1",
      }),
    ];
    const lineups = reconstructLineups(events, box());
    const possessions = reconstructPossessions(events, box(), lineups);
    assert.equal(possessions[0]?.endReason, "turnover");
  });

  it("end-of-quarter period event (synthetic)", () => {
    const events = [
      ev({
        actionNumber: 1,
        period: 1,
        clockSeconds: 1,
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
    const lineups = reconstructLineups(events, box());
    const possessions = reconstructPossessions(events, box(), lineups);
    assert.ok(possessions.length >= 1);
  });
});

describe("stats box adaptation", () => {
  it("0021500001 stats box adapts for normalizeBoxScore", () => {
    const raw = load("0021500001", "boxscore-stats-v3");
    const adapted = statsBoxScoreV3ToCdnShape(raw);
    assert.ok(adapted);
    const normalized = normalizeBoxScore("2015-16", adapted);
    assert.ok(normalized);
    assert.equal(normalized!.players.filter((p) => p.starter).length, 10);
  });
});
