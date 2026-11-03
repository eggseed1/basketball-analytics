/**
 * Free-agency desk: options, QOs, moratorium commitments, RFA sheets.
 * Run: npx tsx scripts/test-gm-free-agency.ts
 */
import assert from "node:assert/strict";

import {
  advanceFaDayDetailed,
  askingSalary,
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
import { evaluateOfferUtility, faPlayerPriorities } from "../src/gm/engine/fa-utility";
import { faLocationPreferences, locationAppeal } from "../src/gm/engine/fa-location";
import { competingFreeAgentOffers, legalFreeAgentSalaryRange,
  maxFreeAgentYears, projectFreeAgentResponse } from "../src/gm/engine/fa-offer-projection";
import { evaluateSigning } from "../src/gm/engine/cap";
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
  assert.equal(cheap.state?.players.find(p => p.id === star.id)?.teamId ?? null,
    null, "rejected minimum offer must not sign the player");

  const reasonable = userOfferFreeAgent(league, star.id, 41, 4);
  assert.equal(reasonable.ok, true, reasonable.ok ? "" : reasonable.reason);
  assert.equal(reasonable.ok && reasonable.state.players.find(p => p.id === star.id)?.teamId,
    "bos", "a legitimate star salary must still be accepted");
}


// ——— Contract UI and engine share exact CBA ceilings and a persistent agent
// score. No salary slider may show an offer that the signing evaluator rejects.
{
  const target = player("negotiation-wing", null, 83, 27);
  const league: GmLeagueState = {
    ...baseLeague([target]),
    faMarket: { ...emptyFaMarket(787), stage: "moratorium", day: 2 },
  };
  const range = legalFreeAgentSalaryRange(league, target, 3);
  assert.ok(range.maxM >= range.minM && range.via, "an under-cap club must have a legal slider range");
  assert.equal(evaluateSigning(league, "bos", target, range.maxM, 3).ok, true,
    "slider ceiling must be a legally valid signing");
  assert.equal(maxFreeAgentYears(league, target), 4);
  assert.equal(evaluateSigning(league, "bos", target, range.maxM, 5).ok, false,
    "a non-Bird team cannot offer five seasons");
  const low = projectFreeAgentResponse(league, target, range.minM, 3);
  const high = projectFreeAgentResponse(league, target, Math.min(range.maxM, 30), 3);
  assert.equal(low.legal, true);
  assert.ok(high.chance >= low.chance,
    "higher same-team offers must not lower agent interest");
  assert.deepEqual(high, projectFreeAgentResponse(structuredClone(league), target, Math.min(range.maxM, 30), 3),
    "agent interest must not re-roll when the save is reopened");
  assert.equal(competingFreeAgentOffers(league, target).length, 0, "never invent competing offers");
  const rivalLeague: GmLeagueState = {
    ...league,
    faMarket: { ...league.faMarket!, pending: [
      { id: "competing", playerId: target.id, teamId: "nyk", salaryM: 30,
        years: 3, day: 2, kind: "interest" },
    ] },
  };
  assert.equal(competingFreeAgentOffers(rivalLeague, target).length, 1,
    "show actual market bids when teams place them");
  const rivalInterest = projectFreeAgentResponse(rivalLeague, target, Math.min(range.maxM, 30), 3);
  assert.ok(rivalInterest.rivalScore != null, "the competitor should affect the offer forecast");
  assert.ok(rivalInterest.chance <= high.chance,
    "adding a strong rival should not improve our winning chances");
}

// ——— Player preferences are real simulation weights, stable by player id,
// but are shown as modeled agent beliefs, not claims about real people.
{
  const target = player("lifestyle-probe", null, 81, 26);
  const priorities = faPlayerPriorities(target);
  assert.ok(priorities.some(p => p.id === "location" && p.weight > 0));
  assert.ok(Math.abs(priorities.reduce((sum, p) => sum + p.weight, 0) - 1) < 0.001,
    "agent priorities must represent a complete normalized utility model");
  assert.deepEqual(faLocationPreferences(target), faLocationPreferences({ ...target }),
    "player location preferences must be stable across saves");
  const warm = club("mia"), cold = club("bos");
  assert.ok(locationAppeal(target, warm) >= 0 && locationAppeal(target, cold) <= 100);
  const userLeague = { ...baseLeague([target]), faMarket: { ...emptyFaMarket(8), stage: "open" as const } };
  const offer = evaluateOfferUtility(userLeague, target, userLeague.teams[0]!, 19, 3);
  assert.equal(typeof offer.location, "number");
}

// ——— Restricted sheets must use at least two seasons; Bird re-signs can
// reach five, but cap/exception-only deals are limited correctly.
{
  const rfa = player("rfa-ui", null, 78, 24,
    { rightsTeamId: "nyk", rightsKind: "restricted", qoStatus: "tendered" });
  const league = { ...baseLeague([rfa]), faMarket: { ...emptyFaMarket(51), stage: "open" as const } };
  // RFA sheets are a real NBA moratorium exception: they can be filed before
  // most other free-agent contracts can be formally signed.
  const preSigning = {
    ...league,
    seasonFlow: { stage: "free_agency" } as GmLeagueState["seasonFlow"],
    faMarket: { ...league.faMarket!, stage: "moratorium" as const },
  };
  const moratoriumForecast = projectFreeAgentResponse(preSigning, rfa, 9, 2);
  assert.equal(moratoriumForecast.legal, true,
    "the slider must allow a tendered restricted offer sheet during moratorium");
  const moratoriumSheet = userOfferFreeAgent(preSigning, rfa.id, 9, 2);
  assert.equal(moratoriumSheet.ok, true,
    moratoriumSheet.ok ? "" : moratoriumSheet.reason);
  if (moratoriumSheet.ok) {
    assert.equal(moratoriumSheet.state.faMarket?.offerSheets?.[0]?.status, "pending_match",
      "a moratorium offer sheet triggers the matching clock immediately");
  }
  const signingOpen = { ...preSigning, faMarket: { ...preSigning.faMarket!, stage: "open" as const } };
  assert.equal(projectFreeAgentResponse(signingOpen, rfa, 9, 2).legal, true,
    "the forecast must keep the offer sheet available in open signing");
  const noTender = { ...rfa, qoStatus: "eligible" as const };
  const noTenderLeague = { ...signingOpen, players: [noTender] };
  const untendered = projectFreeAgentResponse(noTenderLeague, noTender, 9, 2);
  assert.equal(untendered.legal, false,
    "the UI must not advertise sheets for an untendered qualifying offer");
  assert.match(untendered.reason ?? "", /tendered qualifying offer/i);
  assert.equal(submitOfferSheet(noTenderLeague, rfa.id, "bos", 9, 2).ok, false);
  const firstSheet = submitOfferSheet(signingOpen, rfa.id, "bos", 9, 2);
  assert.equal(firstSheet.ok, true, firstSheet.ok ? "" : firstSheet.reason);
  if (firstSheet.ok) {
    const pendingMatch = projectFreeAgentResponse(firstSheet.state, rfa, 10, 2);
    assert.equal(pendingMatch.legal, false,
      "a second RFA offer must be disabled while a match decision is pending");
    assert.match(pendingMatch.reason ?? "", /awaiting a match/i);
    assert.equal(submitOfferSheet(firstSheet.state, rfa.id, "bos", 10, 2).ok, false);
  }
  assert.equal(legalFreeAgentSalaryRange(league, rfa, 1).maxM, 0);
  assert.equal(submitOfferSheet(league, rfa.id, "bos", 9, 1).ok, false);
  const eliteRfa = player("elite-rfa-lowball", null, 90, 27,
    { rightsTeamId: "nyk", rightsKind: "restricted", qoStatus: "tendered" });
  const eliteLeague = { ...baseLeague([eliteRfa]),
    faMarket: { ...emptyFaMarket(57), stage: "moratorium" as const } };
  const cheapSheet = submitOfferSheet(eliteLeague, eliteRfa.id, "bos", 2.5, 2);
  assert.equal(cheapSheet.ok, false, "an elite RFA cannot sign a minimum offer sheet");
  if (!cheapSheet.ok) assert.match(cheapSheet.reason, /market value/);
  const own = { ...rfa, id: "bird-ui", rightsTeamId: "bos", rightsKind: "bird" as const };
  const birdLeague = { ...baseLeague([own]), faMarket: { ...emptyFaMarket(53), stage: "open" as const } };
  assert.equal(maxFreeAgentYears(birdLeague, own), 5);
  assert.equal(evaluateSigning(birdLeague, "bos", own, 9, 5).ok, true);
  const overCap = { ...league, players: [
    rfa,
    ...Array.from({ length: 14 }, (_, i) =>
      player("vet-" + i, "bos", 71, 29, {
        contract: { yearsRemaining: 2, annualSalaryM: 14, birdRights: "none", signedSeason: 2026 },
      })),
  ] };
  const depth = player("min-only", null, 70, 29);
  const depthLeague = { ...overCap, players: [...overCap.players, depth] };
  const minimum = legalFreeAgentSalaryRange(depthLeague, depth, 2).minM;
  assert.equal(evaluateSigning(depthLeague, "bos", depth, minimum, 2).ok, true);
  assert.equal(evaluateSigning(depthLeague, "bos", depth, minimum, 3).ok, false,
    "the minimum exception cannot be used for three-year deals");
}


// ——— Repeated full-market acceptance audit (six offseasons, distinct seeds).
// This is a controlled offer-response benchmark; the persistent five-year
// franchise audit separately tests player, roster and schedule continuity.
{
  const summaries: Array<{
    season: number; signed: number; eliteSigned: number;
    eliteUnsigned: number; weakInterest: number; fullInterest: number;
  }> = [];
  for (let year = 2027; year <= 2032; year++) {
    const roster = ["bos", "nyk", "det"].flatMap(teamId =>
      Array.from({ length: 12 }, (_, index) =>
        player(`${teamId}-${year}-${index}`, teamId, 70 + index % 8, 24 + index % 9, {
          contract: { yearsRemaining: 2, annualSalaryM: 3.2 + index * 0.15,
            birdRights: "none", signedSeason: year - 1 },
        }))
    );
    const ownStar = player(`home-star-${year}`, null, 87, 27 + (year % 3), {
      rightsTeamId: "bos", rightsKind: "bird", lastSalaryM: 30,
    });
    const awayStar = player(`away-star-${year}`, null, 86, 27 + (year % 4), {
      lastSalaryM: 28,
    });
    const candidates = [
      ownStar, awayStar,
      ...Array.from({ length: 12 }, (_, index) =>
        player(`available-${year}-${index}`, null, 71 + index % 12,
          23 + index % 10, { lastSalaryM: 3 + index * 1.5 }))
    ];
    const start = {
      ...baseLeague([...roster, ...candidates]),
      season: year,
      faMarket: { ...emptyFaMarket(year * 101), stage: "moratorium" as const, day: 0 },
      automation: { autoDraft: false, autoFreeAgency: false },
    };
    const ask = askingSalary(ownStar, start);
    const range = legalFreeAgentSalaryRange(start, ownStar, 4);
    assert.ok(range.maxM + 0.05 >= ask,
      `${year}: Bird home team must be allowed to meet the legal asking salary`);
    const bargain = Math.max(range.minM, Math.min(range.maxM, Math.round(ask * 0.25 * 100) / 100));
    const weak = projectFreeAgentResponse(start, ownStar, bargain, 4);
    const full = projectFreeAgentResponse(start, ownStar, ask, 4);
    assert.equal(weak.legal, true);
    assert.equal(full.legal, true);
    assert.ok(full.chance > weak.chance,
      `${year}: a much stronger legal offer should materially improve projected interest`);
    const lowOffer = userOfferFreeAgent(start, ownStar.id, bargain, 4);
    const afterLow = lowOffer.ok ? lowOffer.state : lowOffer.state ?? start;
    assert.equal(afterLow.players.find(p => p.id === ownStar.id)?.teamId, null,
      `${year}: an elite player must not sign for an extreme discount`);
    assert.ok(!(afterLow.faMarket?.agreements ?? []).some(o => o.playerId === ownStar.id),
      `${year}: an extreme lowball must not produce a verbal agreement`);
    const fairOffer = userOfferFreeAgent(afterLow, ownStar.id, ask, 4);
    assert.equal(fairOffer.ok, true, fairOffer.ok ? "" : fairOffer.reason);
    if (!fairOffer.ok) continue;
    assert.ok(fairOffer.state.faMarket?.agreements.some(o => o.playerId === ownStar.id),
      `${year}: near-ask Bird contract should reach a verbal agreement`);
    assert.equal(fairOffer.state.players.find(p => p.id === ownStar.id)?.teamId, null,
      `${year}: moratorium promises must not sign contracts immediately`);
    const final = runFaPeriod(fairOffer.state, 35);
    assert.equal(final.faMarket?.done, true, `${year}: free agency must finish`);
    const signedHome = final.players.find(p => p.id === ownStar.id)!;
    assert.equal(signedHome.teamId, "bos", `${year}: recorded verbal deal must become a signing`);
    assert.equal(signedHome.contract?.annualSalaryM, ask,
      `${year}: signed terms must match the player's accepted offer`);
    assert.equal(signedHome.contract?.yearsRemaining, 4);
    const signed = candidates.filter(p => final.players.find(row => row.id === p.id)?.teamId != null);
    const eliteSigned = signed.filter(p => (p.sheet?.overall ?? 0) >= 86).length;
    for (const candidate of candidates) {
      const result = final.players.find(p => p.id === candidate.id)!;
      if (result.teamId == null || (candidate.sheet?.overall ?? 0) < 86) continue;
      const salary = result.contract?.annualSalaryM ?? 0;
      const floor = askingSalary(candidate, start) * .8;
      assert.ok(salary + .06 >= floor,
        `${year}: elite player ${candidate.id} signed a deeply under-market contract`);
    }
    for (const team of final.teams) {
      assert.ok(final.players.filter(p => p.teamId === team.id).length <= final.settings.maxRoster,
        `${year}: ${team.id} exceeds the offseason market roster cap`);
    }
    summaries.push({
      season: year, signed: signed.length, eliteSigned,
      eliteUnsigned: candidates.filter(p =>
        (p.sheet?.overall ?? 0) >= 86 && final.players.find(row => row.id === p.id)?.teamId == null).length,
      weakInterest: weak.chance, fullInterest: full.chance,
    });
  }
  assert.equal(summaries.length, 6, "audit must cover all six free-agency periods");
  assert.ok(summaries.every(s => s.signed >= 1 && s.eliteSigned >= 1),
    "every period must resolve a premium legal offer into an actual signing");
  console.log("MULTI_PERIOD_FREE_AGENCY " + JSON.stringify(summaries));
}

console.log("gm free agency ok");
