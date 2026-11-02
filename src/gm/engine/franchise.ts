import { pairCpuMentors } from "@/gm/engine/development";
import { ensureBadges } from "@/gm/engine/badges";
import { ensureDraftPickHorizon } from "@/gm/engine/draft-order";
import type { GmFranchisePlan, GmLeagueState, GmPlayer, GmSeasonArchive } from "@/gm/types";
import { sealProspect, staffScoutContext } from "@/gm/engine/scouting";
import { clamp, createRng } from "@/gm/engine/rng";
import { ensurePlayerSheet } from "@/gm/engine/attributes";
import { ensureSimProfile, playerRoles } from "@/gm/engine/player-profile";
import { normalizeSeasonFlow } from "@/gm/engine/season-flow-state";

export function franchisePlan(league: GmLeagueState): GmFranchisePlan {
  const team = league.teams.find(t => t.id === league.userTeamId)!;
  const roster = league.players.filter(p => p.teamId === team.id);
  const top = [...roster].sort((a, b) => b.ratings.impact - a.ratings.impact).slice(0, 8);
  const strength = top.reduce((n, p) => n + p.ratings.impact, 0) / Math.max(1, top.length);
  return {
    intent: strength > 1.3 ? "contend" : strength < 0 ? "develop" : "retool",
    priorities: [], targetWins: Math.round(clamp(41 + strength * 5, 24, 60)),
    ownerPressure: false, commissioner: false,
    ...league.franchise,
    pauses: { offers: true, scouting: true, injuries: true, ...league.franchise?.pauses },
  };
}

/** Additive migration. Existing identities, attributes, rotations and results remain authoritative. */
export function prepareFranchise(league: GmLeagueState): GmLeagueState {
  const players = league.players.map(p => { const player=ensureBadges(ensureSimProfile(ensurePlayerSheet(p))); const index=league.draftPool.indexOf(p.id); return index>=0&&player.consensusRank==null?{...player,consensusRank:index+1}:player; });
  const prepared = pairCpuMentors(normalizeSeasonFlow(ensureDraftPickHorizon({ ...league, players, simulationBook: 1, franchise: franchisePlan({ ...league, players }), history: league.history ?? [] })));
  const flow = prepared.seasonFlow;
  if (flow?.stage === "training_camp" && !flow.campResults && Object.keys(flow.campAssignments ?? {}).length > 2) {
    return { ...prepared, seasonFlow: { ...flow, campAssignments: Object.fromEntries(Object.entries(flow.campAssignments ?? {}).slice(0, 2)) } };
  }
  return prepared;
}

export function archiveSeason(league: GmLeagueState): GmLeagueState {
  if (league.history?.some(year => year.season === league.season)) return league;
  const season: GmSeasonArchive = {
    season: league.season, champion: league.champion, awards: league.awards,
    standings: league.standings, trades: league.tradeLog, userTeamId: league.userTeamId,
    players: league.players.filter(p => !league.draftPool.includes(p.id)).map(p => ({ id: p.id, name: p.name, teamId: p.teamId, age: p.age, overall: p.sheet?.overall ?? 72, line: p.seasonLine })),
  };
  const plan = franchisePlan(league);
  const wins = league.standings[league.userTeamId]?.wins ?? 0;
  const teams = !plan.ownerPressure ? league.teams : league.teams.map(team => team.id === league.userTeamId ? { ...team, ownerPatience: clamp(team.ownerPatience + (wins - plan.targetWins) * 2, 0, 100) } : team);
  return { ...league, teams, history: [...(league.history ?? []), season] };
}

export function franchiseNeeds(league: GmLeagueState): string[] {
  const roster = league.players.filter(p => p.teamId === league.userTeamId && !p.injury);
  const roles = roster.map(playerRoles);
  const needs: string[] = [];
  if (roles.filter(r => r.creation >= 0.65).length < 2) needs.push("A second creator to lead the bench");
  if (roles.filter(r => r.spacing >= 0.55).length < 4) needs.push("More shooting around the core");
  if (roles.filter(r => r.interior >= 0.7).length < 2) needs.push("Interior defense behind the starting big");
  if (roster.filter(p => p.age <= 23).length < 2 && franchisePlan(league).intent === "develop") needs.push("Young players with a path to minutes");
  return needs.length ? needs : ["Keep the rotation healthy and preserve flexibility"];
}

export function exportFranchise(league: GmLeagueState): string {
  return JSON.stringify({ format: "franchise-lab", version: 1, exportedAt: new Date().toISOString(), league });
}

function object(value: unknown): value is Record<string, unknown> { return Boolean(value && typeof value === "object" && !Array.isArray(value)); }
function validPlayer(value: unknown): value is GmPlayer {
  if (!object(value) || typeof value.id !== "string" || !value.id || value.id.length > 120 || typeof value.name !== "string" || value.name.length > 160) return false;
  if (!["PG", "SG", "SF", "PF", "C"].includes(String(value.position))) return false;
  if (!object(value.ratings) || !object(value.scouted)) return false;
  for (const key of ["impact", "offense", "defense", "shooting", "finishing", "playmaking", "rebounding", "durability", "potential"]) if (typeof value.ratings[key] !== "number" || !Number.isFinite(value.ratings[key])) return false;
  if (typeof value.age !== "number" || value.age < 16 || value.age > 60 || typeof value.heightIn !== "number" || typeof value.weightLbs !== "number" || typeof value.minutesPreference !== "number") return false;
  if (value.contract != null && (!object(value.contract) || typeof value.contract.annualSalaryM !== "number" || value.contract.annualSalaryM < 0 || typeof value.contract.yearsRemaining !== "number")) return false;
  if (value.sheet != null && (!object(value.sheet) || !object(value.sheet.attributes) || !object(value.sheet.tendencies) || !object(value.sheet.potential) || typeof value.sheet.overall !== "number")) return false;
  return true;
}

function readJson(text: string): unknown {
  if (text.length > 40_000_000) throw new Error("This file is too large. Choose a Franchise Lab export under 40 MB.");
  return JSON.parse(text, (key, value) => {
    if (["__proto__", "prototype", "constructor"].includes(key)) throw new Error("This file contains an invalid field.");
    if (typeof value === "number" && !Number.isFinite(value)) throw new Error("This file contains an invalid number.");
    return value;
  });
}

/** Import into a new slot only after the full structure and references have passed validation. */
export function parseFranchise(text: string): GmLeagueState {
  const data = readJson(text);
  const league = object(data) ? data.league ?? (object(data.state) ? data.state.league : undefined) : undefined;
  if (!object(league) || league.version !== 1 || !Number.isInteger(league.season) || !Number.isInteger(league.day)) throw new Error("Choose a valid Franchise Lab save.");
  if (!Array.isArray(league.teams) || league.teams.length < 2 || league.teams.length > 32 || !Array.isArray(league.players) || league.players.length > 3000) throw new Error("The save has invalid teams or players.");
  const teamIds = new Set<string>();
  for (const team of league.teams) {
    if (!object(team) || typeof team.id !== "string" || teamIds.has(team.id) || !object(team.starters) || !object(team.staff) || !Array.isArray(team.draftPicks) || !Array.isArray(team.benchOrder) || !Array.isArray(team.tradeExceptionsM)) throw new Error("The save has an invalid team.");
    teamIds.add(team.id);
  }
  if (typeof league.userTeamId !== "string" || !teamIds.has(league.userTeamId)) throw new Error("The save is missing your franchise.");
  const playerIds = new Set<string>();
  for (const player of league.players) {
    if (!validPlayer(player) || playerIds.has(player.id) || (player.teamId != null && !teamIds.has(player.teamId))) throw new Error("The save has an invalid or duplicate player.");
    playerIds.add(player.id);
  }
  for (const key of ["schedule", "boxScores", "news", "tradeLog", "draftPool", "freeAgents"]) if (!Array.isArray(league[key])) throw new Error(`The save is missing ${key}.`);
  const settings = league.settings;
  if (!object(league.standings) || !object(settings) || !["salaryCapM", "luxuryTaxM", "firstApronM", "secondApronM", "maxRoster", "minRoster", "seasonLength"].every(key => typeof settings[key] === "number")) throw new Error("The save has invalid league settings.");
  if (!["preseason", "regular", "play_in", "playoffs", "draft", "free_agency", "offseason"].includes(String(league.phase))) throw new Error("The save has an invalid season stage.");
  for (const game of league.schedule as unknown[]) {
    if (!object(game) || typeof game.id !== "string" || typeof game.day !== "number") throw new Error("The schedule has an invalid game.");
    const exhibition = game.exhibition === "allstar" && Array.isArray(game.squad) && game.squad.length === 2 && game.squad.every(side => Array.isArray(side) && side.every(id => typeof id === "string" && playerIds.has(id)));
    if (!exhibition && (!teamIds.has(String(game.homeTeamId)) || !teamIds.has(String(game.awayTeamId)))) throw new Error("The schedule references a missing team.");
  }
  return prepareFranchise(league as unknown as GmLeagueState);
}

export function importDraftClass(league: GmLeagueState, text: string): GmLeagueState {
  if ((league.draftPickIndex ?? 0) > 0) throw new Error("Import a class before the first draft selection.");
  const data = readJson(text);
  const list = object(data) ? data.players : data;
  if (!Array.isArray(list) || list.length < 60 || list.length > 180 || !list.every(validPlayer)) throw new Error("Choose a draft class containing 60 to 180 valid player profiles.");
  const existing = new Set(league.players.filter(p => !league.draftPool.includes(p.id)).map(p => p.id));
  const scout = staffScoutContext(league);
  const rng = createRng(league.season * 397);
  const imported = list.map((p, i) => sealProspect(ensureSimProfile(ensurePlayerSheet({ ...p, id: `custom_${league.season}_${i}_${p.id}`, teamId: null, contract: null, injury: null, draftYear: league.season, identityRevealed: false })), scout.level, i, rng, scout.scout));
  if (imported.some(p => existing.has(p.id))) throw new Error("This class conflicts with an existing player.");
  return { ...league, players: [...league.players.filter(p => !league.draftPool.includes(p.id)), ...imported], draftPool: imported.map(p => p.id), userDraftBoard: undefined, draftScouting: undefined, draftDeals: undefined, draftSlotOrigins: undefined, scoutingFocus: undefined, scoutingFocusPrompt: undefined, combineDone: false };
}
