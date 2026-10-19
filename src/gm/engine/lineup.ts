import type { GmPlayer, GmPosition, GmTeam } from "@/gm/types";
import { SHEET_VERSION } from "@/gm/engine/attributes";
import { clamp } from "@/gm/engine/rng";

/**
 * Who can share a spot. NBA coaches still staff a handler and a big.
 * A guard can slide to the other guard spot or to the wing.
 * A forward can slide to the wing or the other big spot.
 * A guard does not take the center's minutes, and a center does not run the point.
 */
const ACCEPTS: Record<GmPosition, GmPosition[]> = {
  PG: ["PG", "SG"],
  SG: ["SG", "PG", "SF"],
  SF: ["SF", "SG", "PF"],
  PF: ["PF", "SF", "C"],
  C: ["C", "PF"],
};

/** Scarce spots first, so wings cannot claim the center and the point. */
const FILL_ORDER: GmPosition[] = ["C", "PG", "SG", "SF", "PF"];

/** Typical starter and backup minutes at each spot. The five pairs add to 240. */
const STARTER_MINUTES: Record<GmPosition, number> = { PG: 32, SG: 32, SF: 32, PF: 30, C: 28 };
const BACKUP_MINUTES: Record<GmPosition, number> = { PG: 16, SG: 16, SF: 16, PF: 18, C: 20 };

export function slotAccepts(slot: GmPosition, position: GmPosition): boolean {
  return ACCEPTS[slot].includes(position);
}

function realMpg(player: GmPlayer): number {
  const line = player.nbaSeason;
  if (line && line.gp > 0 && line.min > 0) return line.min / line.gp;
  return player.minutesPreference || 0;
}

export function overallOf(player: GmPlayer): number {
  const sheet = player.sheet;
  if (sheet && (sheet.version === SHEET_VERSION || sheet.version == null) && sheet.overall > 0) {
    return sheet.overall;
  }
  return clamp(Math.round(68 + player.ratings.impact * 3.2), 45, 95);
}

/**
 * Minutes a healthy player should want.
 * Real minutes are the base, so a flat overall board still looks like the NBA.
 * Each point of overall above 68 adds a little. A 16-game sample at 33 a night
 * stays a starter.
 */
export function rotationTarget(player: GmPlayer): number {
  const fromReal = realMpg(player);
  const bump = (overallOf(player) - 80) * 0.08;
  const base = fromReal > 0 ? fromReal : clamp(16 + bump, 0, 36);
  return clamp(base + bump, 0, 38);
}

/** Hand minutes from the top of the rotation until 240 is used. */
export function allocateMinutes(rows: { id: string; minutes: number }[]): Record<string, number> {
  const ranked = [...rows].sort((a, b) => b.minutes - a.minutes);
  const out: Record<string, number> = {};
  let left = 240;
  for (const row of ranked) {
    const give = Math.min(left, clamp(row.minutes, 0, 38));
    out[row.id] = give;
    left -= give;
  }
  if (left > 0) {
    for (const row of [...ranked].reverse()) {
      if (left <= 0) break;
      const current = out[row.id] ?? 0;
      if (current <= 0) continue;
      const cap = Math.min(40, current + 4);
      const add = Math.min(left, cap - current);
      out[row.id] = current + add;
      left -= add;
    }
  }
  const top = ranked.find((row) => (out[row.id] ?? 0) > 0);
  if (left > 0 && top) out[top.id] = clamp((out[top.id] ?? 0) + left, 0, 42);
  for (const row of rows) if (out[row.id] == null) out[row.id] = 0;
  return out;
}

function byWish(a: GmPlayer, b: GmPlayer): number {
  return rotationTarget(b) - rotationTarget(a) || overallOf(b) - overallOf(a);
}

/**
 * Best available at the spot. A listed player who actually plays that position
 * keeps the job. A neighbor slides in only when the spot is empty or the
 * listed player is the end of the bench.
 */
function pickForSlot(slot: GmPosition, roster: GmPlayer[], used: Set<string>): GmPlayer | undefined {
  const open = roster.filter((player) => !used.has(player.id));
  const natural = open.filter((player) => player.position === slot).sort(byWish);
  const lead = natural[0];
  if (lead && rotationTarget(lead) >= 16) return lead;
  const slider = open
    .filter((player) => player.position !== slot && slotAccepts(slot, player.position))
    .sort(byWish)[0];
  if (lead && (!slider || rotationTarget(lead) + 6 >= rotationTarget(slider))) return lead;
  return slider ?? lead ?? open.sort(byWish)[0];
}

/**
 * Minutes for a roster that has to cover five spots.
 * Each spot gets a starter and a backup. The starter stays near his own
 * minute level. The extra wing does not absorb the center's minutes.
 */
export function positionalMinuteTargets(
  players: GmPlayer[],
  starters?: Partial<Record<GmPosition, string | null>>
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const player of players) out[player.id] = 0;
  const roster = players.filter((player) => rotationTarget(player) > 0);
  if (roster.length < 5) {
    for (const player of roster) out[player.id] = clamp(rotationTarget(player), 0, 36);
    return scaleMinutes(out, roster.reduce((sum, player) => sum + (out[player.id] ?? 0), 0));
  }
  const used = new Set<string>();
  const chosenStarters: Partial<Record<GmPosition, GmPlayer>> = {};
  for (const slot of FILL_ORDER) {
    const chosen = starters?.[slot];
    const named = chosen ? roster.find((player) => player.id === chosen && !used.has(player.id)) : undefined;
    const fit = named ?? pickForSlot(slot, roster, used);
    if (!fit) continue;
    chosenStarters[slot] = fit;
    used.add(fit.id);
    const wish = rotationTarget(fit);
    out[fit.id] = clamp(wish * 0.7 + STARTER_MINUTES[slot] * 0.3, 18, 36);
  }
  let spare = 0;
  for (const slot of FILL_ORDER) {
    const starter = chosenStarters[slot];
    const open = roster.filter((player) => !used.has(player.id));
    const natural = open.filter((player) => player.position === slot).sort(byWish);
    const slider = open
      .filter((player) => player.position !== slot && slotAccepts(slot, player.position))
      .sort(byWish);
    const backup = natural[0] ?? slider[0];
    const room = Math.max(0, 48 - (starter ? (out[starter.id] ?? 0) : 0));
    if (!backup || room < 4) {
      spare += BACKUP_MINUTES[slot];
      continue;
    }
    const wish = rotationTarget(backup);
    const give = Math.min(room, clamp(wish * 0.35 + BACKUP_MINUTES[slot] * 0.65, 6, 22));
    out[backup.id] = (out[backup.id] ?? 0) + give;
    used.add(backup.id);
    spare += Math.max(0, room - give);
  }
  const extras = roster
    .filter((player) => !used.has(player.id))
    .sort(byWish);
  for (const player of extras) {
    if (spare < 4) break;
    const room = Math.max(0, 24 - (out[player.id] ?? 0));
    const give = Math.min(spare, room, 12);
    if (give < 4) continue;
    out[player.id] = (out[player.id] ?? 0) + give;
    spare -= give;
  }
  const sum = Object.values(out).reduce((total, minutes) => total + minutes, 0);
  return scaleMinutes(out, sum);
}

function scaleMinutes(out: Record<string, number>, sum: number): Record<string, number> {
  if (sum <= 0) return out;
  const scale = 240 / sum;
  const next: Record<string, number> = {};
  let used = 0;
  const ids = Object.keys(out);
  for (const id of ids) {
    const minutes = Math.round((out[id] ?? 0) * scale);
    next[id] = minutes;
    used += minutes;
  }
  const top = ids.sort((a, b) => (next[b] ?? 0) - (next[a] ?? 0))[0];
  if (top) next[top] = clamp((next[top] ?? 0) + (240 - used), 0, 42);
  return next;
}

export function autoSetLineup(team: GmTeam, players: GmPlayer[]): GmTeam {
  const roster = players.filter((p) => p.teamId === team.id).sort(byWish);
  const starters: GmTeam["starters"] = {
    PG: null,
    SG: null,
    SF: null,
    PF: null,
    C: null,
  };
  const used = new Set<string>();
  for (const pos of FILL_ORDER) {
    const fit = pickForSlot(pos, roster, used);
    if (!fit) continue;
    starters[pos] = fit.id;
    used.add(fit.id);
  }
  const targets = positionalMinuteTargets(roster, starters);
  const benchOrder = roster
    .filter((p) => !used.has(p.id))
    .sort((a, b) => (targets[b.id] ?? 0) - (targets[a.id] ?? 0) || byWish(a, b))
    .map((p) => p.id);
  return { ...team, starters, benchOrder };
}
