import type { GmDraftPick, GmLeagueState, GmPlayer, GmPosition, GmTeam } from "@/gm/types";
import { playerSheet } from "@/gm/engine/attributes";
import { createRng } from "@/gm/engine/rng";
import { sortScoutBoard } from "@/gm/engine/scouting";
import {
  draftSlotTradePoints,
  pickTradePoints,
} from "@/gm/engine/value";

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
  const pickNum = (state.draftPickIndex ?? 0) + 1;
  const mock = classMockBoard(state);
  const mockRank = new Map(mock.map((player, index) => [player.id, index + 1]));
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
      // Steal hunters: a board name falling past them pops on the clock.
      const boardSpot = mockRank.get(player.id) ?? 99;
      const fall = pickNum - boardSpot;
      if (fall >= 5 && boardSpot <= 18) score += 1.1 + Math.min(fall, 12) * 0.08;
      else if (fall >= 3 && boardSpot <= 12) score += 0.45;
      // Athletic freaks / high ceiling get a small sleeper bump for tanks.
      if (team.ownerGoal === "tank" && upside >= 8 && ready < 2.2) score += 0.55;
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

/** Build a 60-pick schedule from the lottery table (R1 then R2). */
export function expandDraftOrder(lotteryOrder: string[]): string[] {
  if (!lotteryOrder.length) return [];
  return [...lotteryOrder, ...lotteryOrder];
}

export function ensureDraftOrder(state: GmLeagueState): GmLeagueState {
  if (state.draftOrder?.length) return state;
  const lottery = state.lotteryOrder ?? [];
  if (!lottery.length) return state;
  return { ...state, draftOrder: expandDraftOrder(lottery) };
}

export function pickOwnerAt(state: GmLeagueState, pickIndex = state.draftPickIndex ?? 0): string | null {
  if (state.draftOrder?.length) return state.draftOrder[pickIndex] ?? null;
  const order = state.lotteryOrder ?? [];
  if (!order.length) return null;
  if (pickIndex >= order.length * 2) return null;
  return order[pickIndex % order.length] ?? null;
}

export function draftSlotCount(state: GmLeagueState): number {
  if (state.draftOrder?.length) return state.draftOrder.length;
  return (state.lotteryOrder?.length ?? 0) * 2;
}

/** Scout mock for this class: remaining pool plus anyone already picked this year. */
export function classMockBoard(state: GmLeagueState): GmPlayer[] {
  const pool = new Set(state.draftPool);
  const klass = state.players.filter(
    (player) =>
      pool.has(player.id) ||
      (player.draftYear === state.season && player.draftPick != null)
  );
  return sortScoutBoard(klass);
}

export function mockRankOf(state: GmLeagueState, playerId: string): number {
  const rank = classMockBoard(state).findIndex((player) => player.id === playerId);
  return rank < 0 ? 99 : rank + 1;
}

export type DraftPickRow = {
  pick: number;
  teamId: string;
  player: GmPlayer;
  mockRank: number;
  sleeper: boolean;
  fall: number;
};

export function draftPickLog(state: GmLeagueState): DraftPickRow[] {
  return state.players
    .filter((player) => player.draftYear === state.season && player.draftPick != null && (player.draftedByTeamId || player.teamId))
    .map((player) => {
      const pick = player.draftPick!;
      const mockRank = mockRankOf(state, player.id);
      const fall = pick - mockRank;
      return {
        pick,
        teamId: player.draftedByTeamId ?? player.teamId!,
        player,
        mockRank,
        // Sleeper = board name who slid at least a half-dozen spots, or a
        // late pick who was mocked top-20 (steal flash on the ticker).
        sleeper: fall >= 6 || (pick >= 20 && mockRank <= 20 && fall >= 4),
        fall,
      };
    })
    .sort((a, b) => a.pick - b.pick);
}

/** True once every slot is filled (pool empty or pick index past the board). */
export function isDraftComplete(state: GmLeagueState): boolean {
  if (state.phase !== "draft") return false;
  if (!state.draftPool.length) return true;
  return (state.draftPickIndex ?? 0) >= draftSlotCount(state);
}

/** Your selections from this year's class, in pick order. */
export function userDraftPicks(state: GmLeagueState): DraftPickRow[] {
  return draftPickLog(state).filter((row) => row.teamId === state.userTeamId);
}

/**
 * Show the draft recap: board just finished, or summer still has this year's
 * picks on the books.
 */
export function shouldShowDraftResults(state: GmLeagueState): boolean {
  if (isDraftComplete(state)) return true;
  if (state.phase !== "free_agency" && state.phase !== "offseason") return false;
  return draftPickLog(state).length > 0;
}

export function fallingProspects(state: GmLeagueState, minFall = 4): Array<{
  player: GmPlayer;
  mockRank: number;
  fall: number;
}> {
  const pickNum = (state.draftPickIndex ?? 0) + 1;
  return classMockBoard(state)
    .filter((player) => state.draftPool.includes(player.id))
    .map((player, index) => {
      const mockRank = index + 1;
      return { player, mockRank, fall: pickNum - mockRank };
    })
    .filter((row) => row.fall >= minFall && row.mockRank <= 20)
    .slice(0, 5);
}

export type DraftNightOffer = {
  id: string;
  partnerTeamId: string;
  yourSlot: number;
  theirSlot: number;
  /** Future picks the club trading up sends. */
  upSweetenerIds: string[];
  direction: "up" | "down";
  blurb: string;
  /** What you put on the table (tonight's slot + any futures you attach). */
  youSend: string[];
  /** What lands on your board. */
  youGet: string[];
  /** Package points you give up. */
  youSendPoints: number;
  /** Package points you receive. */
  youGetPoints: number;
};

function teamAbbr(state: GmLeagueState, teamId: string): string {
  return state.teams.find((team) => team.id === teamId)?.abbr ?? teamId.toUpperCase();
}

/** Human label for a future pick asset. */
export function formatFuturePickLabel(
  pick: GmDraftPick,
  teams: GmTeam[]
): string {
  const origin = teams.find((team) => team.id === pick.originalTeamId);
  const round = pick.round === 1 ? "1st" : "2nd";
  const tag = origin?.abbr ?? pick.originalTeamId.toUpperCase();
  const via =
    pick.originalTeamId !== pick.ownerTeamId
      ? ` via ${teams.find((team) => team.id === pick.ownerTeamId)?.abbr ?? "trade"}`
      : "";
  const protect =
    pick.protectionTopN && pick.protectionTopN > 0
      ? ` (top-${pick.protectionTopN} protected)`
      : "";
  return `${pick.season} ${tag} ${round}${via}${protect}`;
}

function tonightLabel(state: GmLeagueState, slot: number): string {
  const owner = pickOwnerAt(state, slot) ?? "?";
  return `#${slot + 1} tonight (${teamAbbr(state, owner)})`;
}

function futurePicksOwned(state: GmLeagueState, teamId: string): GmDraftPick[] {
  const team = state.teams.find((club) => club.id === teamId);
  if (!team) return [];
  return [...team.draftPicks]
    .filter((pick) => pick.season > state.season && pick.ownerTeamId === teamId)
    .sort(
      (a, b) =>
        pickTradePoints(state, b) - pickTradePoints(state, a) ||
        a.season - b.season ||
        a.round - b.round
    );
}

/**
 * Build the cheapest fair sweetener stack so `basePoints + sweets` covers `need`.
 * Returns null when the club cannot pay.
 */
function sweetenerStack(
  state: GmLeagueState,
  teamId: string,
  basePoints: number,
  need: number,
  maxPicks = 3
): { ids: string[]; points: number; labels: string[] } | null {
  const pool = futurePicksOwned(state, teamId);
  const ids: string[] = [];
  const labels: string[] = [];
  let points = basePoints;
  for (const pick of pool) {
    if (points >= need) break;
    if (ids.length >= maxPicks) break;
    ids.push(pick.id);
    labels.push(formatFuturePickLabel(pick, state.teams));
    points += pickTradePoints(state, pick);
  }
  if (points < need) return null;
  return { ids, points, labels };
}

/**
 * Draft-night calls. When you are on the clock, clubs later in the order try to jump.
 * When a board name is sliding, you get a path to move up.
 * Packages have to clear the slot curve — #1 is not sold for a mid-lottery alone.
 */
export function draftNightOffers(state: GmLeagueState): DraftNightOffer[] {
  const sealed = ensureDraftOrder(state);
  const order = sealed.draftOrder ?? [];
  const idx = sealed.draftPickIndex ?? 0;
  if (!order.length || idx >= order.length) return [];
  const user = sealed.userTeamId;
  const onClock = order[idx] === user;
  const offers: DraftNightOffer[] = [];
  const userTeam = sealed.teams.find((team) => team.id === user);
  if (!userTeam) return [];

  if (onClock) {
    const earlyPts = draftSlotTradePoints(idx + 1);
    // #1 demands near-full value; later slots allow a small haircut.
    const need = earlyPts * (idx === 0 ? 0.97 : idx <= 3 ? 0.92 : 0.88);
    for (let later = idx + 1; later < Math.min(order.length, idx + 14); later++) {
      const partnerId = order[later]!;
      if (partnerId === user) continue;
      const partner = sealed.teams.find((team) => team.id === partnerId);
      if (!partner || partner.ownerGoal === "tank") continue;
      const latePts = draftSlotTradePoints(later + 1);
      const stack = sweetenerStack(sealed, partnerId, latePts, need, idx === 0 ? 3 : 2);
      if (!stack) continue;
      const falling = fallingProspects(sealed, 3)[0];
      const youSend = [tonightLabel(sealed, idx)];
      const youGet = [tonightLabel(sealed, later), ...stack.labels];
      offers.push({
        id: `down-${partnerId}-${later}`,
        partnerTeamId: partnerId,
        yourSlot: idx,
        theirSlot: later,
        upSweetenerIds: stack.ids,
        direction: "down",
        youSend,
        youGet,
        youSendPoints: earlyPts,
        youGetPoints: stack.points,
        blurb: falling
          ? `${partner.abbr} wants #${idx + 1} to take ${falling.player.name} (mock #${falling.mockRank}).`
          : `${partner.abbr} wants to jump to #${idx + 1}.`,
      });
      if (offers.length >= 3) break;
    }
    return offers;
  }

  const userSlots = order
    .map((teamId, slot) => ({ teamId, slot }))
    .filter((row) => row.slot > idx && row.teamId === user);
  const nextUser = userSlots[0];
  if (!nextUser || nextUser.slot - idx > 14) return [];
  const falling = fallingProspects(sealed, 3)[0];
  const topLeft = classMockBoard(sealed).find((player) =>
    sealed.draftPool.includes(player.id)
  );
  if (!falling && !topLeft) return [];
  const clockTeam = order[idx]!;
  if (clockTeam === user) return [];
  const partner = sealed.teams.find((team) => team.id === clockTeam);
  if (!partner) return [];

  const earlyPts = draftSlotTradePoints(idx + 1);
  const latePts = draftSlotTradePoints(nextUser.slot + 1);
  const need = earlyPts * (idx === 0 ? 0.97 : idx <= 3 ? 0.92 : 0.88);
  const stack = sweetenerStack(sealed, user, latePts, need, idx === 0 ? 3 : 2);
  if (!stack) return [];

  const target = falling?.player ?? topLeft!;
  const mock = falling?.mockRank ?? mockRankOf(sealed, target.id);
  const youSend = [tonightLabel(sealed, nextUser.slot), ...stack.labels];
  const youGet = [tonightLabel(sealed, idx)];
  offers.push({
    id: `up-${clockTeam}-${idx}`,
    partnerTeamId: clockTeam,
    yourSlot: nextUser.slot,
    theirSlot: idx,
    upSweetenerIds: stack.ids,
    direction: "up",
    youSend,
    youGet,
    youSendPoints: stack.points,
    youGetPoints: earlyPts,
    blurb: `${target.name} is still there (mock #${mock}). ${partner.abbr} will sell #${idx + 1}.`,
  });
  return offers;
}

/** Swap two remaining slots. The club moving up pays the sweetener picks. */
export function applyDraftNightTrade(
  state: GmLeagueState,
  offer: DraftNightOffer
): GmLeagueState {
  const sealed = ensureDraftOrder(state);
  const order = [...(sealed.draftOrder ?? [])];
  if (!order.length) return state;
  const a = order[offer.yourSlot];
  const b = order[offer.theirSlot];
  if (!a || !b) return state;
  order[offer.yourSlot] = b;
  order[offer.theirSlot] = a;

  const movingUpId = offer.direction === "up" ? sealed.userTeamId : offer.partnerTeamId;
  const movingDownId = offer.direction === "up" ? offer.partnerTeamId : sealed.userTeamId;
  const sweetIds = new Set(offer.upSweetenerIds);
  const incoming =
    sealed.teams
      .find((club) => club.id === movingUpId)
      ?.draftPicks.filter((pick) => sweetIds.has(pick.id))
      .map((pick) => ({ ...pick, ownerTeamId: movingDownId })) ?? [];
  const teams = sealed.teams.map((team) => {
    if (team.id === movingUpId) {
      return {
        ...team,
        draftPicks: team.draftPicks.filter((pick) => !sweetIds.has(pick.id)),
      };
    }
    if (team.id === movingDownId) {
      return { ...team, draftPicks: [...team.draftPicks, ...incoming] };
    }
    return team;
  });

  const up = sealed.teams.find((team) => team.id === movingUpId);
  const down = sealed.teams.find((team) => team.id === movingDownId);
  const sweetLabels = offer.upSweetenerIds
    .map((id) => {
      const pick = sealed.teams
        .flatMap((team) => team.draftPicks)
        .find((row) => row.id === id);
      return pick ? formatFuturePickLabel(pick, sealed.teams) : null;
    })
    .filter((label): label is string => Boolean(label));
  const early = Math.min(offer.yourSlot, offer.theirSlot) + 1;
  const late = Math.max(offer.yourSlot, offer.theirSlot) + 1;
  const sweetLine = sweetLabels.length
    ? ` Sweeteners: ${sweetLabels.join(", ")}.`
    : "";
  return {
    ...sealed,
    draftOrder: order,
    teams,
    news: [
      {
        id: `news-dtrade-${offer.id}`,
        day: sealed.day,
        season: sealed.season,
        headline: `${up?.abbr ?? "A club"} trades up to pick #${early}`,
        body: `${down?.abbr ?? "The partner"} moves to #${late}.${sweetLine} ${offer.blurb}`,
        tone: "info" as const,
      },
      ...sealed.news,
    ].slice(0, 50),
    updatedAt: new Date().toISOString(),
  };
}

