/**
 * Summer loop: contracts expire, the market opens, then a new year starts.
 * Aging happens once, on the way into free agency, so opening the next
 * season does not age the same roster again.
 */

import { archiveSeason } from "@/gm/engine/franchise";
import { financialSettings } from "@/gm/engine/season-flow-state";
import { advanceContractYear } from "@/gm/seed/real-books";
import type { GmAutomation, GmLeagueState, GmPlayer, GmSignVia } from "@/gm/types";
import {
  advanceBirdRights,
  evaluateSigning,
  tickDeadMoney,
} from "@/gm/engine/cap";
import { developPlayers, finishDraftWithAi, offseasonJumpNote, playoffGamesByPlayer } from "@/gm/engine/progression";
import { autoSetLineup, overallOf } from "@/gm/engine/lineup";
import { ageStaff, coachEffect } from "@/gm/engine/staff";
import { cpuDeadlineTrades } from "@/gm/engine/trades";
import { generateSchedule, tradeDeadlineDay } from "@/gm/engine/schedule";
import { drawCupGroups, retieCupGroupGames } from "@/gm/engine/cup";
import { emptyStandings } from "@/gm/engine/standings";
import { createRng, uid } from "@/gm/engine/rng";
import { getCbaRules } from "@/gm/myleague/cba-registry";
import { createGeneratedLeague } from "@/gm/seed/create-league";
import {
  sealProspect,
  staffScoutContext,
} from "@/gm/engine/scouting";
import { emptyFaMarket, runFaPeriod } from "@/gm/engine/free-agency";

export function automationOf(league: GmLeagueState): GmAutomation {
  return {
    autoDraft: league.automation?.autoDraft ?? false,
    autoFreeAgency: league.automation?.autoFreeAgency ?? false,
    autoScout: league.automation?.autoScout ?? false,
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

/**
 * After the contract year ticks, players with an unresolved option stay on
 * the roster for the options desk. Everyone else with no years left hits FA
 * with Bird/early rights when applicable.
 */
function releaseExpiredWithoutOption(player: GmPlayer): GmPlayer {
  const contract = player.contract;
  if (!contract || player.teamId == null) return player;
  if (contract.yearsRemaining > 0) return player;
  if (contract.option === "team" || contract.option === "player") {
    // Leave for the options stage.
    return player;
  }
  const rights =
    contract.birdRights === "bird" || contract.birdRights === "early"
      ? contract.birdRights
      : null;
  return {
    ...player,
    teamId: null,
    contract: null,
    rightsTeamId: player.teamId,
    rightsStartSeason: contract.birdStartSeason ?? contract.signedSeason,
    rightsKind: rights ?? undefined,
    lastSalaryM: contract.annualSalaryM,
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

/** Soft ceiling on unsigned bodies so the market does not grow forever. */
const MAX_UNSIGNED_FREE_AGENTS = 180;

/**
 * Aging fringe free agents leave the game. Stars hang around longer.
 * Keep enough mid-20s minimum guys around so rosters still fill.
 */
export function shouldRetireUnsigned(player: GmPlayer): boolean {
  if (player.teamId != null) return false;
  const ovr = overallOf(player);
  const age = player.age;
  if (ovr >= 80) return age >= 40;
  if (ovr >= 76) return age >= 37;
  if (ovr >= 72) return age >= 35;
  if (ovr >= 68) return age >= 34;
  if (ovr >= 64) return age >= 32;
  if (ovr >= 60) return age >= 30;
  return age >= 28;
}

/** Only the clearly finished careers — used before FA so depth can still sign. */
export function shouldRetireBeforeMarket(player: GmPlayer): boolean {
  if (player.teamId != null) return false;
  const ovr = overallOf(player);
  const age = player.age;
  if (ovr >= 78) return age >= 39;
  if (ovr >= 72) return age >= 36;
  return age >= 34 && ovr < 70;
}

/**
 * Drop retired / surplus unsigned free agents from the player list.
 * Keeps rostered players untouched.
 */
export function cullUnsignedFreeAgents(
  players: GmPlayer[],
  opts?: { soft?: boolean }
): {
  players: GmPlayer[];
  retired: GmPlayer[];
} {
  const retire = opts?.soft ? shouldRetireBeforeMarket : shouldRetireUnsigned;
  const retired: GmPlayer[] = [];
  let kept = players.filter((player) => {
    if (!retire(player)) return true;
    retired.push(player);
    return false;
  });

  // Soft cap only on the post-market pass so FA still has bodies to sign.
  if (!opts?.soft) {
    const unsigned = kept.filter((player) => player.teamId == null);
    if (unsigned.length > MAX_UNSIGNED_FREE_AGENTS) {
      const dropCount = unsigned.length - MAX_UNSIGNED_FREE_AGENTS;
      const weakest = [...unsigned].sort((a, b) => {
        const score = (player: GmPlayer) =>
          overallOf(player) * 2 - Math.max(0, player.age - 24);
        return score(a) - score(b);
      });
      const drop = new Set(weakest.slice(0, dropCount).map((player) => player.id));
      kept = kept.filter((player) => {
        if (!drop.has(player.id)) return true;
        retired.push(player);
        return false;
      });
    }
  }

  return { players: kept, retired };
}

/**
 * Finish a draft that is already over, age the league once, and open the market.
 * Safe to call when the phase is already free agency.
 */
export function enterFreeAgency(state: GmLeagueState): GmLeagueState {
  if (state.phase === "free_agency") return state;
  if (state.seasonFlow) {
    const flow = state.seasonFlow;
    if (flow.stage !== "free_agency" || state.players.some(player => player.pendingRookieContract)) return state;
    state = archiveSeason(state);
    if (flow.contractsRolled) return { ...state, phase: "free_agency", faMarket: state.faMarket ?? emptyFaMarket(state.season * 7919) };
    const season = state.season + 1;
    const rolled = advanceBirdRights(state.players.map(player => {
      if (player.draftYear === state.season) return { ...player, identityRevealed: true };
      let contract = player.contract;
      if (contract) {
        contract = advanceContractYear(contract);
        if (contract.extension && season >= contract.extension.startsSeason) contract = {
          ...contract, signedSeason: contract.extension.startsSeason,
          originalYears: contract.extension.years, extension: undefined,
        };
      }
      return { ...player, age: player.age + 1,
        serviceYears: player.teamId ? (player.serviceYears ?? Math.max(0, player.age - 19)) + 1 : player.serviceYears,
        contract, qoStatus: undefined, qoAmountM: undefined };
    }), season).map(releaseExpiredWithoutOption);
    const { players, retired } = cullUnsignedFreeAgents(rolled, { soft: true });
    return { ...state, phase: "free_agency", financialSeason: season,
      settings: financialSettings(season, state.settings), players, draftPool: [],
      teams: state.teams.map(team => autoSetLineup(tickDeadMoney(team), players)),
      freeAgents: players.filter(player => player.teamId == null && player.rightsKind !== "exclusive_draft").map(player => player.id),
      faMarket: emptyFaMarket(state.season * 7919 + state.day),
      seasonFlow: { ...flow, contractsRolled: true, deadMoneyRolled: true, retiredPlayers: retired.map(player => ({
        id: player.id, name: player.name, age: player.age, overall: overallOf(player),
      })) },
      news: [news(state, "Contract decisions open", "The new cap year is " + season + ". Resolve options and qualifying offers, then negotiate with your own free agents."), ...state.news].slice(0, 50),
    };
  }

  state = archiveSeason(state);
  const drafted =
    state.draftPool.length > 0 ? finishDraftWithAi(state) : state;
  const coachByTeam = Object.fromEntries(
    drafted.teams.map((team) => [team.id, coachEffect(team).development])
  );
  const developerByTeam = Object.fromEntries(
    drafted.teams.map((team) => [
      team.id,
      team.staff.developer
        ? { knack: team.staff.developer.knack, touch: team.staff.developer.touch }
        : null,
    ])
  );
  const aged = developPlayers(
    drafted.players,
    true,
    coachByTeam,
    playoffGamesByPlayer(drafted),
    developerByTeam,
    drafted.settings.developmentSpeed ?? 1
  ).map((player) =>
    restoreRookieYear(releaseExpiredWithoutOption(player), drafted.season)
  );
  // Light pass only — leave the cheap veterans on the market for roster fill.
  const { players: culled, retired } = cullUnsignedFreeAgents(aged, { soft: true });
  const jumps = offseasonJumpNote(drafted.players, culled, drafted);
  const freeAgents = culled
    .filter((player) => player.teamId == null)
    .map((player) => player.id);
  const released = freeAgents.length;
  const retirementNote =
    retired.length > 0
      ? news(
          drafted,
          "Careers end",
          `${retired.length} unsigned player${retired.length === 1 ? "" : "s"} left the game instead of hanging on the market.`
        )
      : null;

  return {
    ...drafted,
    phase: "free_agency",
    players: culled,
    freeAgents,
    draftPool: [],
    faMarket: emptyFaMarket(drafted.season * 7919 + drafted.day),
    teams: drafted.teams.map((team) => ageStaff(autoSetLineup(team, culled))),
    news: [
      news(
        drafted,
        "Offseason desk opens",
        `${released} players are already unsigned. Resolve contract options and qualifying offers first; the moratorium follows.`
      ),
      ...(retirementNote ? [retirementNote] : []),
      ...(jumps ? [jumps] : []),
      ...drafted.news,
    ].slice(0, 50),
  };
}

/**
 * Run the MyNBA free-agency clock (moratorium → open → fill).
 * CPU clubs bid; the user club is left alone unless includeUser is set
 * (includeUser still uses the same day loop; user offers come from the desk).
 */
export function runCpuFreeAgency(
  state: GmLeagueState,
  _opts: { includeUser: boolean }
): GmLeagueState {
  const summer =
    state.phase === "free_agency"
      ? { ...state, faMarket: state.faMarket ?? emptyFaMarket() }
      : enterFreeAgency(state);
  return runFaPeriod(summer);
}

/** New schedule, new cap, new draft class. Contracts were already ticked in free agency. */
export function startNextSeason(state: GmLeagueState): GmLeagueState {
  if (state.seasonFlow && !state.seasonFlow.readyForTip) return state;
  const summer =
    state.phase === "free_agency" ? state : enterFreeAgency(state);
  const filled = state.seasonFlow ? state : runCpuFreeAgency(summer, { includeUser: false });
  // Anyone still unsigned after the market closes gets one more retirement pass
  // so undrafted leftovers and ignored vets do not pile up year after year.
  const { players: thinned } = cullUnsignedFreeAgents(filled.players);
  const openIds = new Set(
    thinned.filter((player) => player.teamId == null).map((player) => player.id)
  );
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
    thinned.filter(
      (player) => player.teamId != null || openIds.has(player.id)
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
    .map((team) => filled.seasonFlow?.deadMoneyRolled ? team : tickDeadMoney(team))
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
    seasonFlow: state.seasonFlow ? { version: 1, season, completed: [] } : undefined,
    financialSeason: undefined, playIn: undefined, devMarks: undefined, draftOrder: undefined,
    settings,
    players,
    teams,
    freeAgents: players
      .filter((player) => player.teamId == null && !fresh.draftPool.includes(player.id))
      .map((player) => player.id),
    schedule: retieCupGroupGames(generateSchedule(teams, season, season * 997), cupGroups, season),
    priorWins,
    champion: undefined,
    awards: undefined,
    homeFlow: undefined,
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
    declinedOffers: [],
    lastOfferResolvedDay: undefined,
    teamBuildingCheckpoint: undefined,
    seenCheckpoints: [],
    checkpointSnooze: undefined,
    scoutingFocusPrompt: undefined,
    scoutingFocus: undefined,
    seenScoutingMonths: [],
    faMarket: undefined,
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
  // Wait until the user has answered the team-building pause.
  if (league.teamBuildingCheckpoint?.kind === "trade_deadline") return league;
  if (!(league.seenCheckpoints ?? []).includes("trade_deadline")) return league;
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

