import type { GmLeagueState, GmNewsItem, GmPlayer } from "@/gm/types";
import { createRng, clamp, uid } from "@/gm/engine/rng";
import { progressSheet } from "@/gm/engine/attributes";
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
  trainerLevel: number
): GmPlayer[] {
  return players.map((p) => {
    if (!p.injury) return p;
    const reduce = 1 + trainerLevel * 0.15;
    const left = Math.max(0, p.injury.gamesRemaining - reduce);
    if (left <= 0) return { ...p, injury: null };
    return {
      ...p,
      injury: { ...p.injury, gamesRemaining: Math.ceil(left) },
    };
  });
}

export function rollGameInjuries(
  state: GmLeagueState,
  participatingIds: string[],
  seed: number
): GmPlayer[] {
  const rng = createRng(seed);
  return state.players.map((p) => {
    if (!participatingIds.includes(p.id) || p.injury) return p;
    const team = state.teams.find((t) => t.id === p.teamId);
    const trainer = team?.staff.trainerLevel ?? 1;
    const risk =
      (0.035 * (100 - p.ratings.durability)) / 100 / (0.7 + trainer * 0.15);
    if (rng() > risk) return p;
    const games = Math.max(1, Math.round((rng() * 12 + 1) * (1.2 - trainer * 0.1)));
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
  playoffGames?: Record<string, number>
): GmPlayer[] {
  return players.map((p) => {
    const age = seasonAgeBump ? p.age + 1 : p.age;
    const coach = p.teamId ? coachByTeam?.[p.teamId] : 0;
    const grown = progressSheet(
      { ...p, age },
      { coach, minutes: p.minutesPreference, pace: "summer", playoffGames: playoffGames?.[p.id] ?? 0 }
    );
    return {
      ...grown,
      age,
      contract: p.contract ? advanceContractYear(p.contract) : null,
    };
  });
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
        : player.minutesPreference;
    return progressSheet(player, {
      pace,
      coach: coachByTeam[player.teamId] ?? 0,
      minutes,
      form: formBump(player),
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
    const grown = growOnce({ ...league, players }, "season");
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
  const next = ensureDraftOrder(state);
  const idx = next.draftPickIndex ?? 0;
  if (!next.draftPool.length || idx >= draftSlotCount(next)) {
    return { ...next, phase: "draft" };
  }
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
  const before = state.players.find((p) => p.id === playerId);
  const codename = before?.codename;
  const trueName = before?.name ?? "prospect";

  const players = state.players.map((p) =>
    p.id === playerId
      ? {
          ...p,
          teamId,
          identityRevealed: true,
          contract: {
            yearsRemaining: 4,
            annualSalaryM: 4 + (p.draftPick ?? 30) * -0.05 + 8,
            birdRights: "none" as const,
            signedSeason: state.season,
          },
          // Full reveal on draft night.
          scouted: {
            impact: p.ratings.impact,
            offense: p.ratings.offense,
            defense: p.ratings.defense,
            uncertainty: 0.05,
          },
        }
      : p
  );
  const drafted = players.find((p) => p.id === playerId);
  const pickNum = (state.draftPickIndex ?? 0) + 1;
  const rookieSal = clamp(12 - pickNum * 0.25, 1.5, 12);
  const fixed = players.map((p) =>
    p.id === playerId && p.contract
      ? {
          ...p,
          contract: { ...p.contract, annualSalaryM: rookieSal },
          draftPick: pickNum,
          draftYear: state.season,
        }
      : p
  );

  const team = state.teams.find((t) => t.id === teamId)!;
  const teams = state.teams.map((t) =>
    t.id === teamId
      ? {
          ...t,
          benchOrder: [...t.benchOrder, playerId],
          draftPicks: t.draftPicks.filter(
            (dp) =>
              !(
                dp.season === state.season &&
                dp.round === 1 &&
                dp.ownerTeamId === teamId
              )
          ),
        }
      : t
  );

  const revealHeadline = `${team.abbr} selects ${trueName}`;
  const revealBody = codename
    ? `Pick #${pickNum}. Scout mold ${codename}. Build stays on the sheet.`
    : `Pick #${pickNum} is on the roster.`;
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
