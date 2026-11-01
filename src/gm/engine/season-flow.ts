import { resolveDraftOrder } from "@/gm/engine/draft-order";
import type { GmLeagueState, GmOffseasonStage, GmPlayer } from "@/gm/types";
import { archiveSeason } from "@/gm/engine/franchise";
import { flowOf, normalizeSeasonFlow, offseasonRosterLimit } from "@/gm/engine/season-flow-state";
import { ageStaff } from "@/gm/engine/staff";
import { computeLotteryOrder } from "@/gm/engine/standings";
import { isDraftComplete } from "@/gm/engine/draft-room";
import { autoSetLineup } from "@/gm/engine/lineup";
import { rosterCount } from "@/gm/engine/cap";
import { automationOf, enterFreeAgency, startNextSeason } from "@/gm/engine/offseason";
import { advanceFaDayDetailed } from "@/gm/engine/free-agency";
import { finishDraftWithAi } from "@/gm/engine/progression";
import { applySeasonProgression, applyTrainingCamp } from "@/gm/engine/season-development";
import { cutCpuRosters } from "@/gm/engine/roster-decisions";

export type JourneyResult = { state: GmLeagueState; ok: boolean; reason: string };
const result = (state: GmLeagueState, reason: string, ok = true): JourneyResult => ({ state, reason, ok });

export function beginOffseason(state: GmLeagueState): GmLeagueState {
  if (!state.champion && state.phase !== "offseason") return state;
  const league = normalizeSeasonFlow(state);
  if (league.seasonFlow?.stage) return league;
  return archiveSeason({ ...league, phase: "offseason", homeFlow: { ...league.homeFlow, awardsSeen: true, championSeen: true }, teamBuildingCheckpoint: undefined, checkpointSnooze: undefined, incomingOffer: undefined, scoutingFocusPrompt: undefined, seasonFlow: { version: 1, season: league.season, stage: "review", completed: [] } });
}

function moveStage(league: GmLeagueState, stage: GmOffseasonStage): GmLeagueState {
  const flow = flowOf(league);
  return { ...league, phase: stage === "draft" ? "draft" : stage === "free_agency" ? "free_agency" : "offseason", seasonFlow: { ...flow, stage, completed: [...new Set([...flow.completed, ...(flow.stage ? [flow.stage] : [])])] } };
}

export function pendingRookies(league: GmLeagueState): GmPlayer[] { return league.players.filter(player => player.pendingRookieContract && player.teamId === league.userTeamId); }

export function decideRookieContract(league: GmLeagueState, playerId: string, sign: boolean): JourneyResult {
  if (flowOf(league).stage !== "rookie_signing") return result(league, "Rookie contracts open after draft night.", false);
  const player = pendingRookies(league).find(row => row.id === playerId);
  if (!player) return result(league, "No unsigned rookie contract for this player.", false);
  if (sign && rosterCount(league.userTeamId, league.players) > offseasonRosterLimit(league)) return result(league, "Release a player before signing another camp contract.", false);
  const players = league.players.map(row => row.id !== playerId ? row : { ...row, pendingRookieContract: undefined, contract: sign ? row.pendingRookieContract! : null, teamId: sign ? row.teamId : null, rightsTeamId: null, rightsKind: undefined });
  return result({ ...league, players, freeAgents: sign ? league.freeAgents.filter(id => id !== playerId) : [...new Set([...league.freeAgents, playerId])], teams: league.teams.map(team => team.id === league.userTeamId ? autoSetLineup(team, players) : team) }, sign ? player.name + " signed at rookie scale." : "Released " + player.name + "'s draft rights.");
}

export type OpeningRosterIssue = { kind: "minimum" | "maximum" | "healthy" | "rookies" | "market" | "matches" | "agreements"; message: string };

export function openingRosterChecks(league: GmLeagueState): OpeningRosterIssue[] {
  const size = rosterCount(league.userTeamId, league.players);
  const healthy = league.players.filter(player => player.teamId === league.userTeamId && player.contract && !player.injury).length;
  const issues: OpeningRosterIssue[] = [];
  if (size < league.settings.minRoster) issues.push({ kind: "minimum", message: "Sign " + (league.settings.minRoster - size) + " more standard player(s)." });
  if (size > league.settings.maxRoster) issues.push({ kind: "maximum", message: "Release " + (size - league.settings.maxRoster) + " player(s) to reach " + league.settings.maxRoster + "." });
  if (healthy < 5) issues.push({ kind: "healthy", message: "At least five healthy contracted players are needed to tip off." });
  if (pendingRookies(league).length) issues.push({ kind: "rookies", message: "Resolve unsigned rookie contracts." });
  if (!league.faMarket?.done) issues.push({ kind: "market", message: "Finish the free-agency window." });
  if (league.faMarket?.offerSheets?.some(sheet => sheet.status === "pending_match")) issues.push({ kind: "matches", message: "Resolve pending restricted free-agent matches." });
  if (league.faMarket?.agreements.length) issues.push({ kind: "agreements", message: "Finalize remaining verbal agreements." });
  return issues;
}

export function openingRosterIssues(league: GmLeagueState): string[] {
  return openingRosterChecks(league).map(issue => issue.message);
}

export function reopenRosterFill(league: GmLeagueState): JourneyResult {
  const flow = flowOf(league);
  if (flow.stage !== "roster_check") return result(league, "Late roster fill opens at the opening-night check.", false);
  const config = league.faMarket?.config ?? { moratoriumTicks: 3, openTicks: 12, fillTicks: 4, rfaMatchTicks: 2 };
  return result({ ...league, phase: "free_agency", seasonFlow: { ...flow, stage: "free_agency", returnFromMarket: "roster_check" }, faMarket: { agreements: [], pending: [], recap: [], ...league.faMarket, config, done: false, stage: "fill", day: config.moratoriumTicks + config.openTicks } }, "Late roster fill is open. Development and camp results are kept.");
}

/** One explicit handoff. Required decisions stop here. Page visits never advance. */
export function advanceSeasonJourney(input: GmLeagueState): JourneyResult {
  let league = normalizeSeasonFlow(input);
  if (!league.seasonFlow?.stage) {
    if (!league.champion) return result(league, "Finish the season and the Finals before opening summer.", false);
    league = beginOffseason(league);
    return result(league, "Season review is open.");
  }
  const flow = flowOf(league);
  switch (flow.stage) {
    case "review": {
      const teams = flow.staffAged ? league.teams : league.teams.map(ageStaff);
      return result(moveStage({ ...archiveSeason(league), teams, seasonFlow: { ...flow, staffAged: true } }, "staff"), "Review staff contracts before scouting begins.");
    }
    case "staff": {
      const teams = league.teams.map(team => ({ ...team, staff: { ...team.staff, headCoach: team.staff.headCoach.walkYear ? { ...team.staff.headCoach, yearsLeft: 3, walkYear: false } : team.staff.headCoach, associate: team.staff.associate?.walkYear ? { ...team.staff.associate, yearsLeft: 2, walkYear: false } : team.staff.associate } }));
      const lotteryOrder = league.lotteryOrder ?? computeLotteryOrder(league);
      return result(moveStage({ ...league, teams, lotteryOrder, ...resolveDraftOrder(league, lotteryOrder) }, "lottery"), "Draft lottery results are ready.");
    }
    case "lottery": return result(moveStage(league, "scouting"), "Review combine measurements and spend scouting looks before the draft.");
    case "scouting": {
      let draft = moveStage(league, "draft");
      if (automationOf(draft).autoDraft) draft = finishDraftWithAi(draft);
      return result(draft, "Draft night is open. Review the board before continuing.");
    }
    case "draft": {
      if (!isDraftComplete(league)) return result(league, "Make your picks or delegate the remaining draft before continuing.", false);
      const players = league.players.map(player => player.teamId !== league.userTeamId && player.pendingRookieContract ? { ...player, contract: player.pendingRookieContract, pendingRookieContract: undefined } : player);
      return result(moveStage({ ...league, players }, "rookie_signing"), "Review rookie contracts before free agency.");
    }
    case "rookie_signing": {
      if (pendingRookies(league).length) return result(league, "Sign or release each unsigned rookie before opening free agency.", false);
      const players = league.players.map(player => player.teamId !== league.userTeamId && player.pendingRookieContract ? { ...player, contract: player.pendingRookieContract, pendingRookieContract: undefined } : player);
      return result(enterFreeAgency({ ...moveStage({ ...league, players }, "free_agency"), phase: "offseason" }), "Options open first. Progression and camp follow free agency.");
    }
    case "free_agency": {
      if (!league.faMarket?.done) {
        const tick = advanceFaDayDetailed(league);
        return result(tick.state, tick.blocked?.reason ?? "Advanced one contract or market window.", !tick.blocked);
      }
      if (league.faMarket.offerSheets?.some(sheet => sheet.status === "pending_match") || league.faMarket.agreements.length) return result(league, "Resolve pending matches and agreements at the free-agency desk.", false);
      if (flow.returnFromMarket) return result({ ...league, phase: "offseason", seasonFlow: { ...flow, stage: flow.returnFromMarket, returnFromMarket: undefined } }, "Roster fill is complete. Return to the opening-night check.");
      return result(applySeasonProgression(moveStage(league, "progression")), "Annual progression is ready to review.");
    }
    case "progression": return result(moveStage(applySeasonProgression(league), "summer_league"), "Evaluate young players or skip the optional summer games.");
    case "summer_league":
      if (!flow.summerLeague) return result(league, "Simulate the summer games or choose Skip summer league.", false);
      return result(moveStage(league, "training_camp"), "Assign focused camps. Each club has the same slot rules.");
    case "training_camp":
      if (!flow.campResults) return result(applyTrainingCamp(league), "Camp is complete. Review the gains, then check your roster.");
      return result(cutCpuRosters(moveStage(league, "roster_check")), "Check roster limits and the rotation before opening night.");
    case "roster_check": {
      const issues = openingRosterIssues(league);
      if (issues.length) return result(league, issues.join(" "), false);
      return result(startNextSeason({ ...league, seasonFlow: { ...flow, readyForTip: true } }), "The new season has started.");
    }
    default: return result(league, "Open the season hub to continue.", false);
  }
}
