/**
 * Deploy-baked draft selections from 2025 on, refreshed nightly so a class is
 * searchable the morning after the draft.
 * Written by scripts/ingest-draft-transactions.ts.
 */
import snapshot from "./draft-night-snapshot.json";

export type DraftNightPick = {
  /** Site (ESPN) player id when the draft feed links one. */
  playerId: string | null;
  name: string;
  year: number;
  round: number;
  roundPick: number;
  overall: number;
  /** Team that made the pick. */
  teamAbbr: string;
  position: string | null;
};

type DraftNightFile = {
  picks?: Array<[string | null, string, number, number, number, number, string, string | null]>;
};

let cached: DraftNightPick[] | null = null;

export function draftNightPicks(): DraftNightPick[] {
  if (cached) return cached;
  const rows = (snapshot as unknown as DraftNightFile).picks ?? [];
  cached = rows.map(([playerId, name, year, round, roundPick, overall, teamAbbr, position]) => ({
    playerId,
    name,
    year,
    round,
    roundPick,
    overall,
    teamAbbr,
    position,
  }));
  return cached;
}
