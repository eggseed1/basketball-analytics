/**
 * Home stage progression: awards → bracket → champion → summer.
 * Run: npx tsx scripts/test-gm-home-stage.ts
 */
import assert from "node:assert/strict";

import { resolveHomeStage } from "../src/gm/lib/home-stage";
import { buildChampionResult, pickFinalsMvp } from "../src/gm/engine/finals-mvp";
import type {
  GmBoxScore,
  GmLeagueState,
  GmPlayoffSeries,
  GmPlayer,
} from "../src/gm/types";

function baseLeague(partial: Partial<GmLeagueState>): GmLeagueState {
  return {
    version: 1,
    season: 2026,
    day: 200,
    phase: "regular",
    userTeamId: "det",
    settings: {
      salaryCapM: 140,
      luxuryTaxM: 170,
      firstApronM: 178,
      secondApronM: 188,
      maxRoster: 15,
      minRoster: 14,
      seasonLength: 82,
    },
    teams: [
      {
        id: "det",
        abbr: "DET",
        city: "Detroit",
        name: "Pistons",
        conference: "East",
        division: "Central",
        ownerPatience: 50,
        ownerGoal: "contend",
        fanConfidence: 50,
        payrollLuxuryTaxM: 0,
        staff: {
          headCoach: null as never,
          trainer: null as never,
          dead: [],
          scout: null as never,
          developer: null as never,
          scoutLevel: 3,
          trainerLevel: 3,
        },
        starters: { PG: null, SG: null, SF: null, PF: null, C: null },
        benchOrder: [],
        draftPicks: [],
        tradeExceptionsM: [],
      },
      {
        id: "bos",
        abbr: "BOS",
        city: "Boston",
        name: "Celtics",
        conference: "East",
        division: "Atlantic",
        ownerPatience: 50,
        ownerGoal: "contend",
        fanConfidence: 50,
        payrollLuxuryTaxM: 0,
        staff: {
          headCoach: null as never,
          trainer: null as never,
          dead: [],
          scout: null as never,
          developer: null as never,
          scoutLevel: 3,
          trainerLevel: 3,
        },
        starters: { PG: null, SG: null, SF: null, PF: null, C: null },
        benchOrder: [],
        draftPicks: [],
        tradeExceptionsM: [],
      },
    ],
    players: [],
    freeAgents: [],
    draftPool: [],
    schedule: [],
    standings: {},
    boxScores: [],
    news: [],
    tradeLog: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...partial,
  } as GmLeagueState;
}

const awards = {
  season: 2026,
  races: [
    {
      id: "mvp" as const,
      title: "MVP",
      candidates: [
        {
          id: "p1",
          name: "Star One",
          teamId: "det",
          detail: "28/8/8",
          share: 1,
          votes: 100,
        },
      ],
    },
  ],
};

assert.equal(resolveHomeStage(baseLeague({ phase: "regular" })), "regular");

assert.equal(
  resolveHomeStage(
    baseLeague({
      phase: "play_in",
      awards,
      homeFlow: { awardsSeen: false },
    })
  ),
  "awards",
  "award night blocks play-in until Next"
);

assert.equal(
  resolveHomeStage(
    baseLeague({
      phase: "play_in",
      awards,
      homeFlow: { awardsSeen: true },
    })
  ),
  "play_in"
);

assert.equal(
  resolveHomeStage(
    baseLeague({
      phase: "playoffs",
      awards,
      homeFlow: { awardsSeen: true },
      playoffBracket: [
        {
          id: "f",
          round: 4,
          conf: "Finals",
          teamAId: "det",
          teamBId: "bos",
          winsA: 2,
          winsB: 1,
          done: false,
        },
      ],
    })
  ),
  "playoffs"
);

const finalsDone: GmPlayoffSeries = {
  id: "f",
  round: 4,
  conf: "Finals",
  teamAId: "det",
  teamBId: "bos",
  winsA: 4,
  winsB: 2,
  done: true,
  winnerId: "det",
  games: [],
};

assert.equal(
  resolveHomeStage(
    baseLeague({
      phase: "playoffs",
      awards,
      homeFlow: { awardsSeen: true, championSeen: false },
      playoffBracket: [finalsDone],
      champion: {
        season: 2026,
        teamId: "det",
        finalsMvpId: "cade",
        wins: 4,
        losses: 2,
      },
    })
  ),
  "champion"
);

assert.equal(
  resolveHomeStage(
    baseLeague({
      phase: "draft",
      awards,
      homeFlow: { awardsSeen: true, championSeen: true },
    })
  ),
  "draft"
);

assert.equal(
  resolveHomeStage(
    baseLeague({
      phase: "free_agency",
      homeFlow: { awardsSeen: true, championSeen: true },
    })
  ),
  "free_agency"
);

assert.equal(
  resolveHomeStage(
    baseLeague({
      phase: "offseason",
      homeFlow: { awardsSeen: true, championSeen: true },
    })
  ),
  "offseason"
);

const players: GmPlayer[] = [
  {
    id: "cade",
    name: "Cade Cunningham",
    teamId: "det",
    position: "PG",
    age: 24,
    heightIn: 78,
    weightLbs: 220,
    ratings: {
      impact: 5,
      offense: 4,
      defense: 2,
      shooting: 80,
      finishing: 80,
      playmaking: 90,
      rebounding: 50,
      durability: 80,
      potential: 9,
    },
    scouted: { impact: 5, offense: 4, defense: 2, uncertainty: 0.1 },
    contract: null,
    injury: null,
    morale: 80,
    personality: 0,
    minutesPreference: 34,
  },
  {
    id: "role",
    name: "Role Player",
    teamId: "det",
    position: "SG",
    age: 26,
    heightIn: 76,
    weightLbs: 200,
    ratings: {
      impact: 1,
      offense: 1,
      defense: 1,
      shooting: 70,
      finishing: 70,
      playmaking: 60,
      rebounding: 40,
      durability: 70,
      potential: 5,
    },
    scouted: { impact: 1, offense: 1, defense: 1, uncertainty: 0.2 },
    contract: null,
    injury: null,
    morale: 70,
    personality: 0,
    minutesPreference: 20,
  },
];

const box = (pts: number, playerId: string): GmBoxScore =>
  ({
    id: `b-${playerId}-${pts}`,
    season: 2026,
    day: 250,
    homeTeamId: "det",
    awayTeamId: "bos",
    homeScore: 110,
    awayScore: 100,
    postseason: "playoffs",
    players: [
      {
        playerId,
        playerName: playerId,
        teamId: "det",
        minutes: 38,
        points: pts,
        assists: 8,
        rebounds: 6,
        steals: 1,
        blocks: 0,
        turnovers: 3,
        fgm: 10,
        fga: 20,
        tpm: 2,
        tpa: 6,
        ftm: 4,
        fta: 5,
        plusMinus: 12,
        trueShootingPct: 0.58,
        usagePct: 0.3,
        gameScore: 20,
      },
    ],
  }) as GmBoxScore;

const leagueForMvp = baseLeague({
  phase: "playoffs",
  players,
  boxScores: [box(40, "cade"), box(12, "role"), box(35, "cade")],
  playoffBracket: [finalsDone],
});

const mvp = pickFinalsMvp(leagueForMvp, finalsDone);
assert.equal(mvp?.id, "cade");

const champion = buildChampionResult(leagueForMvp, finalsDone);
assert.ok(champion);
assert.equal(champion!.teamId, "det");
assert.equal(champion!.finalsMvpId, "cade");
assert.equal(champion!.wins, 4);
assert.equal(champion!.losses, 2);

const stages = [
  resolveHomeStage(baseLeague({ phase: "regular" })),
  resolveHomeStage(
    baseLeague({ phase: "play_in", awards, homeFlow: { awardsSeen: false } })
  ),
  resolveHomeStage(
    baseLeague({ phase: "playoffs", awards, homeFlow: { awardsSeen: true } })
  ),
  resolveHomeStage(
    baseLeague({
      phase: "playoffs",
      awards,
      homeFlow: { awardsSeen: true, championSeen: false },
      playoffBracket: [finalsDone],
      champion: champion!,
    })
  ),
  resolveHomeStage(
    baseLeague({
      phase: "draft",
      homeFlow: { awardsSeen: true, championSeen: true },
    })
  ),
];

assert.deepEqual(stages, [
  "regular",
  "awards",
  "playoffs",
  "champion",
  "draft",
]);

console.log("home stage ok", { stages, mvp: mvp?.name, score: `${champion!.wins}-${champion!.losses}` });
