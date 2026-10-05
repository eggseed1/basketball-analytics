import { randomItem, type ArcadeLeague } from "@/arcade/league";
import { isTeamCode } from "@/arcade/teams";

/**
 * Teammates means on the same team in the same season. A player traded
 * midseason counts on every team he played for that year, even if he and
 * another player were never there at the same time.
 */
export type TeammateGraph = {
  rosters: Map<string, number[]>;
  stintsByPid: Map<number, string[]>;
};

export function buildTeammateGraph(league: ArcadeLeague): TeammateGraph {
  const rosters = new Map<string, number[]>();
  const stintsByPid = new Map<number, string[]>();
  for (const row of league.rows) {
    for (const team of row.teams) {
      if (!isTeamCode(team)) continue;
      const key = `${row.season}|${team}`;
      const roster = rosters.get(key) ?? [];
      if (!roster.includes(row.pid)) roster.push(row.pid);
      rosters.set(key, roster);
      const stints = stintsByPid.get(row.pid) ?? [];
      if (!stints.includes(key)) stints.push(key);
      stintsByPid.set(row.pid, stints);
    }
  }
  return { rosters, stintsByPid };
}

/** Team-seasons two players shared, oldest first. */
export function sharedStints(graph: TeammateGraph, a: number, b: number): string[] {
  const mine = new Set(graph.stintsByPid.get(a) ?? []);
  return (graph.stintsByPid.get(b) ?? []).filter((key) => mine.has(key)).sort();
}

export function areTeammates(graph: TeammateGraph, a: number, b: number): boolean {
  return a !== b && sharedStints(graph, a, b).length > 0;
}

/** Fewest-players path from a to b, both ends included; null when unconnected. */
export function shortestTeammatePath(
  graph: TeammateGraph,
  from: number,
  to: number
): number[] | null {
  if (from === to) return [from];
  const previous = new Map<number, number>([[from, from]]);
  let frontier = [from];
  while (frontier.length) {
    const next: number[] = [];
    for (const pid of frontier) {
      for (const key of graph.stintsByPid.get(pid) ?? []) {
        for (const mate of graph.rosters.get(key) ?? []) {
          if (previous.has(mate)) continue;
          previous.set(mate, pid);
          if (mate === to) {
            const path = [to];
            let step = to;
            while (step !== from) {
              step = previous.get(step)!;
              path.push(step);
            }
            return path.reverse();
          }
          next.push(mate);
        }
      }
    }
    frontier = next;
  }
  return null;
}

/** Stars with the most career VORP in the data, as puzzle endpoints. */
export function chainStars(league: ArcadeLeague, count = 150): number[] {
  const careerVorp = new Map<number, number>();
  for (const row of league.rows) {
    if (row.vorp != null) careerVorp.set(row.pid, (careerVorp.get(row.pid) ?? 0) + row.vorp);
  }
  return [...careerVorp.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, count)
    .map(([pid]) => pid);
}

export type ChainPuzzle = { from: number; to: number; best: number[] };

/** Two stars who never played together but connect in a few steps. */
export function pickChainPuzzle(
  graph: TeammateGraph,
  stars: number[],
  rng: () => number = Math.random
): ChainPuzzle {
  // Most star pairs share a teammate, so half the puzzles insist on two links.
  const wantLength = rng() < 0.5 ? 4 : 3;
  let fallback: ChainPuzzle | null = null;
  for (let tries = 0; tries < 400; tries += 1) {
    const from = randomItem(stars, rng);
    const to = randomItem(stars, rng);
    if (from === to || areTeammates(graph, from, to)) continue;
    const best = shortestTeammatePath(graph, from, to);
    if (!best || best.length < 3 || best.length > 5) continue;
    if (best.length === wantLength) return { from, to, best };
    fallback ??= { from, to, best };
  }
  if (fallback) return fallback;
  throw new Error("no chain puzzle found");
}
