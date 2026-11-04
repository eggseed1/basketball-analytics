/**
 * A regulation rotation is a shared 240-minute budget, not a set of
 * independent sliders. Manual edits use two-minute blocks, matching the
 * actual substitution planner, and immediately move time between players.
 *
 * Pure helpers are shared by the store, UI and old-save repair. No implicit
 * reroll, no per-position quota, and no silent simulator-only normalization.
 */
import type { GmPlayer } from "@/gm/types";
import { MAX_PLAYER_MINUTES } from "@/gm/engine/lineup";

export const TEAM_MINUTE_BUDGET = 240;
export const MINUTE_STEP = 2;

export type MinuteMovement = { playerId: string; change: number };
export type MinuteEdit = {
  minutes: Record<string, number>;
  movements: MinuteMovement[];
  target: number;
  repairedBeforeEdit: boolean;
};
type PlayerRow = Pick<GmPlayer, "id" | "injury">;

const healthy = (player: PlayerRow) =>
  !player.injury || player.injury.gamesRemaining <= 0;
const roundStep = (value: number) =>
  Math.round((Number.isFinite(value) ? value : 0) / MINUTE_STEP) * MINUTE_STEP;
const minuteOf = (book: Record<string, number>, id: string) =>
  Math.max(0, Number.isFinite(book[id]) ? book[id]! : 0);

/** Five healthy players need the theoretical 48 each; otherwise cap at 44. */
export function individualMinuteCap(roster: PlayerRow[]): number {
  return roster.filter(healthy).length <= 5 ? 48 : MAX_PLAYER_MINUTES;
}

export function validMinuteBook(roster: PlayerRow[], book: Record<string, number>): boolean {
  const available = roster.filter(healthy);
  if (available.length < 5) return false;
  const cap = individualMinuteCap(roster);
  let sum = 0, active = 0;
  for (const player of roster) {
    const value = book[player.id] ?? 0;
    if (!Number.isFinite(value) || value < 0 || value > cap ||
        value % MINUTE_STEP !== 0 || (!healthy(player) && value !== 0)) return false;
    sum += value;
    if (value > 0) active++;
  }
  return sum === TEAM_MINUTE_BUDGET && active >= 5;
}

/**
 * Deterministically repair previously overbooked (e.g. nine players at 48)
 * or underbooked minute sheets. Original preferences control priority;
 * the coach suggestion breaks ties and fills a missing healthy bench.
 * A valid 240-minute book is left untouched, including manual choices.
 */
export function normalizeMinuteBook(
  roster: PlayerRow[],
  requested: Record<string, number>,
  suggested: Record<string, number> = {},
  depth = 10
): Record<string, number> {
  const result = Object.fromEntries(roster.map(player => [player.id, 0])) as Record<string, number>;
  const available = roster.filter(healthy);
  if (available.length < 5) return result;
  if (validMinuteBook(roster, requested)) {
    for (const player of available) result[player.id] = requested[player.id] ?? 0;
    return result;
  }

  const cap = individualMinuteCap(roster);
  const slots = cap / MINUTE_STEP;
  const ranked = [...available].sort((a, b) =>
    minuteOf(requested, b.id) - minuteOf(requested, a.id) ||
    minuteOf(suggested, b.id) - minuteOf(suggested, a.id) ||
    a.id.localeCompare(b.id)
  );
  const used = ranked.filter(p => minuteOf(requested, p.id) > 0);
  // Preserve chosen depth when repairing an invalid historical book.
  const limit = Math.max(Math.ceil(TEAM_MINUTE_BUDGET / cap),
    Math.min(available.length, Math.max(5, Math.round(depth))));
  const selected = used.slice(0, limit);
  for (const player of ranked) {
    if (selected.length >= Math.ceil(TEAM_MINUTE_BUDGET / cap)) break;
    if (!selected.some(p => p.id === player.id)) selected.push(player);
  }
  const weights = Object.fromEntries(selected.map(p => [
    p.id, Math.max(1, minuteOf(requested, p.id) || minuteOf(suggested, p.id) || 12),
  ])) as Record<string, number>;
  const weightTotal = Object.values(weights).reduce((sum, value) => sum + value, 0);
  const units = Object.fromEntries(selected.map(p => [p.id, 1])) as Record<string, number>;
  const totalUnits = TEAM_MINUTE_BUDGET / MINUTE_STEP;
  for (let assigned = selected.length; assigned < totalUnits; assigned++) {
    const candidate = selected.filter(p => (units[p.id] ?? 0) < slots)
      .sort((a, b) =>
        ((weights[b.id]! / weightTotal) * totalUnits - units[b.id]!) -
        ((weights[a.id]! / weightTotal) * totalUnits - units[a.id]!) ||
        weights[b.id]! - weights[a.id]! || a.id.localeCompare(b.id))[0];
    if (!candidate) break;
    units[candidate.id]!++;
  }
  for (const player of selected) result[player.id] = units[player.id]! * MINUTE_STEP;
  return result;
}

/**
 * Moving the selected slider immediately transfers exactly that many minutes
 * from or to teammates. Never edits an independent 48-minute wish list.
 * Player caps, total, healthy bodies and a five-man floor are hard constraints.
 */
export function editMinuteBook(
  roster: PlayerRow[],
  current: Record<string, number>,
  playerId: string,
  requested: number,
  suggested: Record<string, number> = {},
  depth = 10
): MinuteEdit {
  const repairedBeforeEdit = !validMinuteBook(roster, current);
  const base = normalizeMinuteBook(roster, current, suggested, depth);
  const next = { ...base };
  const actor = roster.find(p => p.id === playerId);
  if (!actor || !healthy(actor) || roster.filter(healthy).length < 5) {
    return { minutes: next, movements: [], target: base[playerId] ?? 0, repairedBeforeEdit };
  }
  const cap = individualMinuteCap(roster);
  const target = Math.max(0, Math.min(cap, roundStep(requested)));
  const available = roster.filter(p => healthy(p) && p.id !== playerId);
  const countActive = () => roster.filter(p => healthy(p) && (next[p.id] ?? 0) > 0).length;
  let guard = TEAM_MINUTE_BUDGET / MINUTE_STEP;
  while (next[playerId] !== target && guard-- > 0) {
    const grow = next[playerId]! < target;
    const actorWouldSit = !grow && next[playerId] === MINUTE_STEP;
    const needsReplacement = actorWouldSit && countActive() <= 5;
    const pool = available.filter(p => {
      const minutes = next[p.id] ?? 0;
      return grow
        ? minutes >= MINUTE_STEP &&
            !(minutes === MINUTE_STEP && countActive() <= 5)
        : minutes < cap && (!needsReplacement || minutes === 0);
    });
    if (!pool.length) break;
    const ranked = pool.sort((a, b) => {
      const am = next[a.id] ?? 0, bm = next[b.id] ?? 0;
      const aw = minuteOf(suggested, a.id), bw = minuteOf(suggested, b.id);
      if (grow) {
        // Cut current surplus before stealing minutes from a thin bench.
        return (bm - bw) - (am - aw) || bm - am || a.id.localeCompare(b.id);
      }
      // Fill teammates below their natural role, preferring existing players.
      return (bw - bm) - (aw - am) ||
        Number(bm > 0) - Number(am > 0) ||
        bw - aw || a.id.localeCompare(b.id);
    });
    const other = ranked[0]!;
    next[playerId]! += grow ? MINUTE_STEP : -MINUTE_STEP;
    next[other.id]! += grow ? -MINUTE_STEP : MINUTE_STEP;
  }
  const movements = roster
    .map(p => ({ playerId: p.id, change: (next[p.id] ?? 0) - (base[p.id] ?? 0) }))
    .filter(row => row.change !== 0);
  return { minutes: next, movements, target: next[playerId] ?? 0, repairedBeforeEdit };
}
