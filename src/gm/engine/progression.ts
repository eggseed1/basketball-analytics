import type { GmLeagueState, GmPlayer } from "@/gm/types";
import { createRng, clamp, uid } from "@/gm/engine/rng";

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
  seasonAgeBump = true
): GmPlayer[] {
  return players.map((p) => {
    const age = seasonAgeBump ? p.age + 1 : p.age;
    const growthWindow = age <= 25;
    const decline = age >= 32;
    const pot = p.ratings.potential;
    const delta = growthWindow
      ? pot * 0.08
      : decline
        ? -0.15 - Math.max(0, age - 32) * 0.05
        : pot * 0.02;
    const impact = clamp(p.ratings.impact + delta, -4, 10);
    return {
      ...p,
      age,
      ratings: {
        ...p.ratings,
        impact,
        offense: clamp(p.ratings.offense + delta * 0.6, -5, 12),
        defense: clamp(p.ratings.defense + delta * 0.5, -5, 10),
        potential: clamp(pot - (growthWindow ? 0.4 : 0.1), 0, 10),
      },
      contract: p.contract
        ? {
            ...p.contract,
            yearsRemaining: Math.max(0, p.contract.yearsRemaining - 1),
          }
        : null,
    };
  });
}

export function aiSelectProspect(state: GmLeagueState, teamId: string): string | null {
  const team = state.teams.find((t) => t.id === teamId);
  const need = team
    ? (Object.entries(team.starters).find(([, id]) => !id)?.[0] as
        | string
        | undefined)
    : undefined;
  const board = state.draftPool
    .map((id) => state.players.find((p) => p.id === id))
    .filter((p): p is GmPlayer => Boolean(p))
    .sort((a, b) => {
      const posBonusA = need && a.position === need ? 1.5 : 0;
      const posBonusB = need && b.position === need ? 1.5 : 0;
      return (
        b.ratings.potential +
        b.ratings.impact +
        posBonusB -
        (a.ratings.potential + a.ratings.impact + posBonusA)
      );
    });
  return board[0]?.id ?? null;
}

/** Run AI picks until the user's turn (or draft exhausted). */
export function advanceDraftPastAi(state: GmLeagueState): GmLeagueState {
  let next = { ...state };
  const order = next.lotteryOrder ?? [];
  let guard = 0;
  while (next.draftPool.length > 0 && guard < 60) {
    guard += 1;
    const idx = next.draftPickIndex ?? 0;
    if (idx >= order.length * 2) {
      return { ...next, phase: "offseason" };
    }
    const teamId = order[idx % order.length];
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
    phase: next.draftPool.length === 0 ? "offseason" : next.phase,
  };
}

/** Complete the rest of the draft with AI for every remaining pick. */
export function finishDraftWithAi(state: GmLeagueState): GmLeagueState {
  let next = state;
  let guard = 0;
  while (next.draftPool.length > 0 && guard < 60) {
    guard += 1;
    const idx = next.draftPickIndex ?? 0;
    const order = next.lotteryOrder ?? [];
    if (!order.length || idx >= order.length * 2) break;
    const teamId = order[idx % order.length];
    if (!teamId) break;
    const pickId = aiSelectProspect(next, teamId);
    if (!pickId) break;
    next = runDraftPick(next, teamId, pickId);
  }
  return { ...next, phase: "offseason" };
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

  const revealHeadline = codename
    ? `${team.abbr} selects ${codename} - it's ${trueName}`
    : `${team.abbr} selects ${trueName}`;
  const revealBody = codename
    ? `Pick #${pickNum}: the board knew them as ${codename}. Identity confirmed - ${trueName} is on the roster.`
    : `Pick #${pickNum} is officially on the roster.`;

  return {
    ...state,
    players: fixed,
    teams,
    draftPool: state.draftPool.filter((id) => id !== playerId),
    draftPickIndex: (state.draftPickIndex ?? 0) + 1,
    news: [
      {
        id: uid("news"),
        day: state.day,
        season: state.season,
        headline: revealHeadline,
        body: revealBody,
        tone: "good" as const,
      },
      ...state.news,
    ].slice(0, 50),
    updatedAt: new Date().toISOString(),
  };
}
