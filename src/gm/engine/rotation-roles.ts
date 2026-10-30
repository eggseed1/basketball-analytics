import type { GmPlayer, GmPosition, GmTeam } from "@/gm/types";
import { playerRoles } from "@/gm/engine/player-profile";

const SPOTS: GmPosition[] = ["PG", "SG", "SF", "PF", "C"];
const NEAR: Record<GmPosition, GmPosition[]> = { PG: ["SG"], SG: ["PG", "SF"], SF: ["SG", "PF"], PF: ["SF", "C"], C: ["PF"] };

export function roleFit(player: GmPlayer, spot: GmPosition): number {
  if (player.position === spot || player.listedPosition === spot) return 1;
  if (player.secondaryPosition === spot) return 0.96;
  const roles = playerRoles(player);
  if (spot === "PG" && roles.creation > 0.8 && player.heightIn < 84) return 0.94;
  if (spot === "C" && roles.interior > 0.78 && player.heightIn >= 78) return 0.91;
  return NEAR[player.position].includes(spot) ? 0.87 : 0.5;
}

/** Dynamic assignment of five distinct players to five seats. */
export function assignFive(players: GmPlayer[], desired?: Record<string, Partial<Record<GmPosition, number>>>): { score: number; starters: GmTeam["starters"] } {
  const count = Math.min(5, players.length);
  const fits = players.map(p => SPOTS.map(spot => roleFit(p, spot) + Math.min(0.15, Math.max(0, desired?.[p.id]?.[spot] ?? 0) * 0.01)));
  let best = -Infinity;
  let seats: GmTeam["starters"] = { PG: null, SG: null, SF: null, PF: null, C: null };
  function visit(index: number, used: number, score: number, current: GmTeam["starters"]) {
    if (index === count) {
      if (score > best) { best = score; seats = { ...current }; }
      return;
    }
    for (let slot = 0; slot < 5; slot++) {
      if (used & (1 << slot)) continue;
      const spot = SPOTS[slot]!;
      current[spot] = players[index]!.id;
      visit(index + 1, used | (1 << slot), score + fits[index]![slot]!, current);
      current[spot] = null;
    }
  }
  visit(0, 0, 0, { PG: null, SG: null, SF: null, PF: null, C: null });
  return { score: best, starters: seats };
}

export function lineupBalance(players: GmPlayer[]): number {
  if (!players.length) return -20;
  const roles = players.map(playerRoles);
  const creation = Math.max(...roles.map(r => r.creation));
  const interior = Math.max(...roles.map(r => r.interior));
  const spacing = roles.reduce((sum, r) => sum + r.spacing, 0);
  const board = roles.reduce((sum, r) => sum + r.rebounding, 0);
  return Math.min(0, creation - 0.65) * 12 + Math.min(0, interior - 0.65) * 10 + Math.min(0, spacing - 1.5) * 2 + Math.min(0, board - 1.6) * 2;
}

/** Complete units compete; real starters retain a modest role prior. */
export function bestStartingFive(team: GmTeam, roster: GmPlayer[], season?: number): GmTeam["starters"] {
  const ovr = (p: GmPlayer) => p.sheet?.overall ?? 72 + p.ratings.impact * 3;
  const rolePrior = (p: GmPlayer) => {
    const role = p.realRole;
    return role && role.teamId === team.id && !p.priorLine && (!season || role.season === season)
      ? 4 * role.starts / Math.max(1, role.games) : 0;
  };
  const pool = [...roster].sort((a, b) => ovr(b) + rolePrior(b) - ovr(a) - rolePrior(a)).slice(0, 12);
  let top = -Infinity;
  let result: GmTeam["starters"] = { PG: null, SG: null, SF: null, PF: null, C: null };
  const chosen: GmPlayer[] = [];
  function visit(start: number) {
    if (chosen.length === Math.min(5, pool.length)) {
      const assignment = assignFive(chosen);
      const ability = chosen.reduce((sum, p) => sum + ovr(p) + rolePrior(p), 0);
      const score = ability + (assignment.score - chosen.length) * 32 + lineupBalance(chosen) * 2;
      if (score > top) { top = score; result = assignment.starters; }
      return;
    }
    for (let i = start; i <= pool.length - (Math.min(5, pool.length) - chosen.length); i++) {
      chosen.push(pool[i]!); visit(i + 1); chosen.pop();
    }
  }
  visit(0);
  return result;
}
