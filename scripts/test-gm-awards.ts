import assert from "node:assert/strict";
import test from "node:test";

import { awardRaces, isRookie, stampSeasonAwards } from "../src/gm/engine/awards";
import type { GmCountingLine, GmLeagueState, GmPlayer, GmTeam } from "../src/gm/types";

function line(partial: Partial<GmCountingLine> & { gp: number }): GmCountingLine {
  return {
    season: "2027",
    team: "BOS",
    min: partial.gp * 32,
    pts: 0,
    reb: 0,
    ast: 0,
    stl: 0,
    blk: 0,
    tov: partial.gp * 2,
    fgm: partial.gp * 8,
    fga: partial.gp * 16,
    tpm: partial.gp * 2,
    tpa: partial.gp * 6,
    ftm: partial.gp * 4,
    fta: partial.gp * 5,
    ...partial,
  };
}

function player(id: string, name: string, teamId: string, extra: Partial<GmPlayer> = {}): GmPlayer {
  return {
    id,
    name,
    teamId,
    position: "SF",
    age: 27,
    heightIn: 79,
    weightLbs: 230,
    ratings: {
      impact: 2,
      offense: 2,
      defense: 0.4,
      shooting: 70,
      finishing: 70,
      playmaking: 70,
      rebounding: 50,
      durability: 80,
      potential: 2,
    },
    scouted: { impact: 1, offense: 1, defense: 1, uncertainty: 0 },
    contract: null,
    injury: null,
    morale: 70,
    personality: 0,
    minutesPreference: 32,
    ...extra,
  } as GmPlayer;
}

function team(id: string, coach: string, starterIds: string[], overalls: number[]): GmTeam {
  return {
    id,
    abbr: id.toUpperCase(),
    city: id,
    name: "Club",
    conference: "East",
    division: "Atlantic",
    ownerPatience: 50,
    ownerGoal: "contend",
    fanConfidence: 50,
    payrollLuxuryTaxM: 0,
    staff: {
      headCoach: {
        name: coach,
        offenseBonus: 0,
        defenseBonus: 0,
        developmentBonus: 0,
      },
      scoutLevel: 1,
      trainerLevel: 1,
    },
    starters: {
      PG: starterIds[0] ?? null,
      SG: starterIds[1] ?? null,
      SF: starterIds[2] ?? null,
      PF: starterIds[3] ?? null,
      C: starterIds[4] ?? null,
    },
    benchOrder: [],
    draftPicks: [],
    tradeExceptionsM: [],
    coaching: null,
  } as GmTeam & { _overalls?: number[] };
}

function league(players: GmPlayer[], teams: GmTeam[], standings: GmLeagueState["standings"]): GmLeagueState {
  return {
    season: 2027,
    day: 170,
    phase: "regular",
    userTeamId: teams[0]!.id,
    teams,
    players,
    standings,
    news: [],
    draftPool: [],
    schedule: [],
  } as unknown as GmLeagueState;
}

test("a rookie is a first-year player, not a young veteran", () => {
  const veteran = player("v", "Vet", "bos", {
    age: 21,
    nbaSeason: line({ gp: 70, pts: 70 * 18 }),
  });
  const older = player("old-rook", "Older", "bos", { age: 24 });
  const rookie = player("r", "Rook", "bos", { age: 19 });
  const drafted = player("d", "Drafted", "bos", { age: 20, draftYear: 2026 });
  assert.equal(isRookie(veteran, 2027), false);
  assert.equal(isRookie(rookie, 2027), true);
  assert.equal(isRookie(older, 2027), true);
  assert.equal(isRookie(drafted, 2027), true);
  assert.equal(isRookie({ ...drafted, draftYear: 2024 }, 2027), false);
});

test("awards follow the season, not the loudest line on a bad team", () => {
  const star = player("star", "Star", "good", {
    seasonLine: line({ gp: 72, pts: 72 * 28, reb: 72 * 8, ast: 72 * 7, min: 72 * 34 }),
    ratings: {
      impact: 6,
      offense: 6,
      defense: 1,
      shooting: 80,
      finishing: 80,
      playmaking: 80,
      rebounding: 60,
      durability: 80,
      potential: 2,
    },
  });
  const empty = player("gunner", "Gunner", "bad", {
    seasonLine: line({ gp: 74, pts: 74 * 31, reb: 74 * 6, ast: 74 * 6, min: 74 * 36 }),
  });
  const stopper = player("stop", "Stopper", "good", {
    position: "C",
    seasonLine: line({
      gp: 74,
      pts: 74 * 12,
      reb: 74 * 12,
      ast: 74 * 2,
      stl: 74 * 0.8,
      blk: 74 * 2.4,
      min: 74 * 33,
    }),
    ratings: {
      impact: 3,
      offense: 0,
      defense: 6,
      shooting: 40,
      finishing: 70,
      playmaking: 40,
      rebounding: 90,
      durability: 85,
      potential: 1,
    },
  });
  const rookie = player("rook", "Rookie", "bad", {
    age: 19,
    seasonLine: line({ gp: 70, pts: 70 * 18, reb: 70 * 6, ast: 70 * 4, min: 70 * 32 }),
  });
  const sixth = player("six", "Sixth", "good", {
    seasonLine: line({ gp: 72, gs: 8, pts: 72 * 17, reb: 72 * 4, ast: 72 * 3, min: 72 * 26 }),
  });
  const starterInNameOnly = player("fake", "Fake", "good", {
    seasonLine: line({ gp: 72, gs: 60, pts: 72 * 22, reb: 72 * 4, ast: 72 * 4, min: 72 * 28 }),
  });
  const leap = player("leap", "Leap", "good", {
    age: 24,
    seasonLine: line({ gp: 70, pts: 70 * 22, reb: 70 * 6, ast: 70 * 5, min: 70 * 33 }),
    nbaSeason: line({ gp: 60, pts: 60 * 11, reb: 60 * 3, ast: 60 * 2, min: 60 * 22 }),
  });
  const already = player("already", "Already", "good", {
    age: 28,
    seasonLine: line({ gp: 70, pts: 70 * 27, reb: 70 * 7, ast: 70 * 6, min: 70 * 34 }),
    nbaSeason: line({ gp: 70, pts: 70 * 26, reb: 70 * 7, ast: 70 * 6, min: 70 * 34 }),
  });
  const goodStarters = ["star", "stop", "a", "b", "c"].map((id, index) =>
    id.length === 1
      ? player(id, id, "good", { sheet: { overall: 84, attributes: {} as never, tendencies: {} as never, potential: {} as never } })
      : index === 0
        ? star
        : stopper
  );
  const filler = ["a", "b", "c", "d", "e", "f", "g", "h"].map((id) =>
    player(`fill-${id}`, id, "mid", {
      sheet: { overall: 74, attributes: {} as never, tendencies: {} as never, potential: {} as never },
    })
  );
  const teams = [
    team("good", "Winner Coach", ["star", "stop", "a", "b", "c"], []),
    team("bad", "Loser Coach", ["gunner", "rook", "x", "y", "z"], []),
    team("mid", "Climb Coach", filler.slice(0, 5).map((entry) => entry.id), []),
  ];
  for (const entry of [...goodStarters, sixth, leap, already]) {
    if (entry.teamId === "good" && !entry.sheet) {
      entry.sheet = { overall: 86, attributes: {} as never, tendencies: {} as never, potential: {} as never };
    }
  }
  const state = league(
    [star, empty, stopper, rookie, sixth, starterInNameOnly, leap, already, ...goodStarters.filter((p) => p.id.length === 1), ...filler],
    teams,
    {
      good: { teamId: "good", wins: 60, losses: 22, confWins: 30, confLosses: 10, pointsFor: 82 * 118, pointsAgainst: 82 * 108 },
      bad: { teamId: "bad", wins: 28, losses: 54, confWins: 10, confLosses: 30, pointsFor: 82 * 112, pointsAgainst: 82 * 118 },
      mid: { teamId: "mid", wins: 48, losses: 34, confWins: 20, confLosses: 16, pointsFor: 82 * 114, pointsAgainst: 82 * 112 },
    }
  );
  const races = awardRaces(state);
  const top = (id: string) => races.find((race) => race.id === id)!.candidates[0]!.id;
  assert.equal(top("mvp"), "star");
  assert.equal(top("dpoy"), "stop");
  assert.equal(top("roy"), "rook");
  assert.equal(top("smoy"), "six");
  assert.equal(
    races.find((race) => race.id === "smoy")!.candidates.some((candidate) => candidate.id === "fake"),
    false
  );
  assert.ok(races.find((race) => race.id === "all-nba-1")!.candidates.some((candidate) => candidate.id === "star"));
  assert.equal(races.find((race) => race.id === "all-nba-1")!.candidates.length, 5);
  assert.equal(races.find((race) => race.id === "all-def-1")!.candidates.length, 5);
  assert.equal(top("mip"), "leap");
  assert.equal(top("coty"), "coach:mid");

  const stamped = stampSeasonAwards(state);
  assert.equal(stamped.awards?.season, 2027);
  assert.match(stamped.news[0]!.headline, /Regular-season awards/);
  assert.match(stamped.news[0]!.body, /Star/);
  assert.equal(stampSeasonAwards(stamped), stamped);
});

test("mid-season races stay stable when the same leaders keep producing", () => {
  const star = player("star", "Star", "good", {
    seasonLine: line({ gp: 40, pts: 40 * 28, reb: 40 * 8, ast: 40 * 7, min: 40 * 34 }),
    ratings: {
      impact: 6,
      offense: 6,
      defense: 1,
      shooting: 80,
      finishing: 80,
      playmaking: 80,
      rebounding: 60,
      durability: 80,
      potential: 2,
    },
    sheet: { overall: 90, attributes: {} as never, tendencies: {} as never, potential: {} as never },
  });
  const stopper = player("stop", "Stopper", "good", {
    position: "C",
    seasonLine: line({
      gp: 40,
      pts: 40 * 12,
      reb: 40 * 12,
      blk: 40 * 2.4,
      min: 40 * 33,
    }),
    ratings: {
      impact: 3,
      offense: 0,
      defense: 6,
      shooting: 40,
      finishing: 70,
      playmaking: 40,
      rebounding: 90,
      durability: 85,
      potential: 1,
    },
    sheet: { overall: 84, attributes: {} as never, tendencies: {} as never, potential: {} as never },
  });
  const filler = ["a", "b", "c"].map((id) =>
    player(id, id, "good", {
      sheet: { overall: 78, attributes: {} as never, tendencies: {} as never, potential: {} as never },
      seasonLine: line({ gp: 40, pts: 40 * 12, min: 40 * 28 }),
    })
  );
  const early = league(
    [star, stopper, ...filler],
    [team("good", "Winner", ["star", "stop", "a", "b", "c"], [])],
    {
      good: {
        teamId: "good",
        wins: 28,
        losses: 12,
        confWins: 14,
        confLosses: 6,
        pointsFor: 40 * 118,
        pointsAgainst: 40 * 108,
      },
    }
  );
  early.day = 90;
  const midLeaders = awardRaces(early);
  const mvpEarly = midLeaders.find((race) => race.id === "mvp")!.candidates[0]!.id;
  const dpoyEarly = midLeaders.find((race) => race.id === "dpoy")!.candidates[0]!.id;

  // Same production, more games — race tops should not flip on sample size alone.
  star.seasonLine = line({ gp: 55, pts: 55 * 28, reb: 55 * 8, ast: 55 * 7, min: 55 * 34 });
  stopper.seasonLine = line({
    gp: 55,
    pts: 55 * 12,
    reb: 55 * 12,
    blk: 55 * 2.4,
    min: 55 * 33,
  });
  early.day = 130;
  early.standings.good = {
    teamId: "good",
    wins: 38,
    losses: 17,
    confWins: 20,
    confLosses: 8,
    pointsFor: 55 * 118,
    pointsAgainst: 55 * 108,
  };
  const later = awardRaces(early);
  assert.equal(later.find((race) => race.id === "mvp")!.candidates[0]!.id, mvpEarly);
  assert.equal(later.find((race) => race.id === "dpoy")!.candidates[0]!.id, dpoyEarly);
});

test("majors expose vote points and share so races can show a gap", () => {
  const star = player("star", "Star", "good", {
    seasonLine: line({ gp: 60, pts: 60 * 30, reb: 60 * 9, ast: 60 * 8, min: 60 * 35 }),
    ratings: {
      impact: 7,
      offense: 7,
      defense: 1,
      shooting: 82,
      finishing: 82,
      playmaking: 82,
      rebounding: 65,
      durability: 85,
      potential: 2,
    },
    sheet: { overall: 92, attributes: {} as never, tendencies: {} as never, potential: {} as never },
  });
  const next = player("next", "Next", "good", {
    seasonLine: line({ gp: 60, pts: 60 * 24, reb: 60 * 6, ast: 60 * 6, min: 60 * 33 }),
    sheet: { overall: 84, attributes: {} as never, tendencies: {} as never, potential: {} as never },
  });
  const filler = ["a", "b", "c"].map((id) =>
    player(id, id, "good", {
      sheet: { overall: 76, attributes: {} as never, tendencies: {} as never, potential: {} as never },
      seasonLine: line({ gp: 55, pts: 55 * 12, min: 55 * 26 }),
    })
  );
  const state = league(
    [star, next, ...filler],
    [team("good", "Winner", ["star", "next", "a", "b", "c"], [])],
    {
      good: {
        teamId: "good",
        wins: 45,
        losses: 15,
        confWins: 22,
        confLosses: 8,
        pointsFor: 60 * 118,
        pointsAgainst: 60 * 108,
      },
    }
  );
  const mvp = awardRaces(state).find((race) => race.id === "mvp")!;
  assert.equal(mvp.candidates[0]!.votes, 10);
  assert.equal(mvp.candidates[0]!.share, 1);
  assert.ok((mvp.candidates[1]?.share ?? 1) < 1);
  assert.ok(mvp.candidates.length >= 2);
});
