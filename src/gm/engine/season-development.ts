import type { GmAttributes, GmCampFocus, GmLeagueState, GmSeasonFlow, GmPlayer } from "@/gm/types";
import { ensurePlayerSheet, overallFromAttributes } from "@/gm/engine/attributes";
import { autoSetLineup, overallOf } from "@/gm/engine/lineup";
import { developPlayers, playoffGamesByPlayer } from "@/gm/engine/progression";
import { coachEffect } from "@/gm/engine/staff";
import { simulateGame } from "@/gm/engine/simulate";
import { clamp } from "@/gm/engine/rng";
import { flowOf } from "@/gm/engine/season-flow-state";

export const CAMP_FOCUSES: ReadonlyArray<{ id: GmCampFocus; label: string; keys: Array<keyof GmAttributes> }> = [
  { id: "shooting", label: "Shooting", keys: ["threePoint", "midrange", "freeThrow"] },
  { id: "creation", label: "Creation", keys: ["passAccuracy", "ballHandle", "speedWithBall"] },
  { id: "defense", label: "Defense", keys: ["perimeterDefense", "interiorDefense", "steal", "block"] },
  { id: "rebounding", label: "Rebounding", keys: ["offReb", "defReb"] },
  { id: "conditioning", label: "Conditioning", keys: ["stamina", "agility", "strength"] },
];

export function applySeasonProgression(league: GmLeagueState): GmLeagueState {
  const flow = flowOf(league);
  if (flow.progressionApplied) return league;
  const coaches = Object.fromEntries(league.teams.map(team => [team.id, coachEffect(team).development]));
  const developers = Object.fromEntries(league.teams.map(team => [team.id, team.staff.developer ? { knack: team.staff.developer.knack, touch: team.staff.developer.touch } : null]));
  const players = developPlayers(league.players, false, coaches, playoffGamesByPlayer(league), developers, league.settings.developmentSpeed ?? 1, false);
  const previous = new Map(league.players.map(player => [player.id, player]));
  return { ...league, players, seasonFlow: { ...flow, progressionApplied: true, progression: players.filter(player => player.teamId != null).map(player => ({ playerId: player.id, name: player.name, teamId: player.teamId, age: player.age, before: overallOf(previous.get(player.id)!), after: overallOf(player) })) } };
}

export function campSlots(league: GmLeagueState, teamId = league.userTeamId): number {
  const trainer = league.teams.find(team => team.id === teamId)?.staff.trainerLevel ?? 1;
  return clamp(2 + Math.floor((trainer - 1) / 2), 2, 4);
}

export function assignCamp(league: GmLeagueState, playerId: string, focus: GmCampFocus | null): { state: GmLeagueState; ok: boolean; reason: string } {
  const flow = flowOf(league);
  const fail = (reason: string) => ({ state: league, ok: false, reason });
  if (flow.stage !== "training_camp" || flow.campResults) return fail("Camp assignments are open at the training camp step.");
  const player = league.players.find(row => row.id === playerId && row.teamId === league.userTeamId && row.contract);
  if (!player) return fail("Choose a player under contract to your club.");
  if (focus && !CAMP_FOCUSES.some(row => row.id === focus)) return fail("Choose a camp focus.");
  if (focus && player.injury) return fail("Injured players need medical clearance before a focused camp.");
  const eligibleIds = new Set(league.players.filter(row => row.teamId === league.userTeamId && row.contract && !row.injury).map(row => row.id));
  const assignments = Object.fromEntries(Object.entries(flow.campAssignments ?? {}).filter(([id]) => eligibleIds.has(id)));
  if (focus) assignments[playerId] = focus; else delete assignments[playerId];
  if (Object.keys(assignments).length > campSlots(league)) return fail("All camp slots are assigned. Clear one to choose another player.");
  return { ok: true, reason: focus ? player.name + " assigned to " + focus + "." : "Camp assignment cleared.", state: { ...league, seasonFlow: { ...flow, campAssignments: assignments } } };
}

export function campSkillChanges(league: GmLeagueState, player: GmPlayer, focus: GmCampFocus) {
  const camp = CAMP_FOCUSES.find(row => row.id === focus);
  const attributes = ensurePlayerSheet(player).sheet!.attributes;
  const trainer = league.teams.find(team => team.id === player.teamId)?.staff.trainerLevel ?? 1;
  const gain = player.age <= 25 && trainer >= 3 ? 2 : 1;
  return (camp?.keys ?? []).map(key => ({ key, before: attributes[key], after: clamp(attributes[key] + gain, 25, 99) }));
}

export function suggestCampAssignments(league: GmLeagueState): { state: GmLeagueState; ok: boolean; reason: string } {
  const flow = flowOf(league);
  if (flow.stage !== "training_camp" || flow.campResults) return { state: league, ok: false, reason: "Focused camps are not open." };
  const eligible = league.players.filter(player => player.teamId === league.userTeamId && player.contract && !player.injury)
    .sort((a,b) => a.age - b.age || overallOf(b) - overallOf(a));
  const assignments = Object.fromEntries(Object.entries(flow.campAssignments ?? {}).filter(([id]) => eligible.some(player => player.id === id)));
  let next = { ...league, seasonFlow: { ...flow, campAssignments: assignments } };
  let added = 0;
  for (const player of eligible) {
    if (Object.keys(next.seasonFlow.campAssignments).length >= campSlots(league)) break;
    if (next.seasonFlow.campAssignments[player.id]) continue;
    const focus = player.developmentFocus && player.developmentFocus !== "balanced" ? player.developmentFocus :
      player.position === "PF" || player.position === "C" ? "defense" : "shooting";
    const result = assignCamp(next, player.id, focus);
    if (result.ok) { next = { ...result.state, seasonFlow: { ...result.state.seasonFlow!, campAssignments: result.state.seasonFlow!.campAssignments! } }; added++; }
  }
  return { state: next, ok: true, reason: added ? "Added " + added + " camp suggestion(s). Your existing choices were kept. Review the skills before running camp." : "Your camp slots are already assigned, or no healthy players are available." };
}

export function applyTrainingCamp(league: GmLeagueState): GmLeagueState {
  const flow = flowOf(league);
  if (flow.campResults) return league;
  const assignments: Record<string, GmCampFocus> = {};
  for (const team of league.teams) {
    const healthy = league.players.filter(player => player.teamId === team.id && player.contract && !player.injury);
    if (team.id === league.userTeamId) {
      let assigned = 0;
      for (const player of healthy) {
        const focus = flow.campAssignments?.[player.id];
        if (focus && assigned < campSlots(league, team.id) && CAMP_FOCUSES.some(row => row.id === focus)) { assignments[player.id] = focus; assigned++; }
      }
    } else {
      const selected = healthy.sort((a, b) => a.age - b.age || overallOf(b) - overallOf(a)).slice(0, campSlots(league, team.id));
      for (const player of selected) assignments[player.id] = player.developmentFocus && player.developmentFocus !== "balanced" ? player.developmentFocus : player.position === "C" || player.position === "PF" ? "defense" : "shooting";
    }
  }
  const results: NonNullable<GmSeasonFlow["campResults"]> = [];
  const players = league.players.map(raw => {
    const camp = CAMP_FOCUSES.find(row => row.id === assignments[raw.id]);
    if (!camp) return raw;
    const player = ensurePlayerSheet(raw), sheet = player.sheet!;
    const attributes = { ...sheet.attributes };
    const gains: string[] = [];
    for (const change of campSkillChanges(league, player, camp.id)) {
      if (change.after > change.before) gains.push(change.key + " +" + (change.after - change.before));
      attributes[change.key] = change.after;
    }
    const extras = { impact: player.ratings.impact, drbl100: player.drbl100 };
    const offset = sheet.overallOffset ?? sheet.overall - overallFromAttributes(player.position, sheet.attributes, extras);
    const overall = clamp(offset + overallFromAttributes(player.position, attributes, extras), 25, 99);
    results.push({ playerId: player.id, name: player.name, before: sheet.overall, after: overall, focus: camp.id, gains });
    return { ...player, sheet: { ...sheet, attributes, overallOffset: offset, overall, priorOverall: sheet.overall } };
  });
  return { ...league, players, seasonFlow: { ...flow, campResults: results } };
}

/** The possession engine uses temporary rosters. Games never enter league totals. */
export function runSummerLeague(league: GmLeagueState, skip = false): GmLeagueState {
  const flow = flowOf(league);
  if (flow.stage !== "summer_league" || flow.summerLeague) return league;
  const report: NonNullable<GmSeasonFlow["summerLeague"]> = { skipped: skip, inviteeIds: [], games: [] };
  if (!skip) {
    const club = league.teams.find(team => team.id === league.userTeamId);
    if (club) {
      const available = league.players.filter(player => !player.injury && !league.draftPool.includes(player.id));
      const youngsters = available.filter(player => player.teamId === club.id && (player.age <= 24 || player.draftYear === league.season)).sort((a, b) => a.age - b.age || overallOf(b) - overallOf(a)).slice(0, 10);
      const invites = available.filter(player => player.teamId == null && !player.rightsTeamId && player.age <= 25).sort((a, b) => overallOf(b) - overallOf(a) || a.id.localeCompare(b.id));
      const homePlayers = [...youngsters, ...invites.slice(0, Math.max(0, 8 - youngsters.length))];
      report.inviteeIds = homePlayers.filter(player => player.teamId == null).map(player => player.id);
      const homeIds = new Set(homePlayers.map(player => player.id));
      const rivals = league.teams.filter(team => team.id !== club.id).slice(0, 3);
      for (let index = 0; index < rivals.length && homePlayers.length >= 5; index++) {
        const rival = rivals[index]!;
        const roster = available.filter(player => player.teamId === rival.id && (player.age <= 24 || player.draftYear === league.season)).sort((a, b) => a.age - b.age || overallOf(b) - overallOf(a)).slice(0, 10);
        const awayPlayers = [...roster, ...invites.filter(player => !homeIds.has(player.id)).slice(0, Math.max(0, 8 - roster.length))];
        if (awayPlayers.length < 5) continue;
        const temporary = [...homePlayers.map(player => ({ ...player, teamId: club.id })), ...awayPlayers.map(player => ({ ...player, teamId: rival.id }))];
        const teams = [club, rival].map(team => autoSetLineup({ ...team, coaching: undefined }, temporary));
        const simulated = simulateGame({ id: "summer-" + league.season + "-" + club.id + "-" + index, season: league.season + 1, day: index, homeTeamId: club.id, awayTeamId: rival.id, played: false, neutral: true, span: 5 / 6 }, teams, temporary, league.season * 9949 + index, undefined, league.settings);
        report.games.push({ opponentId: rival.id, scored: simulated.box.homeScore, allowed: simulated.box.awayScore, players: simulated.box.players.filter(row => row.teamId === club.id).map(row => ({ playerId: row.playerId, minutes: row.minutes, points: row.points, rebounds: row.rebounds, assists: row.assists })) });
      }
    }
  }
  return { ...league, seasonFlow: { ...flow, summerLeague: report } };
}
