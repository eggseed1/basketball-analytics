import type {
  GmCoaching,
  GmDefense,
  GmOffense,
  GmPlayer,
  GmRotationDepth,
  GmTeam,
  GmTempo,
} from "@/gm/types";
import {
  autoSetLineup,
  clampRotationDepth,
  DEFAULT_ROTATION_DEPTH,
  positionalMinutePlan,
  positionalMinuteTargets,
  rotationQuality,
  rotationTarget,
  slotAccepts,
} from "@/gm/engine/lineup";
import type { GmPosition } from "@/gm/types";
import { clamp } from "@/gm/engine/rng";

export {
  clampRotationDepth,
  minutesPerPosition,
  positionalMinutePlan,
  resolveCoverSlot,
  rotationQuality,
  POSITION_MINUTE_TARGET,
} from "@/gm/engine/lineup";

export const ROTATION_DEPTH_OPTIONS: Array<{
  id: GmRotationDepth;
  label: string;
  detail: string;
}> = [
  { id: 6, label: "6-man", detail: "Death lineup. One bench seat shares the scraps." },
  { id: 7, label: "7-man", detail: "Starters eat the night. Thin bench." },
  { id: 8, label: "8-man", detail: "Tight book. Five starters and three backups." },
  { id: 9, label: "9-man", detail: "One extra body. A ninth eats short minutes." },
  { id: 10, label: "10-man", detail: "Full dress. Minutes spread a little thinner." },
  { id: 11, label: "11-man", detail: "Typical NBA night. Five starters and a deep bench." },
  { id: 12, label: "12-man", detail: "Development night. Almost everyone touches the ball." },
  { id: 13, label: "13-man", detail: "Everyone dresses. Stars still lead; crumbs for the end." },
];

export const OFFENSE_OPTIONS: Array<{ id: GmOffense; label: string; detail: string }> = [
  {
    id: "balanced",
    label: "Balanced",
    detail: "Shot mix stays with each player's real tendencies.",
  },
  {
    id: "pace_space",
    label: "Pace and space",
    detail: "Faster game, more threes, fewer crashes on the offensive glass.",
  },
  {
    id: "pick_roll",
    label: "Pick and roll",
    detail: "The first option handles more of the creation, and the team assists more.",
  },
  {
    id: "motion",
    label: "Motion",
    detail: "The ball moves. Assists rise and turnovers ease off.",
  },
  {
    id: "post",
    label: "Post",
    detail: "Fewer threes, more free throws, and the first option gets the touches.",
  },
  {
    id: "iso",
    label: "Isolation",
    detail: "The first option takes a larger share of the shots. Assists fall.",
  },
];

export const DEFENSE_OPTIONS: Array<{ id: GmDefense; label: string; detail: string }> = [
  {
    id: "balanced",
    label: "Balanced",
    detail: "No extra pressure on any part of the floor.",
  },
  {
    id: "drop",
    label: "Drop",
    detail: "The big sits back. More blocks for you, more threes for them.",
  },
  {
    id: "switch",
    label: "Switch",
    detail: "You stay with the ball. They assist less and shoot fewer threes.",
  },
  {
    id: "no_middle",
    label: "No middle",
    detail: "Force them off the three-point line and toward the side.",
  },
  {
    id: "pressure",
    label: "Pressure",
    detail: "You gamble for steals. Both clubs turn it over more.",
  },
  {
    id: "wall",
    label: "Wall",
    detail: "Pack the paint. They shoot more threes and grab fewer offensive boards.",
  },
];

export const TEMPO_OPTIONS: Array<{ id: GmTempo; label: string }> = [
  { id: "slow", label: "Slow" },
  { id: "normal", label: "Normal" },
  { id: "fast", label: "Fast" },
];

/** 24 blocks of 2 minutes. A quarter is 6 blocks. */
export const SHIFT_SLOTS = 24;
const PER_QUARTER = 6;

export type ChartRow = { id: string; on: boolean[]; minutes: number };

type ShiftPlayer = {
  id: string;
  minutes: number;
  starter: boolean;
  position?: GmPlayer["position"];
};

/**
 * When the first change hits, from 539 NBA games.
 * The median team subs at 5 minutes, one or two players at a time.
 * The quickest groups go at 4. The slowest wait until 6 and a half.
 * The last starter to sit does it around the middle of the second quarter.
 */
function shiftTiming(coaching?: GmCoaching): {
  sitAt: number;
  stagger: number;
  anchorAt: number;
} {
  const fast =
    coaching?.tempo === "fast" ||
    coaching?.offense === "pace_space" ||
    coaching?.defense === "pressure";
  const slow =
    coaching?.tempo === "slow" ||
    coaching?.offense === "post" ||
    coaching?.offense === "iso" ||
    coaching?.defense === "drop";
  const stagger =
    fast || coaching?.offense === "motion" || coaching?.defense === "switch" ? 1 : 0;
  if (fast) return { sitAt: 2, stagger, anchorAt: 8 };
  if (slow) return { sitAt: 3, stagger: 0, anchorAt: 12 };
  return { sitAt: 2, stagger, anchorAt: 9 };
}

function countOn(on: boolean[]): number {
  return on.reduce((sum, slot) => sum + (slot ? 2 : 0), 0);
}

/**
 * Real shifts. Starters open a quarter. One or two sit a few minutes later
 * and come back to close it. The star plays through that first change and
 * takes one rest in the middle of the game. Five players are on every block.
 */
export function paintShifts(input: {
  players: ShiftPlayer[];
  coaching?: GmCoaching;
}): ChartRow[] {
  const timing = shiftTiming(input.coaching);
  const active = input.players
    .filter((player) => player.minutes >= 2)
    .sort((a, b) => b.minutes - a.minutes || Number(b.starter) - Number(a.starter));
  const on = new Map<string, boolean[]>();
  for (const player of input.players) on.set(player.id, Array(SHIFT_SLOTS).fill(false));
  if (active.length < 5) {
    return input.players.map((player) => ({
      id: player.id,
      on: on.get(player.id) ?? Array(SHIFT_SLOTS).fill(false),
      minutes: 0,
    }));
  }

  const starterIds = new Set(active.filter((player) => player.starter).map((player) => player.id));
  const starters = active.filter((player) => starterIds.has(player.id)).slice(0, 5);
  for (const player of active) {
    if (starters.length >= 5) break;
    if (!starters.some((starter) => starter.id === player.id)) starters.push(player);
  }
  const anchorId =
    (input.coaching?.playThrough?.[0] &&
      active.some((player) => player.id === input.coaching?.playThrough?.[0]) &&
      input.coaching.playThrough[0]) ||
    starters[0]?.id ||
    active[0]!.id;
  const keepBig =
    input.coaching?.offense === "post" || input.coaching?.defense === "drop"
      ? active.find((player) => player.position === "C" && player.id !== anchorId)?.id
      : undefined;
  const roles = starters.filter((player) => player.id !== anchorId && player.id !== keepBig);
  const bench = active.filter(
    (player) => !starters.some((starter) => starter.id === player.id) && player.id !== keepBig
  );

  const mark = (id: string, slot: number, value: boolean) => {
    const row = on.get(id);
    if (row && slot >= 0 && slot < SHIFT_SLOTS) row[slot] = value;
  };
  const sitBlock = (id: string, start: number, length: number) => {
    for (let slot = 0; slot < SHIFT_SLOTS; slot++) mark(id, slot, true);
    const from = clamp(start, 0, SHIFT_SLOTS);
    const to = clamp(start + length, from, SHIFT_SLOTS);
    for (let slot = from; slot < to; slot++) mark(id, slot, false);
  };

  const anchorTarget = active.find((player) => player.id === anchorId)?.minutes ?? 36;
  sitBlock(anchorId, timing.anchorAt, clamp(Math.round((48 - anchorTarget) / 2), 4, 10));
  if (keepBig) {
    const bigTarget = active.find((player) => player.id === keepBig)?.minutes ?? 28;
    sitBlock(keepBig, Math.min(timing.anchorAt + 2, 14), clamp(Math.round((48 - bigTarget) / 2), 4, 8));
  }

  roles.forEach((role, index) => {
    const off = clamp(Math.round((48 - role.minutes) / 2), 4, 14);
    const perQuarter = Math.max(2, Math.min(3, Math.round(off / 4)));
    for (let quarter = 0; quarter < 4; quarter++) {
      const quarterStart = quarter * PER_QUARTER;
      let start = quarterStart + timing.sitAt + index * timing.stagger;
      if (start + perQuarter > quarterStart + PER_QUARTER) {
        start = quarterStart + PER_QUARTER - perQuarter;
      }
      for (let slot = quarterStart; slot < quarterStart + PER_QUARTER; slot++) {
        mark(role.id, slot, slot < start || slot >= start + perQuarter);
      }
    }
  });

  const floor = (slot: number) =>
    active.filter((player) => on.get(player.id)?.[slot]).map((player) => player.id);

  const replacement = (role: GmPosition | undefined, ids: string[]) => {
    const waiting = bench.filter((player) => !ids.includes(player.id));
    const pool = waiting.length ? waiting : active.filter((player) => !ids.includes(player.id) && !starterIds.has(player.id));
    if (!role) return pool[0];
    return (
      pool.find((player) => player.position === role) ??
      pool.find((player) => player.position && slotAccepts(role, player.position)) ??
      pool[0]
    );
  };

  const seatOrder: GmPosition[] = ["C", "PG", "PF", "SG", "SF"];
  for (let slot = 0; slot < SHIFT_SLOTS; slot++) {
    let ids = floor(slot);
    let guard = 0;
    while (ids.length < 5 && guard < 12) {
      guard += 1;
      const sitting = starters
        .filter((player) => !ids.includes(player.id))
        .sort(
          (a, b) =>
            seatOrder.indexOf(a.position ?? "SF") - seatOrder.indexOf(b.position ?? "SF")
        );
      const next = replacement(sitting[0]?.position, ids);
      if (next) {
        mark(next.id, slot, true);
        ids = floor(slot);
        continue;
      }
      const back =
        sitting.find((player) => player.id !== anchorId) ?? sitting[0];
      if (!back) break;
      mark(back.id, slot, true);
      ids = floor(slot);
    }
    while (ids.length > 5) {
      const extra = [...ids].reverse().find((id) => id !== anchorId) ?? ids[ids.length - 1]!;
      mark(extra, slot, false);
      ids = floor(slot);
    }
  }

  return input.players.map((player) => {
    const row = on.get(player.id) ?? Array(SHIFT_SLOTS).fill(false);
    return { id: player.id, on: row, minutes: countOn(row) };
  });
}

/**
 * Sit or insert one player for a single two-minute block.
 * The floor stays at five. Sitting brings in the next man. Inserting sits the smallest minute load.
 */
export function toggleShift(rows: ChartRow[], playerId: string, slot: number): ChartRow[] {
  if (slot < 0 || slot >= SHIFT_SLOTS) return rows;
  const next = rows.map((row) => ({ ...row, on: [...row.on] }));
  const actor = next.find((row) => row.id === playerId);
  if (!actor) return rows;
  const onFloor = () => next.filter((row) => row.on[slot]);
  if (actor.on[slot]) {
    const waiting = next
      .filter((row) => row.id !== playerId && !row.on[slot])
      .sort((a, b) => b.minutes - a.minutes || a.id.localeCompare(b.id));
    const nextMan = waiting[0];
    if (!nextMan) return rows;
    actor.on[slot] = false;
    nextMan.on[slot] = true;
  } else {
    const sitting = onFloor().sort((a, b) => a.minutes - b.minutes || a.id.localeCompare(b.id));
    const out = sitting[0];
    if (!out) return rows;
    out.on[slot] = false;
    actor.on[slot] = true;
  }
  if (onFloor().length !== 5) return rows;
  return next.map((row) => ({ ...row, minutes: countOn(row.on) }));
}

/** Chart rows for the coaching screen. Each lit block is two minutes. */
export function rotationChart(
  rows: Array<{ id: string; minutes: number; starter: boolean; position?: GmPlayer["position"] }>,
  coaching?: GmCoaching
): ChartRow[] {
  return paintShifts({ players: rows, coaching });
}

export function schemeHeadline(coaching?: GmCoaching): string | null {
  if (!coaching) return null;
  const depth = clampRotationDepth(coaching.rotationDepth);
  const changed =
    coaching.offense !== "balanced" ||
    coaching.defense !== "balanced" ||
    coaching.tempo !== "normal" ||
    depth !== DEFAULT_ROTATION_DEPTH ||
    !!coaching.playThrough[0] ||
    !!coaching.minutes;
  if (!changed) return null;
  const offense = OFFENSE_OPTIONS.find((option) => option.id === coaching.offense)?.label ?? "Balanced";
  const defense = DEFENSE_OPTIONS.find((option) => option.id === coaching.defense)?.label ?? "Balanced";
  const tempo =
    coaching.tempo === "fast" ? "Fast " : coaching.tempo === "slow" ? "Slow " : "";
  const depthBit = depth !== DEFAULT_ROTATION_DEPTH ? ` · ${depth}-man` : "";
  return `${tempo}${offense}, ${defense.toLowerCase()} defense${depthBit}`;
}

/** The shift plan a team would send out tonight, from saved minutes or the default chart. */
export function shiftSnapshot(
  team: GmTeam,
  players: GmPlayer[]
): Array<{ playerId: string; playerName: string; on: boolean[] }> {
  const roster = players.filter(
    (player) =>
      player.teamId === team.id && (!player.injury || player.injury.gamesRemaining <= 0)
  );
  const saved = team.coaching?.minutes;
  const starterIds = new Set(
    Object.values(team.starters).filter((id): id is string => !!id)
  );
  const targets = positionalMinuteTargets(roster, team.starters);
  const cover = team.coaching?.coverSlot;
  const painted = rotationChart(
    roster.map((player) => ({
      id: player.id,
      minutes: saved ? (saved[player.id] ?? 0) : (targets[player.id] ?? rotationTarget(player)),
      starter: starterIds.has(player.id),
      position: cover?.[player.id] ?? player.position,
    })),
    coachingOf(team)
  );
  const names = new Map(roster.map((player) => [player.id, player.name]));
  return painted
    .filter((row) => row.minutes > 0)
    .map((row) => ({
      playerId: row.id,
      playerName: names.get(row.id) ?? row.id,
      on: row.on,
    }));
}

export function coachingOf(team: GmTeam): GmCoaching {
  const coach = team.staff?.headCoach;
  return {
    offense: coach?.offenseStyle ?? "balanced",
    defense: coach?.defenseStyle ?? "balanced",
    tempo: coach?.tempo ?? "normal",
    ...team.coaching,
    playThrough: team.coaching?.playThrough ?? [null, null],
    rotationDepth: clampRotationDepth(
      team.coaching?.rotationDepth ?? DEFAULT_ROTATION_DEPTH
    ),
  };
}

export function injured(player: GmPlayer): boolean {
  return !!player.injury && player.injury.gamesRemaining > 0;
}

/**
 * Balanced minute totals by position (not the shift-chart rewrite).
 * Injured players stay at 0. PaintShifts only visualizes when people play;
 * it must not become the source of the 240-minute book.
 */
export function suggestedMinutePlan(
  team: GmTeam,
  players: GmPlayer[]
): { minutes: Record<string, number>; coverSlot: Record<string, GmPosition> } {
  const roster = players.filter((player) => player.teamId === team.id);
  const healthy = roster.filter((player) => !injured(player));
  const depth = clampRotationDepth(coachingOf(team).rotationDepth);
  const plan = positionalMinutePlan(healthy, { starters: team.starters, depth });
  const minutes: Record<string, number> = {};
  for (const player of roster) {
    minutes[player.id] = injured(player) ? 0 : (plan.minutes[player.id] ?? 0);
  }
  return { minutes, coverSlot: plan.coverSlot };
}

/** Minutes that fall out of the positional book. Injured players stay at 0. */
export function suggestedMinutes(team: GmTeam, players: GmPlayer[]): Record<string, number> {
  return suggestedMinutePlan(team, players).minutes;
}

/**
 * Keep the current starters, rebuild a balanced 240-minute book by position.
 * Returns minutes, cover slots, and a short read on how the room looks.
 */
export function autoBalanceRotation(
  team: GmTeam,
  players: GmPlayer[]
): {
  minutes: Record<string, number>;
  coverSlot: Record<string, GmPosition>;
  quality: number;
} {
  const plan = suggestedMinutePlan(team, players);
  const roster = players.filter((player) => player.teamId === team.id);
  return {
    minutes: plan.minutes,
    coverSlot: plan.coverSlot,
    quality: rotationQuality(roster, plan.minutes, plan.coverSlot),
  };
}

/**
 * How much the current minutes book helps the sim.
 * Balanced depth scores higher than five stars at 40.
 */
export function coachingBoost(team: GmTeam, players: GmPlayer[]): number {
  const roster = players.filter((player) => player.teamId === team.id);
  const minutes = team.coaching?.minutes ?? {};
  if (!roster.length || Object.keys(minutes).length === 0) return 0.7;
  return rotationQuality(roster, minutes, team.coaching?.coverSlot);
}

/** Full reset: auto lineup, then balanced minutes. */
export function resetBalancedRotation(
  team: GmTeam,
  players: GmPlayer[]
): { team: GmTeam; minutes: Record<string, number> } {
  const lined = autoSetLineup(team, players);
  const plan = suggestedMinutePlan(lined, players);
  return {
    team: {
      ...lined,
      coaching: {
        ...coachingOf(lined),
        minutes: plan.minutes,
        coverSlot: plan.coverSlot,
      },
    },
    minutes: plan.minutes,
  };
}

/** Seed / league-wide pass: same book the coaching "Reset" button builds. */
export function applyBalancedRotations<T extends { teams: GmTeam[]; players: GmPlayer[] }>(
  league: T
): T {
  return {
    ...league,
    teams: league.teams.map(
      (team) => resetBalancedRotation(team, league.players).team
    ),
  };
}

function outFlag(player: GmPlayer | undefined): boolean {
  return Boolean(player?.injury && player.injury.gamesRemaining > 0);
}

/** Teams whose available roster changed because someone went out or came back. */
export function teamsNeedingInjuryRebalance(
  before: GmPlayer[],
  after: GmPlayer[]
): Set<string> {
  const prev = new Map(before.map((player) => [player.id, player]));
  const teams = new Set<string>();
  for (const player of after) {
    const old = prev.get(player.id);
    if (outFlag(old) === outFlag(player)) continue;
    if (player.teamId) teams.add(player.teamId);
    if (old?.teamId) teams.add(old.teamId);
  }
  return teams;
}

/**
 * Rebuild starters + balanced minutes for clubs that just lost or regained a body.
 * Keeps injured players at 0 and puts them back in the book when they clear.
 */
export function rebalanceForInjuryChanges<
  T extends { teams: GmTeam[]; players: GmPlayer[] },
>(league: T, beforePlayers: GmPlayer[]): T {
  const teamIds = teamsNeedingInjuryRebalance(beforePlayers, league.players);
  if (!teamIds.size) return league;
  return {
    ...league,
    teams: league.teams.map((team) => {
      if (!teamIds.has(team.id)) return team;
      return resetBalancedRotation(team, league.players).team;
    }),
  };
}

export type RateMods = {
  three: number;
  two: number;
  ft: number;
  ast: number;
  tov: number;
  stl: number;
  blk: number;
  orb: number;
};

const EVEN: RateMods = {
  three: 1,
  two: 1,
  ft: 1,
  ast: 1,
  tov: 1,
  stl: 1,
  blk: 1,
  orb: 1,
};

function times(a: RateMods, b: RateMods): RateMods {
  return {
    three: a.three * b.three,
    two: a.two * b.two,
    ft: a.ft * b.ft,
    ast: a.ast * b.ast,
    tov: a.tov * b.tov,
    stl: a.stl * b.stl,
    blk: a.blk * b.blk,
    orb: a.orb * b.orb,
  };
}

function offenseMods(offense: GmOffense): RateMods {
  if (offense === "pace_space") return { ...EVEN, three: 1.16, ast: 1.04, orb: 0.9 };
  if (offense === "pick_roll") return { ...EVEN, ast: 1.1 };
  if (offense === "motion") return { ...EVEN, ast: 1.12, tov: 0.92, three: 1.04 };
  if (offense === "post") return { ...EVEN, three: 0.86, ft: 1.1 };
  if (offense === "iso") return { ...EVEN, ast: 0.84, tov: 1.08 };
  return { ...EVEN };
}

/** What this defense does to the other team. */
function defenseOnOpponent(defense: GmDefense): RateMods {
  if (defense === "drop") return { ...EVEN, three: 1.08, two: 0.97 };
  if (defense === "switch") return { ...EVEN, three: 0.94, ast: 0.92 };
  if (defense === "no_middle") return { ...EVEN, three: 0.82, two: 1.03, ast: 0.96 };
  if (defense === "pressure") return { ...EVEN, tov: 1.14, ast: 0.95 };
  if (defense === "wall") return { ...EVEN, two: 0.94, three: 1.1, orb: 0.88 };
  return { ...EVEN };
}

/** Stocks the defense creates for its own box score. */
function defenseForSelf(defense: GmDefense): RateMods {
  if (defense === "drop") return { ...EVEN, blk: 1.12 };
  if (defense === "switch") return { ...EVEN, stl: 1.05 };
  if (defense === "pressure") return { ...EVEN, stl: 1.16, tov: 1.06 };
  if (defense === "wall") return { ...EVEN, blk: 1.08 };
  return { ...EVEN };
}

/** Mods for the team on offense, given its own scheme and the opponent's defense. */
export function modsForTeam(own?: GmCoaching, opponent?: GmCoaching): RateMods {
  return times(
    times(offenseMods(own?.offense ?? "balanced"), defenseOnOpponent(opponent?.defense ?? "balanced")),
    defenseForSelf(own?.defense ?? "balanced")
  );
}

export function usageBoost(player: GmPlayer, coaching?: GmCoaching): number {
  if (!coaching) return 1;
  const [first, second] = coaching.playThrough;
  if (player.id === first) {
    if (coaching.offense === "iso") return 1.28;
    if (coaching.offense === "post") return 1.22;
    if (coaching.offense === "pick_roll") return 1.16;
    return 1.1;
  }
  if (player.id === second) return 1.08;
  return 1;
}

export function extraAst(player: GmPlayer, coaching?: GmCoaching): number {
  if (!coaching) return 1;
  if (coaching.offense === "pick_roll" && player.id === coaching.playThrough[0]) return 1.16;
  return 1;
}

export function extraFt(player: GmPlayer, coaching?: GmCoaching): number {
  if (!coaching) return 1;
  if (coaching.offense === "post" && player.id === coaching.playThrough[0]) return 1.14;
  return 1;
}

/** Shared pace wish. A fast club speeds the game for both sides. */
export function paceWish(coaching?: GmCoaching): number {
  if (!coaching) return 1;
  let pace = coaching.tempo === "fast" ? 1.05 : coaching.tempo === "slow" ? 0.95 : 1;
  if (coaching.offense === "pace_space") pace *= 1.04;
  if (coaching.offense === "post" || coaching.offense === "iso") pace *= 0.97;
  if (coaching.defense === "pressure") pace *= 1.02;
  return pace;
}
