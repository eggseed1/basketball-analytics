/** Row shapes and links for the league-wide contract surplus rankings. */

import { standingsVisualizationsHref } from "@/lib/standings-routes";

export const PLAYER_SURPLUS_RANKING_PATH = "/explore/players/visualizations?view=surplus";

/** Teams ranked by surplus, with this team highlighted. */
export function teamSurplusRankingHref(teamKey?: string | null): string {
  const base = standingsVisualizationsHref(undefined, "surplus");
  return teamKey ? `${base}&team=${encodeURIComponent(teamKey.toUpperCase())}` : base;
}

/** Contracts ranked by surplus, with this player pinned. */
export function playerSurplusRankingHref(playerId?: string | null): string {
  return playerId
    ? `${PLAYER_SURPLUS_RANKING_PATH}&pin=${encodeURIComponent(playerId)}`
    : PLAYER_SURPLUS_RANKING_PATH;
}

export type PlayerSurplusRow = {
  brefId: string;
  /** Our player page id, when the contract matches one. */
  playerId: string | null;
  name: string;
  teamId: string;
  /** Uppercase brand abbr, the same key the viz team highlight uses. */
  teamKey: string;
  salary: number;
  worth: number;
  surplus: number;
  surplusLow: number;
  surplusHigh: number;
  firstSeason: string;
  lastSeason: string;
  /** 1 is the most surplus in the league. */
  rank: number;
};

export type TeamSurplusContract = { name: string; href: string | null; surplus: number };

export type TeamSurplusRow = {
  teamId: string;
  teamKey: string;
  name: string;
  conference: "East" | "West";
  surplus: number;
  salary: number;
  worth: number;
  valued: number;
  /** Contracts left out of the sum. They are not counted as zero. */
  missing: number;
  rank: number;
  best: TeamSurplusContract | null;
  worst: TeamSurplusContract | null;
};

export type ContractSurplusMeta = {
  capSeason: string;
  contracts: number;
  leftOut: number;
};

/** Seasons covered by a contract, as "2026-27" or "2026-27 to 2029-30". */
export function contractSpan(row: Pick<PlayerSurplusRow, "firstSeason" | "lastSeason">): string {
  return row.firstSeason === row.lastSeason ? row.firstSeason : `${row.firstSeason} to ${row.lastSeason}`;
}
