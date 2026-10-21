/**
 * Bundled pre-ESPN-board team season W-L (Basketball-Reference standings).
 * Used when stats.nba.com is unavailable (Vercel / blocked egress).
 */

import bundle from "@/data/runtime/historical-team-season-records.json";

export type BundledHistoricalTeamSeasonRow = {
  brefAbbr: string;
  displayName: string;
  conference: "East" | "West" | null;
  wins: number;
  losses: number;
};

type BundleShape = {
  seasons?: Record<string, BundledHistoricalTeamSeasonRow[]>;
};

const seasons = (bundle as BundleShape).seasons ?? {};

export function getBundledHistoricalTeamSeasonRecords(
  season: string
): BundledHistoricalTeamSeasonRow[] {
  const rows = seasons[season];
  if (!rows || rows.length === 0) return [];
  return rows.map((row) => ({
    brefAbbr: row.brefAbbr,
    displayName: row.displayName,
    conference:
      row.conference === "East" || row.conference === "West"
        ? row.conference
        : null,
    wins: row.wins,
    losses: row.losses,
  }));
}
