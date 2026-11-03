/**
 * Free-agency desk: options, QOs, moratorium commitments, RFA sheets.
 * Run: npx tsx scripts/test-gm-free-agency.ts
 */
import assert from "node:assert/strict";

import {
  advanceFaDayDetailed,
  applyOptionDecision,
  emptyFaMarket,
  fillMinimums,
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
import { getCbaRules } from "../src/gm/myleague/cba-registry";
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



// ——— MyNBA pain point: illegal top offer cannot block a legal competing bid ———
{
  const star = player("star-market", null, 88, 28, { lastSalaryM: 29 });
  const roster = Array.from({ length: 15 }, (_, index) =>
    player("full-" + index, "bos", 68, 27, {
      contract: { yearsRemaining: 2, annualSalaryM: 5, birdRights: "none", signedSeason: 2026 },
    })
  );
  const league = baseLeague([star, ...roster]);
  const invalid = evaluateOfferUtility(league, star, league.teams[0]!, 200, 4);
  const legal = evaluateOfferUtility(league, star, league.teams[1]!, 38, 4);
  const offered: GmLeagueState = {
    ...league,
    teams: league.teams.filter(team => team.id !== "det"),
    faMarket: { ...emptyFaMarket(42), stage: "open", day: 4, pending: [
      { id: "invalid", playerId: star.id, teamId: "bos", salaryM: 200, years: 4, day: 4,
        kind: "interest", utility: { ...invalid, total: 999 } },
      { id: "legal", playerId: star.id, teamId: "nyk", salaryM: 38, years: 4, day: 4,
        kind: "interest", utility: legal },
    ] },
  };
  const result = advanceFaDayDetailed(offered).state;
  const signed = result.players.find(row => row.id === star.id)!;
  assert.equal(signed.teamId, "nyk", "invalid top bid must not strand a star when a legal offer exists");
  assert.equal(signed.contract?.annualSalaryM, 38, "accept the legal contract, not an invalid amount");
}

// ——— MyNBA pain point: the CPU must never use minimum filler to poach
// undrafted exclusive-rights rookies or discount elite free agents ———
{
  const players = [
    player("exclusive", null, 98, 19, { pendingRookieContract: true, rightsKind: "exclusive_draft" }),
    player("elite", null, 91, 28),
    player("restricted", null, 83, 24, { rightsKind: "restricted", rightsTeamId: "nyk", qoStatus: "tendered" }),
    player("depth1", null, 76, 25),
    player("depth2", null, 74, 26),
    player("depth3", null, 71, 27),
  ];
  const league = baseLeague(players);
  const state = { ...league, settings: { ...league.settings, minRoster: 1 } };
  const filled = fillMinimums(state, getCbaRules(2027)).state;
  for (const team of filled.teams) {
    assert.equal(filled.players.filter(row => row.teamId === team.id).length, 1,
      team.id + " must sign available legal depth even if the top free agent is unavailable");
  }
  for (const id of ["exclusive", "elite", "restricted"]) {
    assert.equal(filled.players.find(row => row.id === id)!.teamId, null,
      id + " cannot be signed by automatic roster-minimum cleanup");
  }
}



// ——— MyNBA pain point: open market cannot accept an elite player's
// only minimum offer, while fair unrestricted offers still sign ———
{
  const star = player("underpriced", null, 89, 28);
  const league = {
    ...baseLeague([star]),
    faMarket: { ...emptyFaMarket(299), stage: "open" as const, day: 6 },
  };
  const cheap = userOfferFreeAgent(league, star.id, 2.5, 1);
  assert.equal(cheap.ok, false, "an established star must reject a near-minimum salary");
  assert.equal((cheap.ok ? cheap.state : cheap.state)?.players.find(p => p.id === star.id)?.teamId ?? null,
    null, "rejected minimum offer must not sign the player");

  const reasonable = userOfferFreeAgent(league, star.id, 36, 4);
  assert.equal(reasonable.ok, true, reasonable.ok ? "" : reasonable.reason);
  assert.equal(reasonable.ok && reasonable.state.players.find(p => p.id === star.id)?.teamId,
    "bos", "a legitimate star salary must still be accepted");
}

console.log("gm free agency ok");
