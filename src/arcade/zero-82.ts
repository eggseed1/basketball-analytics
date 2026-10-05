import { randomItem, type ArcadeLeague, type ArcadeRow } from "@/arcade/league";
import { isTeamCode } from "@/arcade/teams";

export const ZERO_82_SLOTS = ["PG", "SG", "SF", "PF", "C"] as const;
export type Zero82Slot = (typeof ZERO_82_SLOTS)[number];

/** Rotation players only, so a pick is a real season and BPM is not noise. */
export const ZERO_82_MIN_MINUTES = 800;
export const ZERO_82_MIN_GAMES = 20;

/** Minutes each starter plays; a replacement-level bench covers the rest. */
export const STARTER_MINUTES = 36;
export const BENCH_BPM = -2;
/** Wins per point of net rating over 82 games. */
export const WINS_PER_POINT = 2.7;

export type TeamSeason = { key: string; season: string; team: string; rows: ArcadeRow[] };

export function zero82TeamSeasons(league: ArcadeLeague): TeamSeason[] {
  const byKey = new Map<string, TeamSeason>();
  for (const row of league.rows) {
    if (
      row.mp < ZERO_82_MIN_MINUTES ||
      row.gp < ZERO_82_MIN_GAMES ||
      row.bpm == null ||
      !row.pos ||
      !(ZERO_82_SLOTS as readonly string[]).includes(row.pos)
    ) {
      continue;
    }
    for (const team of row.teams) {
      if (!isTeamCode(team)) continue;
      const key = `${row.season}|${team}`;
      const entry = byKey.get(key) ?? { key, season: row.season, team, rows: [] };
      entry.rows.push(row);
      byKey.set(key, entry);
    }
  }
  return [...byKey.values()];
}

export function eligibleRows(
  teamSeason: TeamSeason,
  openSlots: readonly Zero82Slot[],
  usedPids: ReadonlySet<number>
): ArcadeRow[] {
  return teamSeason.rows.filter(
    (row) => !usedPids.has(row.pid) && openSlots.includes(row.pos as Zero82Slot)
  );
}

/** A random team-season with at least one player who fits an open slot. */
export function spinTeamSeason(
  teamSeasons: TeamSeason[],
  openSlots: readonly Zero82Slot[],
  usedPids: ReadonlySet<number>,
  rng: () => number = Math.random
): TeamSeason {
  for (let tries = 0; tries < 200; tries += 1) {
    const pick = randomItem(teamSeasons, rng);
    if (eligibleRows(pick, openSlots, usedPids).length) return pick;
  }
  const fallback = teamSeasons.find((ts) => eligibleRows(ts, openSlots, usedPids).length);
  if (!fallback) throw new Error("no team-season fits the open slots");
  return fallback;
}

export function projectedNetRating(bpms: number[]): number {
  const starterShare = STARTER_MINUTES / 48;
  const benchShare = (48 - STARTER_MINUTES) / 48;
  const starters = bpms.reduce((sum, bpm) => sum + bpm * starterShare, 0);
  return starters + ZERO_82_SLOTS.length * BENCH_BPM * benchShare;
}

export function projectedRecord(bpms: number[]): { wins: number; losses: number; net: number } {
  const net = projectedNetRating(bpms);
  const wins = Math.round(Math.min(82, Math.max(0, 41 + WINS_PER_POINT * net)));
  return { wins, losses: 82 - wins, net };
}
