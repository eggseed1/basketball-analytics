/**
 * Summer loop: contracts expire, the market opens, then a new year starts.
 * Aging happens once, on the way into free agency, so opening the next
 * season does not age the same roster again.
 */

import type { GmAutomation, GmLeagueState, GmPlayer, GmSignVia } from "@/gm/types";
import {
  advanceBirdRights,
  evaluateSigning,
  rosterCount,
  tickDeadMoney,
} from "@/gm/engine/cap";
import { developPlayers, finishDraftWithAi, offseasonJumpNote, playoffGamesByPlayer } from "@/gm/engine/progression";
import { autoSetLineup, overallOf } from "@/gm/engine/lineup";
import { ageStaff, coachEffect } from "@/gm/engine/staff";
import { cpuDeadlineTrades } from "@/gm/engine/trades";
import { generateSchedule, tradeDeadlineDay } from "@/gm/engine/schedule";
import { drawCupGroups, retieCupGroupGames } from "@/gm/engine/cup";
import { emptyStandings } from "@/gm/engine/standings";
import { createRng, clamp, uid } from "@/gm/engine/rng";
import { getCbaRules } from "@/gm/myleague/cba-registry";
import { createGeneratedLeague } from "@/gm/seed/create-league";
import {
  sealProspect,
  staffScoutContext,
} from "@/gm/engine/scouting";
import type { CBARules } from "@/gm/myleague/types";

export function automationOf(league: GmLeagueState): GmAutomation {
  return {
    autoDraft: league.automation?.autoDraft ?? false,
    autoFreeAgency: league.automation?.autoFreeAgency ?? true,
  };
}

export function settingsForSeason(
  season: number,
  prev: GmLeagueState["settings"]
): GmLeagueState["settings"] {
  const rules = getCbaRules(season);
  return {
    ...prev,
    salaryCapM: rules.salaryCapM > 0 ? rules.salaryCapM : prev.salaryCapM,
    luxuryTaxM: rules.luxuryTaxM > 0 ? rules.luxuryTaxM : prev.luxuryTaxM,
    firstApronM: rules.firstApronM ?? prev.firstApronM,
    secondApronM: rules.secondApronM ?? prev.secondApronM,
    maxRoster: rules.maxRoster || prev.maxRoster,
    minRoster: rules.minRoster || prev.minRoster,
  };
}

function news(
  league: GmLeagueState,
  headline: string,
  body: string,
  tone: GmLeagueState["news"][number]["tone"] = "info"
) {
  return {
    id: uid("news"),
    day: league.day,
    season: league.season,
    headline,
    body,
    tone,
  };
}

/** One year comes off the deal. Team options on useful players are picked up. Stars decline player options. */
function resolveExpiredDeal(player: GmPlayer): GmPlayer {
  const contract = player.contract;
  if (!contract || player.teamId == null) return player;
  if (contract.yearsRemaining > 0) return player;

  if (contract.option === "team" && overallOf(player) >= 76) {
    return {
      ...player,
      contract: { ...contract, yearsRemaining: 1, option: null },
    };
  }
  if (contract.option === "player" && overallOf(player) < 81) {
    return {
      ...player,
      contract: { ...contract, yearsRemaining: 1, option: null },
    };
  }
  const rights =
    contract.birdRights === "bird" || contract.birdRights === "early"
      ? contract.birdRights
      : null;
  return {
    ...player,
    teamId: null,
    contract: null,
    rightsTeamId: rights ? player.teamId : null,
    rightsKind: rights ?? undefined,
    lastSalaryM: rights ? contract.annualSalaryM : undefined,
  };
}

function restoreRookieYear(player: GmPlayer, draftSeason: number): GmPlayer {
  if (player.draftYear !== draftSeason || !player.contract) return player;
  return {
    ...player,
    contract: {
      ...player.contract,
      yearsRemaining: player.contract.yearsRemaining + 1,
    },
  };
}

/**
 * Finish a draft that is already over, age the league once, and open the market.
 * Safe to call when the phase is already free agency.
 */
export function enterFreeAgency(state: GmLeagueState): GmLeagueState {
  if (state.phase === "free_agency") return state;

  const drafted =
    state.draftPool.length > 0 ? finishDraftWithAi(state) : state;
  const coachByTeam = Object.fromEntries(
    drafted.teams.map((team) => [team.id, coachEffect(team).development])
  );
  const aged = developPlayers(
    drafted.players,
    true,
    coachByTeam,
    playoffGamesByPlayer(drafted)
  ).map((player) => restoreRookieYear(resolveExpiredDeal(player), drafted.season));
  const jumps = offseasonJumpNote(drafted.players, aged, drafted);
  const freeAgents = aged
    .filter((player) => player.teamId == null)
    .map((player) => player.id);
  const released = freeAgents.length;

  return {
    ...drafted,
    phase: "free_agency",
    players: aged,
    freeAgents,
    draftPool: [],
    teams: drafted.teams.map((team) => ageStaff(autoSetLineup(team, aged))),
    news: [
      news(
        drafted,
        "Free agency is open",
        `${released} players are on the market. Expiring deals are cleared. Team options on useful players were picked up. Stars declined player options.`
      ),
      ...(jumps ? [jumps] : []),
      ...drafted.news,
    ].slice(0, 50),
  };
}

function askingSalary(player: GmPlayer, rules: CBARules): number {
  const max = rules.maxSalaryM || Math.max(5, rules.salaryCapM * 0.35);
  const min = rules.minSalaryM || Math.max(0.5, rules.salaryCapM * 0.008);
  const like = (overallOf(player) - 76) / 2.35;
  const t = clamp((like + 1.5) / 8, 0, 1);
  return Math.round((min + (max - min) * t * t) * 100) / 100;
}

function askingYears(player: GmPlayer, rules: CBARules): number {
  const overall = overallOf(player);
  const years = overall >= 85 ? 4 : overall >= 81 ? 3 : overall >= 76 ? 2 : 1;
  return clamp(years, 1, rules.maxContractYears || 5);
}

/** Other clubs fill out rosters. The user's club signs only when includeUser is set. */
export function runCpuFreeAgency(
  state: GmLeagueState,
  opts: { includeUser: boolean }
): GmLeagueState {
  const rules = getCbaRules(state.season);
  let players = state.players.map((player) => ({ ...player }));
  const headlines: string[] = [];

  const order = [...state.teams].sort(
    (a, b) => rosterCount(a.id, players) - rosterCount(b.id, players)
  );

  for (const team of order) {
    if (!opts.includeUser && team.id === state.userTeamId) continue;
    let guard = 0;
    while (guard < 10) {
      guard += 1;
      const size = rosterCount(team.id, players);
      if (size >= state.settings.maxRoster) break;
      const mustFill = size < state.settings.minRoster;
      const pool = players
        .filter((player) => player.teamId == null)
        .sort((a, b) => overallOf(b) - overallOf(a));
      if (!pool.length) break;

      let choice: GmPlayer | undefined;
      let salary = 0;
      let years = 1;
      let via: GmSignVia = "room";
      const snapshot = { ...state, players, teams: state.teams };
      for (const player of pool) {
        const ask = askingSalary(player, rules);
        const yearsTry = askingYears(player, rules);
        const verdict = evaluateSigning(snapshot, team.id, player, ask, yearsTry);
        if (verdict.ok) {
          choice = player;
          salary = ask;
          years = yearsTry;
          via = verdict.via;
          break;
        }
      }
      if (!choice && mustFill && pool[0]) {
        const min = Math.max(rules.minSalaryM || 1, state.settings.salaryCapM * (2.087 / 140.588));
        const verdict = evaluateSigning(snapshot, team.id, pool[0], min, 1);
        if (verdict.ok) {
          choice = pool[0];
          salary = min;
          years = 1;
          via = verdict.via;
        }
      }
      if (!choice) break;
      const annual = Math.round(salary * 100) / 100;
      const signedId = choice.id;
      players = players.map((player) =>
        player.id === signedId
          ? {
              ...player,
              teamId: team.id,
              identityRevealed: true,
              rightsTeamId: null,
              rightsKind: undefined,
              lastSalaryM: undefined,
              contract: {
                yearsRemaining: years,
                annualSalaryM: annual,
                birdRights: "none" as const,
                signedSeason: state.season,
                signedVia: via ?? "room",
              },
            }
          : player
      );
      if (overallOf(choice) >= 80 && headlines.length < 8) {
        headlines.push(
          `${team.city} ${team.name} sign ${choice.name}, ${years} years, $${annual.toFixed(1)}M`
        );
      }
    }
  }

  const freeAgents = players
    .filter((player) => player.teamId == null)
    .map((player) => player.id);

  return {
    ...state,
    players,
    freeAgents,
    teams: state.teams.map((team) => autoSetLineup(team, players)),
    news: [
      ...headlines.map((headline) =>
        news(state, headline, "Offseason signing.", "good")
      ),
      news(
        state,
        "The league has made its signings",
        `${freeAgents.length} players are still unsigned.`
      ),
      ...state.news,
    ].slice(0, 50),
  };
}

/** New schedule, new cap, new draft class. Contracts were already ticked in free agency. */
export function startNextSeason(state: GmLeagueState): GmLeagueState {
  const summer =
    state.phase === "free_agency" ? state : enterFreeAgency(state);
  const filled = runCpuFreeAgency(summer, { includeUser: false });
  const season = filled.season + 1;
  const settings = settingsForSeason(season, filled.settings);
  const fresh = createGeneratedLeague({
    userTeamId: filled.userTeamId,
    season,
    seed: season * 997,
  });
  const { scout: userScout, level: userLevel } = staffScoutContext(filled);
  const rng = createRng(season * 9973);
  const prospects = fresh.players
    .filter((player) => fresh.draftPool.includes(player.id))
    .map((player, index) => sealProspect(player, userLevel, index, rng, userScout));
  const carried = advanceBirdRights(
    filled.players.filter(
      (player) => player.teamId != null || filled.freeAgents.includes(player.id)
    ),
    season
  ).map((player) => ({
    ...player,
    priorLine: player.seasonLine && player.seasonLine.gp > 0 ? player.seasonLine : player.priorLine,
    seasonLine: undefined,
    seasonPossessions: undefined,
  }));
  const players = [...carried, ...prospects];
  const teams = filled.teams
    .map((team) => tickDeadMoney(team))
    .map((team) => autoSetLineup(team, players));
  const priorWins = Object.fromEntries(
    filled.teams.map((team) => [team.id, filled.standings[team.id]?.wins ?? 0])
  );
  const cupGroups = drawCupGroups(teams, priorWins);

  return {
    ...filled,
    season,
    day: 0,
    phase: "regular",
    settings,
    players,
    teams,
    freeAgents: players
      .filter((player) => player.teamId == null && !fresh.draftPool.includes(player.id))
      .map((player) => player.id),
    schedule: retieCupGroupGames(generateSchedule(teams, season, season * 997), cupGroups, season),
    priorWins,
    cupGroups,
    allStar: undefined,
    standings: emptyStandings(teams),
    boxScores: [],
    playoffBracket: undefined,
    draftPool: fresh.draftPool,
    scoutMarket: fresh.scoutMarket ?? filled.scoutMarket,
    lotteryOrder: undefined,
    draftPickIndex: 0,
    userDraftBoard: undefined,
    combineDone: false,
    tradeDeadlinePassed: false,
    incomingOffer: undefined,
    news: [
      news(
        { ...filled, season, day: 0 },
        `${season - 1}-${String(season).slice(2)} tips off`,
        `Cap is $${settings.salaryCapM.toFixed(1)}M. Tax line is $${settings.luxuryTaxM.toFixed(1)}M.`
      ),
    ],
    tradeLog: [],
  };
}

export function noteTradeDeadline(league: GmLeagueState): GmLeagueState {
  if (league.tradeDeadlinePassed || league.phase !== "regular") return league;
  const deadline = tradeDeadlineDay(league.schedule);
  if (league.day < deadline) return league;
  const traded = cpuDeadlineTrades(league);
  const deals = traded.tradeLog.length - league.tradeLog.length;
  const closed =
    deals > 0
      ? `${deals} deal${deals === 1 ? "" : "s"} went through this morning. Your players stayed.`
      : "No deals. Rosters are locked until the offseason.";
  return {
    ...traded,
    tradeDeadlinePassed: true,
    news: [
      news(traded, "The trade deadline is closed", closed),
      ...traded.news,
    ].slice(0, 50),
  };
}

export function signingAllowed(
  league: GmLeagueState,
  playerId: string,
  salaryM: number,
  years: number
): { ok: true; via: GmSignVia } | { ok: false; reason: string } {
  const player = league.players.find((row) => row.id === playerId);
  if (!player) return { ok: false, reason: "Player not found." };
  return evaluateSigning(league, league.userTeamId, player, salaryM, years);
}
