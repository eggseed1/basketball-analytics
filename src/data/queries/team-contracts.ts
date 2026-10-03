/**
 * BRef-style team payroll and future picks for team pages: the baked
 * Basketball-Reference payroll with links to our player pages, plus the
 * Spotrac pick ledger.
 */

import "server-only";

import { bundledTeamContracts, type BrefTeamContracts } from "@/data/runtime/bref-team-contracts";
import { bundledFuturePicks, type FuturePick } from "@/data/runtime/future-picks-snapshot";
import { getBundledPlayerIdAliasIndex } from "@/data/runtime/player-id-aliases-snapshot";
import { findPlayerSearchRowByName } from "@/data/runtime/player-search-snapshot";

export type TeamContractsView = BrefTeamContracts & {
  /** Our player page for a BRef id, when we can match him. */
  hrefs: Record<string, string>;
  sourceUrl: string;
};

export type TeamFuturePicksView = {
  teamAbbr: string;
  picks: FuturePick[];
  retrievedAt: string | null;
  sourceUrl: string | null;
};

function aliasHref(brefId: string): string | null {
  const alias = getBundledPlayerIdAliasIndex().byBref?.get(brefId);
  return alias?.espnPlayerId ? `/players/${alias.espnPlayerId}` : null;
}

export function getTeamContracts(teamId: string): TeamContractsView | null {
  const team = bundledTeamContracts(teamId);
  if (!team) return null;
  const hrefs: Record<string, string> = {};
  for (const r of team.rows) {
    const row = aliasHref(r.brefId) ? null : findPlayerSearchRowByName(r.name, team.capSeason);
    const href = aliasHref(r.brefId) ?? (row ? `/players/${row.id}` : null);
    if (href) hrefs[r.brefId] = href;
  }
  // Unsigned draftees are rarely in our index; a name match could be a namesake.
  for (const r of team.draftRights) {
    const href = aliasHref(r.brefId);
    if (href) hrefs[r.brefId] = href;
  }
  return { ...team, hrefs, sourceUrl: `https://www.basketball-reference.com/contracts/${team.code}.html` };
}

export function getTeamFuturePicks(teamId: string): TeamFuturePicksView | null {
  const team = bundledFuturePicks(teamId);
  if (!team?.picks.length) return null;
  return { teamAbbr: team.abbr, picks: team.picks, retrievedAt: team.retrievedAt, sourceUrl: team.sourceUrl };
}
