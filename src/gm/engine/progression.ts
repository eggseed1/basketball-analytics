import { mentorshipBonus, reviewPlayerCeilings } from "@/gm/engine/development";
import { draftScoutingOf } from "@/gm/engine/draft-intel";
import { maybeCpuDraftTrade } from "@/gm/engine/draft-trades";
import { rookieContractForPick } from "@/gm/engine/draft-order";
import type { GmLeagueState, GmNewsItem, GmPlayer } from "@/gm/types";
import { createRng, clamp, uid } from "@/gm/engine/rng";
import { ensurePlayerSheet, playerSheet, progressSheet } from "@/gm/engine/attributes";
import {
  aiSelectProspect,
  draftSlotCount,
  ensureDraftOrder,
  pickGrade,
  pickOwnerAt,
} from "@/gm/engine/draft-room";
import { coachEffect } from "@/gm/engine/staff";
import { regularSeasonComplete } from "@/gm/engine/schedule";
import { advanceContractYear } from "@/gm/seed/real-books";
import { devKnackGrowthMul } from "@/gm/seed/staff-knacks";

export { aiSelectProspect, ensureDraftOrder, pickOwnerAt, draftSlotCount };

const INJURY_TYPES = [
  "Ankle sprain",
  "Knee soreness",
  "Hamstring strain",
  "Back tightness",
  "Shoulder strain",
  "Concussion protocol",
  "Foot inflammation",
];

export function tickInjuries(
  players: GmPlayer[],
  trainerLevel: number,
  context?: { teamIds: string[]; before: GmPlayer[]; trainerByTeam: Record<string, number> }
): GmPlayer[] {
  const alreadyOut = context ? new Set(context.before.filter(p => p.injury).map(p => p.id)) : null;
  return players.map((raw) => {
    const teamPlayed = !context || context.teamIds.includes(raw.teamId ?? "");
    const p = teamPlayed && (raw.campFatigueGames ?? 0) > 0 ? { ...raw, campFatigueGames: Math.max(0, raw.campFatigueGames! - 1) } : raw;
    if (!p.injury) return p;
    if (context && (!context.teamIds.includes(p.teamId ?? "") || !alreadyOut?.has(p.id))) return p;
    const level = p.teamId ? context?.trainerByTeam[p.teamId] ?? trainerLevel : trainerLevel;
    const progress = (p.injury.recoveryProgress ?? 0) + Math.max(0, level) * 0.15;
    const left = Math.max(0, p.injury.gamesRemaining - 1 - Math.floor(progress));
    if (left <= 0) return { ...p, injury: null };
    return {
      ...p,
      injury: { ...p.injury, gamesRemaining: left, recoveryProgress: progress % 1 },
    };
  });
}

export function rollGameInjuries(
  state: GmLeagueState,
  participatingIds: string[],
  seed: number,
  nightMinutes?: Record<string, number>
): GmPlayer[] {
  const rng = createRng(seed);
  return state.players.map((p) => {
    if (!participatingIds.includes(p.id) || p.injury) return p;
    const team = state.teams.find((t) => t.id === p.teamId);
    const trainer = team?.staff.trainerLevel ?? 1;
    const mpg =
      nightMinutes?.[p.id] ??
      (p.seasonLine && p.seasonLine.gp > 0
        ? p.seasonLine.min / p.seasonLine.gp
        : p.minutesPreference);
    // Heavy nights load the risk; deep rotations keep guys healthier.
    const load = mpg <= 28 ? 0.85 : mpg <= 34 ? 1 : mpg <= 38 ? 1.25 : mpg <= 42 ? 1.55 : 1.9;
    const risk = clamp(state.settings.injuryFrequency ?? 1, 0, 2) *
      ((0.035 * (100 - p.ratings.durability)) / 100 / (0.7 + trainer * 0.15)) * load;
    if (rng() > risk) return p;
    const games = Math.max(
      1,
      Math.round((rng() * 12 + 1) * (1.2 - trainer * 0.1) * (mpg >= 40 ? 1.15 : 1))
    );
    return {
      ...p,
      injury: {
        type: INJURY_TYPES[Math.floor(rng() * INJURY_TYPES.length)]!,
        gamesRemaining: games,
        reinjuryRisk: clamp(0.1 + rng() * 0.3, 0, 0.5),
      },
    };
  });
}

export function developPlayers(
  players: GmPlayer[],
  seasonAgeBump = true,
  coachByTeam?: Record<string, number>,
  playoffGames?: Record<string, number>,
  developerByTeam?: Record<string, { knack: import("@/gm/seed/staff-knacks").DevKnackId; touch: number } | null>,
  developmentSpeed = 1,
  contractTick = true
): GmPlayer[] {
  return players.map((p) => {
    const age = seasonAgeBump ? p.age + 1 : p.age;
    const coach = p.teamId ? coachByTeam?.[p.teamId] : 0;
    const aged = { ...p, age };
    const developer = p.teamId ? developerByTeam?.[p.teamId] : null;
    const growing = agingBaseHint(age, p.position === "C" || p.position === "PF");
    const touch = developer ? 1 + (developer.touch - 3) * 0.02 : 1;
    const knackMul = developer
      ? devKnackGrowthMul(developer.knack, aged, growing) * touch
      : 1;
    const grown = progressSheet(aged, {
      coach,
      minutes: p.seasonLine && p.seasonLine.gp > 0 ? p.seasonLine.min / p.seasonLine.gp : p.draftModel === 2 || p.developmentPlan ? 0 : p.minutesPreference,
      pace: "summer",
      speed: developmentSpeed,
      playoffGames: playoffGames?.[p.id] ?? 0,
      devStaff: knackMul,
      mentorBonus: mentorshipBonus(p, players),
    });
    return {
      ...grown,
      age,
      contract: p.contract && contractTick ? advanceContractYear(p.contract) : p.contract,
    };
  });
}

/** Positive agingBase ≈ still growing. Mirrors attributes.agingBase sign without importing private. */
function agingBaseHint(age: number, big: boolean): boolean {
  const a = big ? age - 1 : age;
  return a <= 27;
}

function formBump(player: GmPlayer): number {
  const line = player.seasonLine;
  const overall = player.sheet?.overall;
  if (!line || line.gp < 12 || overall == null) return 0;
  const production = (line.pts + line.reb * 0.7 + line.ast) / line.gp;
  const expected = Math.max(4, (overall - 62) * 0.55);
  return clamp((production - expected) / 40, -0.04, 0.06);
}

function developmentNews(
  before: GmPlayer[],
  after: GmPlayer[],
  day: number,
  season: number,
  headline: string
): GmNewsItem | null {
  const moves = after.flatMap((player) => {
    const prior = before.find((entry) => entry.id === player.id);
    if (!prior?.sheet || !player.sheet || !player.teamId) return [];
    const diff = player.sheet.overall - prior.sheet.overall;
    if (diff === 0) return [];
    return [{ name: player.name, diff }];
  });
  if (!moves.length) return null;
  const up = moves
    .filter((row) => row.diff > 0)
    .sort((a, b) => b.diff - a.diff)
    .slice(0, 3)
    .map((row) => `${row.name} up ${row.diff}`);
  const down = moves
    .filter((row) => row.diff < 0)
    .sort((a, b) => a.diff - b.diff)
    .slice(0, 2)
    .map((row) => `${row.name} down ${Math.abs(row.diff)}`);
  const body = [...up, ...down].join(". ");
  if (!body) return null;
  return {
    id: uid("news"),
    day,
    season,
    headline,
    body: `${body}.`,
    tone: up.length >= down.length ? "good" : "info",
  };
}

function growOnce(league: GmLeagueState, pace: "season"): { players: GmPlayer[]; note: GmNewsItem | null } {
  const coachByTeam = Object.fromEntries(
    league.teams.map((team) => [team.id, coachEffect(team).development])
  );
  const players = league.players.map((player) => {
    if (!player.teamId || league.draftPool.includes(player.id)) return player;
    const minutes =
      player.seasonLine && player.seasonLine.gp >= 8
        ? player.seasonLine.min / player.seasonLine.gp
        : player.draftModel === 2 || player.developmentPlan ? 0 : player.minutesPreference;
    const developer = league.teams.find((t) => t.id === player.teamId)?.staff.developer;
    const growing = true;
    const touch = developer ? 1 + (developer.touch - 3) * 0.02 : 1;
    const knackMul = developer
      ? devKnackGrowthMul(developer.knack, player, growing) * touch
      : 1;
    return progressSheet(player, {
      pace,
      speed: league.settings.developmentSpeed ?? 1,
      coach: coachByTeam[player.teamId] ?? 0,
      minutes,
      form: formBump(player),
      devStaff: knackMul,
      mentorBonus: mentorshipBonus(player, league.players),
    });
  });
  return {
    players,
    note: developmentNews(league.players, players, league.day, league.season, "In-season development"),
  };
}

/**
 * Two checks a year, January and the end of the regular season.
 * Each one is a fraction of the summer jump. Safe to call every day.
 */
export function maybeGrowInSeason(league: GmLeagueState): GmLeagueState {
  if (league.phase !== "regular") return league;
  const playedDates = league.schedule
    .filter((game) => game.played && game.gameDate && game.exhibition !== "allstar")
    .map((game) => game.gameDate!)
    .sort();
  const latest = playedDates[playedDates.length - 1];
  const marks =
    league.devMarks?.season === league.season
      ? league.devMarks
      : { season: league.season, january: false, finale: false };
  let players = league.players;
  const notes: GmNewsItem[] = [];
  let january = marks.january;
  let finale = marks.finale;
  if (!january && latest && latest >= `${league.season}-01-01`) {
    const grown = growOnce({ ...league, players }, "season");
    players = grown.players;
    if (grown.note) notes.push({ ...grown.note, headline: "January check-in" });
    january = true;
  }
  if (!finale && regularSeasonComplete(league.schedule)) {
    const reviewed = reviewPlayerCeilings({ ...league, players });
    notes.push(...reviewed.news.filter(note => !league.news.some(previous => previous.id === note.id)));
    const grown = growOnce(reviewed, "season");
    players = grown.players;
    if (grown.note) notes.push({ ...grown.note, headline: "End of the regular season" });
    finale = true;
  }
  if (january === marks.january && finale === marks.finale && players === league.players) return league;
  return {
    ...league,
    players,
    devMarks: { season: league.season, january, finale },
    news: [...notes, ...league.news].slice(0, 50),
  };
}

export function playoffGamesByPlayer(league: GmLeagueState): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const box of league.boxScores) {
    if (!box.postseason) continue;
    for (const line of box.players) {
      if (line.minutes <= 0) continue;
      counts[line.playerId] = (counts[line.playerId] ?? 0) + 1;
    }
  }
  return counts;
}

export function offseasonJumpNote(before: GmPlayer[], after: GmPlayer[], league: GmLeagueState): GmNewsItem | null {
  return developmentNews(before, after, league.day, league.season, "Offseason jumps");
}

/** Run AI picks until the user's turn (or draft exhausted). */
export function advanceDraftPastAi(state: GmLeagueState): GmLeagueState {
  let next = ensureDraftOrder({ ...state });
  let guard = 0;
  while (next.draftPool.length > 0 && guard < 60) {
    guard += 1;
    const idx = next.draftPickIndex ?? 0;
    if (idx >= draftSlotCount(next)) {
      return { ...next, phase: "draft" };
    }
    const watched=draftScoutingOf(next).watchlist;
    const nextUser=(next.draftOrder??[]).findIndex((owner,slot)=>owner===next.userTeamId&&slot>=idx);
    if(nextUser>idx&&next.players.some(player=>watched.includes(player.id)&&next.draftPool.includes(player.id)&&(player.consensusRank??99)<=idx+4)) return next;
    next = maybeCpuDraftTrade(next);
    const teamId = pickOwnerAt(next, idx);
    if (!teamId) break;
    if (teamId === next.userTeamId) {
      return { ...next, phase: "draft" };
    }
    const pickId = aiSelectProspect(next, teamId);
    if (!pickId) break;
    next = runDraftPick(next, teamId, pickId);
  }
  return {
    ...next,
    phase: "draft",
  };
}

/** One CPU selection. No-op when the user is on the clock. */
export function advanceOneDraftPick(state: GmLeagueState): GmLeagueState {
  let next = ensureDraftOrder(state);
  const idx = next.draftPickIndex ?? 0;
  if (!next.draftPool.length || idx >= draftSlotCount(next)) {
    return { ...next, phase: "draft" };
  }
  next = maybeCpuDraftTrade(next);
  const teamId = pickOwnerAt(next, idx);
  if (!teamId || teamId === next.userTeamId) {
    return { ...next, phase: "draft" };
  }
  const pickId = aiSelectProspect(next, teamId);
  if (!pickId) return { ...next, phase: "draft" };
  return { ...runDraftPick(next, teamId, pickId), phase: "draft" };
}

/** Complete the rest of the draft with AI for every remaining pick. */
export function finishDraftWithAi(state: GmLeagueState): GmLeagueState {
  let next = ensureDraftOrder(state);
  let guard = 0;
  while (next.draftPool.length > 0 && guard < 60) {
    guard += 1;
    const idx = next.draftPickIndex ?? 0;
    if (idx >= draftSlotCount(next)) break;
    next = maybeCpuDraftTrade(next);
    const teamId = pickOwnerAt(next, idx);
    if (!teamId) break;
    const pickId = aiSelectProspect(next, teamId);
    if (!pickId) break;
    next = runDraftPick(next, teamId, pickId);
  }
  return { ...next, phase: "draft" };
}

export function runDraftPick(
  state: GmLeagueState,
  teamId: string,
  playerId: string
): GmLeagueState {
  const index=state.draftPickIndex??0;
  const before=state.players.find(player=>player.id===playerId);
  if(state.phase!=="draft" || !state.draftPool.includes(playerId) || !before || before.teamId!=null || pickOwnerAt(state,index)!==teamId || !state.teams.some(team=>team.id===teamId)) return state;
  const codename=before.codename,trueName=before.name;
  const pickNum=index+1,contract=rookieContractForPick(state,pickNum);
  const fixed=state.players.map(player=>{
    if(player.id!==playerId) return player;
    const stamped=ensurePlayerSheet(player);
    return {...stamped,teamId,identityRevealed:true,contract:state.seasonFlow?null:contract,pendingRookieContract:state.seasonFlow?contract:undefined,serviceYears:0,draftedByTeamId:teamId,draftPick:pickNum,draftYear:state.season,developmentPlan:"balanced" as const,scouted:{impact:player.ratings.impact,offense:player.ratings.offense,defense:player.ratings.defense,uncertainty:0.05}};
  });
  const drafted=fixed.find(player=>player.id===playerId);
  const round=index<state.teams.length?1:2;
  const origin=state.draftSlotOrigins?.[index]??state.lotteryOrder?.[index%Math.max(1,state.teams.length)];
  const team = state.teams.find((t) => t.id === teamId)!;
  const teams = state.teams.map((t) => ({
    ...t,
    benchOrder: t.id === teamId ? [...t.benchOrder, playerId] : t.benchOrder,
    // A retained protected pick can still be recorded in its former holder's
    // book. Consume the resolved selection wherever the record lives.
    draftPicks: t.draftPicks.filter(dp => !(dp.season === state.season && dp.round === round && (origin ? dp.originalTeamId === origin : dp.ownerTeamId === teamId))),
  }));

  const sheet = drafted ? playerSheet(drafted) : null;
  const ovr=sheet?.overall;
  const revealHeadline=`${team.abbr} selects ${trueName}`;
  const revealBody=`Pick #${pickNum}. Overall ${ovr??"pending"}.${codename?" Style: "+codename+".":""} Development depends on the role, practice and opportunity you provide.`;
  const grade =
    teamId === state.userTeamId ? ` ${pickGrade(state, playerId)}` : "";

  return {
    ...state,
    players: fixed,
    teams,
    draftPool: state.draftPool.filter((id) => id !== playerId),
    userDraftBoard: state.userDraftBoard?.filter((id) => id !== playerId),
    draftOrder: state.draftOrder,
    draftPickIndex: (state.draftPickIndex ?? 0) + 1,
    news: [
      {
        id: uid("news"),
        day: state.day,
        season: state.season,
        headline: revealHeadline,
        body: revealBody + grade,
        tone: "good" as const,
      },
      ...state.news,
    ].slice(0, 50),
    updatedAt: new Date().toISOString(),
  };
}

