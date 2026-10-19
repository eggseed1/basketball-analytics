import type { GmLeagueState, GmPlayer, GmPosition, GmTeam } from "@/gm/types";
import { playerSheet } from "@/gm/engine/attributes";
import { createRng } from "@/gm/engine/rng";
import { sortScoutBoard } from "@/gm/engine/scouting";

const POSITIONS: GmPosition[] = ["PG", "SG", "SF", "PF", "C"];

function hash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Weakest positions on a roster the team already knows. */
export function rosterNeeds(team: GmTeam, players: GmPlayer[]): GmPosition[] {
  const roster = players.filter((player) => player.teamId === team.id);
  const score = (position: GmPosition) => {
    const at = roster.filter((player) => player.position === position);
    if (!at.length) return -99;
    const best = Math.max(...at.map((player) => player.ratings.impact));
    const starterId = team.starters[position];
    const empty = !starterId || !roster.some((player) => player.id === starterId);
    return best - (empty ? 4 : 0);
  };
  return [...POSITIONS].sort((a, b) => score(a) - score(b));
}

/**
 * Each club ranks the room from its own roster, its goal, and a noisy eye.
 * The truth board is not the board they draft from.
 */
export function aiSelectProspect(state: GmLeagueState, teamId: string): string | null {
  const team = state.teams.find((club) => club.id === teamId);
  const pool = state.draftPool
    .map((id) => state.players.find((player) => player.id === id))
    .filter((player): player is GmPlayer => Boolean(player));
  if (!pool.length) return null;
  if (!team) return pool[0]!.id;

  const needs = rosterNeeds(team, state.players);
  const rng = createRng(
    hash(`${teamId}:${state.season}:${state.draftPickIndex ?? 0}`)
  );
  const ranked = pool
    .map((player) => {
      const sheet = playerSheet(player);
      const ready = player.consensus ?? player.ratings.impact;
      const upside = player.ratings.potential;
      let score = ready * 1.25 + upside * 0.06;
      if (team.ownerGoal === "contend") score += ready * 0.4;
      if (team.ownerGoal === "tank") {
        score += (sheet.potential.ceiling / 12) * 0.9;
        if (player.age <= 20) score += 0.7;
      }
      if (player.position === needs[0]) score += 1.7;
      else if (player.position === needs[1]) score += 0.55;
      score += (rng() - 0.5) * 3.4;
      return { id: player.id, score };
    })
    .sort((a, b) => b.score - a.score);
  return ranked[0]?.id ?? null;
}

function truthRank(state: GmLeagueState, playerId: string): number {
  const pool = state.draftPool
    .map((id) => state.players.find((player) => player.id === id))
    .filter((player): player is GmPlayer => Boolean(player));
  const ranked = [...pool].sort((a, b) => {
    const av = a.ratings.impact * 1.2 + a.ratings.potential * 0.45;
    const bv = b.ratings.impact * 1.2 + b.ratings.potential * 0.45;
    return bv - av;
  });
  const index = ranked.findIndex((player) => player.id === playerId);
  return index < 0 ? ranked.length : index + 1;
}

function place(n: number): string {
  const mod = n % 100;
  if (mod >= 11 && mod <= 13) return `${n}th`;
  const last = n % 10;
  if (last === 1) return `${n}st`;
  if (last === 2) return `${n}nd`;
  if (last === 3) return `${n}rd`;
  return `${n}th`;
}

function letterForReach(reach: number): string {
  if (reach <= 0) return "A";
  if (reach <= 2) return "B";
  if (reach <= 5) return "C";
  return "D";
}

/** Morning-after grade for the user's pick. Names no one still in the pool. */
export function pickGrade(state: GmLeagueState, playerId: string): string {
  const rank = truthRank(state, playerId);
  const reach = rank - 1;
  const letter = letterForReach(reach);
  const pool = state.draftPool
    .map((id) => state.players.find((player) => player.id === id))
    .filter((player): player is GmPlayer => Boolean(player));
  const yours = state.userDraftBoard?.filter((id) => state.draftPool.includes(id));
  const board = yours?.length ? yours : sortScoutBoard(pool).map((player) => player.id);
  const slot = board.indexOf(playerId) + 1;
  const boardLine =
    slot > 0
      ? yours?.length
        ? `Your board had this prospect ${place(slot)}. `
        : `The scout board had this prospect ${place(slot)}. `
      : "";
  const room =
    rank === 1
      ? "He was the best prospect still available."
      : rank === 2
        ? "One name still in the room graded out higher."
        : `${rank - 1} names still in the room graded out higher.`;
  return `${boardLine}League grade ${letter}. ${room}`;
}

export function orderedBoard(state: GmLeagueState, players: GmPlayer[]): GmPlayer[] {
  const pool = new Set(state.draftPool);
  const inRoom = players.filter((player) => pool.has(player.id));
  const saved = state.userDraftBoard?.filter((id) => pool.has(id)) ?? [];
  if (!saved.length) return sortScoutBoard(inRoom);
  const byId = new Map(inRoom.map((player) => [player.id, player]));
  const ranked = saved
    .map((id) => byId.get(id))
    .filter((player): player is GmPlayer => Boolean(player));
  const rest = sortScoutBoard(inRoom.filter((player) => !saved.includes(player.id)));
  return [...ranked, ...rest];
}

export function moveBoard(
  order: string[],
  playerId: string,
  dir: "up" | "down" | "top"
): string[] {
  const next = [...order];
  const index = next.indexOf(playerId);
  if (index < 0) return next;
  next.splice(index, 1);
  if (dir === "top") next.unshift(playerId);
  else if (dir === "up") next.splice(Math.max(0, index - 1), 0, playerId);
  else next.splice(Math.min(next.length, index + 1), 0, playerId);
  return next;
}
