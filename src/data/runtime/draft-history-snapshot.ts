/**
 * Deploy-baked NBA draft picks since 1990 (stats.nba.com drafthistory).
 * Written by scripts/build-runtime-draft-history-snapshot.mjs.
 */
import snapshot from "./draft-history-snapshot.json";

export type BundledDraftPick = {
  nbaId: string;
  name: string;
  year: number;
  round: number;
  roundPick: number;
  overall: number;
  /** Team that made the pick, as NBA abbreviates it that year. */
  teamAbbr: string;
};

type DraftHistoryFile = {
  generatedAt?: string;
  picks?: Array<[string, string, number, number, number, number, string]>;
};

let cached: BundledDraftPick[] | null = null;

export function bundledDraftPicks(): BundledDraftPick[] {
  if (cached) return cached;
  const rows = (snapshot as unknown as DraftHistoryFile).picks ?? [];
  cached = rows.map(([nbaId, name, year, round, roundPick, overall, teamAbbr]) => ({
    nbaId,
    name,
    year,
    round,
    roundPick,
    overall,
    teamAbbr,
  }));
  return cached;
}
