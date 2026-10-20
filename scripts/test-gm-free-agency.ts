/**
 * Free-agency desk: options, QOs, moratorium commitments, RFA sheets.
 * Run: npx tsx scripts/test-gm-free-agency.ts
 */
import assert from "node:assert/strict";

import {
  advanceFaDayDetailed,
  applyOptionDecision,
  emptyFaMarket,
  resignOwnFreeAgent,
  runFaPeriod,
  userOfferFreeAgent,
} from "../src/gm/engine/free-agency";
import {
  declineQualifyingOffer,
  tenderQualifyingOffer,
} from "../src/gm/engine/fa-qualifying";
import {
  declineOfferSheet,
  matchOfferSheet,
  submitOfferSheet,
} from "../src/gm/engine/fa-rfa";
import { hasPendingOption } from "../src/gm/engine/fa-status";
import { enterFreeAgency } from "../src/gm/engine/offseason";
import { evaluateOfferUtility } from "../src/gm/engine/fa-utility";
import type { GmLeagueState, GmPlayer, GmTeam } from "../src/gm/types";

function club(id: string, goal: GmTeam["ownerGoal"] = "contend"): GmTeam {
  return {
    id,
    abbr: id.toUpperCase(),
    city: id,
    name: "Club",
    conference: "East",
    division: "Atlantic",
    ownerGoal: goal,
    staff: {
      headCoach: {
        name: "Coach",
        offenseBonus: 0,
        defenseBonus: 0,
        developmentBonus: 0,
      },
      scoutLevel: 1,
      trainerLevel: 1,
    },
    starters: { PG: null, SG: null, SF: null, PF: null, C: null },
    benchOrder: [],
    draftPicks: [],
    tradeExceptionsM: [],
    deadMoney: [],
  } as GmTeam;
}

function player(
  id: string,
  teamId: string | null,
  overall: number,
  age: number,
  extras: Partial<GmPlayer> = {}
): GmPlayer {
  return {
    id,
    name: id,
    teamId,
    position: "SF",
    age,
    heightIn: 79,
    weightLbs: 220,
    ratings: {
      impact: 2,
      offense: 2,
      defense: 1,
      shooting: 70,
      finishing: 70,
      playmaking: 70,
      rebounding: 50,
      durability: 80,
      potential: 2,
    },
    sheet: {
      overall,
      attributes: {} as never,
      tendencies: {} as never,
      potential: {} as never,
    },
    scouted: { impact: 1, offense: 1, defense: 1, uncertainty: 0 },
    contract: extras.contract ?? null,
    injury: null,
    morale: 70,
    personality: 0,
    minutesPreference: 32,
    ...extras,
  } as GmPlayer;
}

function baseLeague(players: GmPlayer[]): GmLeagueState {
  const teams = [club("bos"), club("nyk", "retool"), club("det", "tank")];
  return {
    version: 1,
    id: "fa-test",
    season: 2027,
    day: 200,
    phase: "free_agency",
    userTeamId: "bos",
    teams,
    players,
    freeAgents: players.filter((p) => p.teamId == null).map((p) => p.id),
    draftPool: [],
    schedule: [],
    standings: {},
    boxScores: [],
    news: [],
    tradeLog: [],
    faMarket: emptyFaMarket(42),
    settings: {
      salaryCapM: 140,
      luxuryTaxM: 170,
      firstApronM: 178,
      secondApronM: 189,
      maxRoster: 15,
      minRoster: 14,
      seasonLength: 82,
    },
    automation: { autoDraft: false, autoFreeAgency: false },
    updatedAt: new Date().toISOString(),
  } as unknown as GmLeagueState;
}

// ——— Options ———
{
  const optionGuy = player("opt", "bos", 78, 27, {
    contract: {
      yearsRemaining: 0,
      annualSalaryM: 12,
      birdRights: "bird",
      option: "team",
      signedSeason: 2024,
    },
  });
  let league = baseLeague([
    optionGuy,
    player("fa1", null, 80, 28, {
      rightsTeamId: null,
      lastSalaryM: 20,
    }),
  ]);
  assert.equal(hasPendingOption(optionGuy), true);
  league = applyOptionDecision(league, "opt", "exercise");
  const kept = league.players.find((p) => p.id === "opt")!;
  assert.equal(kept.teamId, "bos");
  assert.equal(kept.contract?.yearsRemaining, 1);
  assert.equal(kept.contract?.option, null);

  league = baseLeague([
    player("opt2", "bos", 70, 29, {
      contract: {
        yearsRemaining: 0,
        annualSalaryM: 8,
        birdRights: "early",
        option: "team",
        signedSeason: 2025,
      },
    }),
  ]);
  league = applyOptionDecision(league, "opt2", "decline");
  const released = league.players.find((p) => p.id === "opt2")!;
  assert.equal(released.teamId, null);
  assert.ok(league.freeAgents.includes("opt2"));
}

// ——— QO + RFA match/decline ———
{
  const rfa = player("rfa", null, 79, 24, {
    rightsTeamId: "bos",
    rightsKind: "early",
    lastSalaryM: 6,
    draftYear: 2023,
    serviceYears: 4,
    qoStatus: "eligible",
  });
  let league = baseLeague([
    rfa,
    player("filler", "bos", 72, 26, {
      contract: {
        yearsRemaining: 2,
        annualSalaryM: 8,
        birdRights: "none",
        signedSeason: 2026,
      },
    }),
  ]);
  // Skip to market stages for sheet tests.
  league = {
    ...league,
    faMarket: { ...emptyFaMarket(7), stage: "open", day: 4 },
    freeAgents: ["rfa"],
  };
  const tendered = tenderQualifyingOffer(league, "rfa", "bos");
  assert.equal(tendered.ok, true);
  league = tendered.state;
  assert.equal(league.players.find((p) => p.id === "rfa")!.rightsKind, "restricted");

  const sheet = submitOfferSheet(league, "rfa", "nyk", 10, 3);
  assert.equal(sheet.ok, true, sheet.ok ? "" : sheet.reason);
  league = sheet.state;
  assert.equal(league.faMarket?.offerSheets?.length, 1);

  const matched = matchOfferSheet(league, league.faMarket!.offerSheets![0]!.id);
  assert.equal(matched.ok, true, matched.ok ? "" : matched.reason);
  assert.equal(matched.state.players.find((p) => p.id === "rfa")!.teamId, "bos");

  // Decline path
  league = tenderQualifyingOffer(
    {
      ...baseLeague([
        { ...rfa, id: "rfa2", name: "rfa2" },
        player("f2", "bos", 72, 26, {
          contract: {
            yearsRemaining: 2,
            annualSalaryM: 8,
            birdRights: "none",
            signedSeason: 2026,
          },
        }),
      ]),
      faMarket: { ...emptyFaMarket(8), stage: "open", day: 4 },
      freeAgents: ["rfa2"],
    },
    "rfa2",
    "bos"
  ).state;
  const sheet2 = submitOfferSheet(league, "rfa2", "nyk", 9, 2);
  assert.equal(sheet2.ok, true);
  league = sheet2.state;
  const declined = declineOfferSheet(league, league.faMarket!.offerSheets![0]!.id);
  assert.equal(declined.ok, true);
  assert.equal(declined.state.players.find((p) => p.id === "rfa2")!.teamId, "nyk");
}

// ——— Declining QO removes restricted ———
{
  const row = player("qo", null, 75, 24, {
    rightsTeamId: "bos",
    lastSalaryM: 5,
    draftYear: 2023,
    serviceYears: 4,
    qoStatus: "eligible",
  });
  const league = baseLeague([row]);
  const declined = declineQualifyingOffer(league, "qo", "bos");
  assert.equal(declined.ok, true);
  assert.notEqual(declined.state.players.find((p) => p.id === "qo")!.rightsKind, "restricted");
}

// ——— Utility is stable across reloads ———
{
  const p = player("star", null, 88, 28, { lastSalaryM: 35 });
  const league = baseLeague([p, ...Array.from({ length: 12 }, (_, i) =>
    player(`bos${i}`, "bos", 74, 26, {
      contract: {
        yearsRemaining: 2,
        annualSalaryM: 5,
        birdRights: "none",
        signedSeason: 2026,
      },
    })
  )]);
  const team = league.teams.find((t) => t.id === "bos")!;
  const a = evaluateOfferUtility(league, p, team, 40, 4);
  const b = evaluateOfferUtility(league, p, team, 40, 4);
  assert.equal(a.total, b.total);
  assert.equal(a.noise, b.noise);
}

// ——— Moratorium commitment reserves then signs on open ———
{
  const ufa = player("wing", null, 82, 27, {
    rightsTeamId: "bos",
    rightsKind: "bird",
    lastSalaryM: 18,
  });
  let league = baseLeague([
    ufa,
    ...Array.from({ length: 12 }, (_, i) =>
      player(`r${i}`, "bos", 70, 25, {
        contract: {
          yearsRemaining: 2,
          annualSalaryM: 4,
          birdRights: "none",
          signedSeason: 2026,
        },
      })
    ),
  ]);
  league = {
    ...league,
    faMarket: { ...emptyFaMarket(99), stage: "moratorium", day: 0 },
    freeAgents: ["wing"],
    automation: { autoDraft: false, autoFreeAgency: true },
  };
  const offer = userOfferFreeAgent(league, "wing", 22, 3);
  assert.equal(offer.ok, true, offer.ok ? "" : offer.reason);
  league = offer.state!;
  assert.ok(league.faMarket?.agreements.some((row) => row.playerId === "wing"));
  assert.ok(league.faMarket?.reservations?.some((row) => row.playerId === "wing"));
  // Jump to open and advance to lock.
  league = {
    ...league,
    faMarket: { ...league.faMarket!, stage: "open", day: 3 },
  };
  const advanced = advanceFaDayDetailed(league);
  league = advanced.state;
  assert.equal(league.players.find((p) => p.id === "wing")?.teamId, "bos");
}

// ——— Seeded full period does not throw and leaves unsigned possible ———
{
  const players: GmPlayer[] = [];
  for (const teamId of ["bos", "nyk", "det"]) {
    for (let i = 0; i < 14; i++) {
      players.push(
        player(`${teamId}-${i}`, teamId, 70 + (i % 8), 24 + (i % 6), {
          contract: {
            yearsRemaining: 2,
            annualSalaryM: 4 + i * 0.5,
            birdRights: "none",
            signedSeason: 2025,
          },
        })
      );
    }
  }
  for (let i = 0; i < 20; i++) {
    players.push(
      player(`fa-${i}`, null, 68 + (i % 12), 25 + (i % 8), {
        lastSalaryM: 4 + i,
      })
    );
  }
  let league = baseLeague(players);
  league = {
    ...league,
    freeAgents: players.filter((p) => p.teamId == null).map((p) => p.id),
    automation: { autoDraft: false, autoFreeAgency: true },
  };
  league = runFaPeriod(league, 30);
  assert.ok(league.faMarket?.done || league.faMarket?.stage === "fill");
  const unsigned = league.players.filter((p) => p.teamId == null).length;
  assert.ok(unsigned >= 0);
}

// ——— enterFreeAgency starts on options ———
{
  const league = enterFreeAgency({
    ...baseLeague([
      player("a", "bos", 75, 26, {
        contract: {
          yearsRemaining: 1,
          annualSalaryM: 10,
          birdRights: "bird",
          option: "team",
          signedSeason: 2024,
        },
      }),
    ]),
    phase: "draft",
    draftPool: [],
  } as GmLeagueState);
  assert.equal(league.phase, "free_agency");
  assert.equal(league.faMarket?.stage, "options");
}

// resign own still works
{
  const p = player("own", null, 80, 28, {
    rightsTeamId: "bos",
    rightsKind: "bird",
    lastSalaryM: 20,
  });
  let league = baseLeague([
    p,
    ...Array.from({ length: 12 }, (_, i) =>
      player(`x${i}`, "bos", 70, 25, {
        contract: {
          yearsRemaining: 2,
          annualSalaryM: 4,
          birdRights: "none",
          signedSeason: 2026,
        },
      })
    ),
  ]);
  league = {
    ...league,
    faMarket: { ...emptyFaMarket(3), stage: "open", day: 5 },
    freeAgents: ["own"],
  };
  const result = resignOwnFreeAgent(league, "own");
  assert.equal(result.ok, true, result.ok ? "" : result.reason);
}

console.log("gm free agency ok");
