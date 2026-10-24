import type { StandingRow } from "@/data/types";

/** Compact homepage standings — only fields the home table reads. */
export type HomeStandingSlim = Pick<
  StandingRow,
  | "teamId"
  | "abbreviation"
  | "rank"
  | "wins"
  | "losses"
  | "winPct"
  | "differential"
>;

export function slimHomeStandingRow(row: StandingRow): HomeStandingSlim {
  return {
    teamId: row.teamId,
    abbreviation: row.abbreviation,
    rank: row.rank,
    wins: row.wins,
    losses: row.losses,
    winPct: Math.round(row.winPct * 1000) / 1000,
    differential: Math.round(row.differential * 10) / 10,
  };
}
