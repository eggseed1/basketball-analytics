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
function countOn(on: boolean[]): number { return on.filter(Boolean).length * 2; }

export type ChartRow = { id: string; on: boolean[]; minutes: number };

type ShiftPlayer = {
  id: string;
  minutes: number;
  starter: boolean;
  position?: GmPlayer["position"];
};

export function paintShifts(input: {
  players: ShiftPlayer[];
  coaching?: GmCoaching;
}): ChartRow[] {
  const active = input.players.filter(p => p.minutes > 0);
  const rows = input.players.map(p => ({ id: p.id, on: Array<boolean>(SHIFT_SLOTS).fill(false), minutes: 0 }));
  if (active.length < 5) return rows;
  const sum = active.reduce((n, p) => n + p.minutes, 0);
  const target = new Map(active.map(p => [p.id, Math.min(24, p.minutes / sum * 120)]));
  const remaining = new Map(active.map(p => [p.id, Math.floor(target.get(p.id)!)]));
  let left = 120 - [...remaining.values()].reduce((n, v) => n + v, 0);
  while (left > 0) {
    const candidate = [...active].filter(p => remaining.get(p.id)! < 24).sort((a, b) =>
      (target.get(b.id)! - remaining.get(b.id)!) - (target.get(a.id)! - remaining.get(a.id)!) || a.id.localeCompare(b.id))[0];
    if (!candidate) break;
    remaining.set(candidate.id, remaining.get(candidate.id)! + 1); left--;
  }
  const byId = new Map(rows.map(row => [row.id, row]));
  const consecutive = new Map<string, number>();
  const creators = new Set((input.coaching?.playThrough ?? []).filter((id): id is string => Boolean(id)));
  if (!creators.size) active.filter(p => p.position === "PG" || p.position === "SG").sort((a, b) => b.minutes - a.minutes).slice(0, 2).forEach(p => creators.add(p.id));
  const closing = (input.coaching?.closingLineup ?? []).filter(id => active.some(p => p.id === id));
  for (let slot = 0; slot < SHIFT_SLOTS; slot++) {
    const slotsLeft = SHIFT_SLOTS - slot;
    const mandatory = active.filter(p => remaining.get(p.id)! >= slotsLeft);
    const selected = [...mandatory];
    for (const position of ["C", "PG", "SG", "SF", "PF"] as const) {
      const pool = active.filter(p => p.position === position && remaining.get(p.id)! > 0);
      if (selected.length < 5 && !selected.some(p => p.position === position) && pool.reduce((n, p) => n + remaining.get(p.id)!, 0) >= slotsLeft) {
        const next = pool.sort((a, b) => remaining.get(b.id)! - remaining.get(a.id)! || Number(b.starter) - Number(a.starter))[0];
        if (next) selected.push(next);
      }
    }
    const score = (p: ShiftPlayer) => {
      const rem = remaining.get(p.id)!;
      const reserve = closing.includes(p.id) && slot < 22 ? Math.min(2, rem) : 0;
      if (rem <= reserve) return -10000;
      const run = consecutive.get(p.id) ?? 0;
      const atPosition = active.filter(q => q.position === p.position).reduce((n, q) => n + remaining.get(q.id)!, 0);
      const repeatsSeat = p.position && selected.some(q => q.position === p.position) && atPosition <= slotsLeft;
      return rem / slotsLeft * 32 + (p.starter && (slot < 3 || slot >= 21) ? 4 : 0)
        - (repeatsSeat ? 1000 : 0)
        + (run > 0 && run < 4 ? 2 : -Math.max(0, run - 3) * 2)
        + (slot >= 22 && closing.includes(p.id) ? 100 : 0)
        + (creators.has(p.id) && !selected.some(q => creators.has(q.id)) ? 6 : 0);
    };
    while (selected.length < 5) {
      const next = active.filter(p => remaining.get(p.id)! > 0 && !selected.some(q => q.id === p.id))
        .sort((a, b) => score(b) - score(a) || a.id.localeCompare(b.id))[0];
      if (!next) break;
      selected.push(next);
    }
    for (const p of active) {
      const plays = selected.some(q => q.id === p.id);
      if (plays) { byId.get(p.id)!.on[slot] = true; remaining.set(p.id, remaining.get(p.id)! - 1); }
      consecutive.set(p.id, plays ? (consecutive.get(p.id) ?? 0) + 1 : 0);
    }
  }
  return rows.map(row => ({ ...row, minutes: countOn(row.on) }));
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
  const painted = validShiftPlan(team.coaching?.shifts, roster.map(p => p.id)) ?? rotationChart(
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
      const roster = league.players.filter(p => p.teamId === team.id);
      const injured = roster.some(outFlag);
      const backup = team.injuryRotationBackup;
      if (!injured && backup) {
        const rosterIds = new Set(roster.map(p => p.id));
        if (Object.values(backup.starters).every(id => !id || rosterIds.has(id))) {
          return { ...team, ...backup, injuryRotationBackup: undefined };
        }
      }
      const rebuilt = resetBalancedRotation(team, league.players).team;
      return { ...rebuilt, injuryRotationBackup: injured ? backup ?? { starters: team.starters, benchOrder: team.benchOrder, coaching: team.coaching } : undefined };
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


/** Reject malformed or unavailable saved blocks instead of seating an injured player. */
export function validShiftPlan(shifts: GmCoaching["shifts"], available: string[]): ChartRow[] | null {
  if (!shifts) return null;
  const ids = new Set(available);
  const entries = Object.entries(shifts).filter(([id]) => ids.has(id));
  if (entries.some(([, on]) => !Array.isArray(on))) return null;
  const rows = entries.map(([id, on]) => ({ id, on, minutes: countOn(on) }));
  if (rows.some(row => row.on.length !== SHIFT_SLOTS || row.on.some(v => typeof v !== "boolean"))) return null;
  for (let slot = 0; slot < SHIFT_SLOTS; slot++) if (rows.filter(row => row.on[slot]).length !== 5) return null;
  return rows;
}
