import "server-only";

import { nbaTeamIdFromAbbr } from "@/data/providers/nba/nba-team-meta";
import { getLeagueOnOff, getOnOffManifest, getTeamOnOff } from "@/data/runtime/on-off-pbp-store";
import { resolveTeamBrand } from "@/lib/nba-brand";
import type { LeagueOnOffFile, TeamOnOffFile } from "@/lib/on-off/types";

/** Seasons with possession-level on/off files, newest first. */
export async function getOnOffSeasons(): Promise<string[]> {
  const manifest = await getOnOffManifest();
  return (manifest?.seasons ?? []).map((s) => s.season).sort((a, b) => b.localeCompare(a));
}

export function nbaTeamIdForTeamKey(teamKey: string | null | undefined): string | null {
  if (!teamKey) return null;
  if (/^1610612\d{3}$/.test(teamKey)) return teamKey;
  const brand = resolveTeamBrand(teamKey);
  return (brand && nbaTeamIdFromAbbr(brand.abbr)) ?? nbaTeamIdFromAbbr(teamKey);
}

export type TeamOnOffData = { file: TeamOnOffFile; league: LeagueOnOffFile | null };

export async function getTeamOnOffData(
  teamKey: string,
  season: string
): Promise<TeamOnOffData | null> {
  const nbaTeamId = nbaTeamIdForTeamKey(teamKey);
  if (!nbaTeamId) return null;
  const [file, league] = await Promise.all([getTeamOnOff(season, nbaTeamId), getLeagueOnOff(season)]);
  return file ? { file, league } : null;
}

export type PlayerOnOffStintData = TeamOnOffData & { playerId: string };

/** Every team the player logged possessions for that season, most possessions first. */
export async function getPlayerOnOffData(
  nbaIds: Array<string | null | undefined>,
  season: string
): Promise<PlayerOnOffStintData[]> {
  const league = await getLeagueOnOff(season);
  if (!league) return [];
  const ids = new Set(nbaIds.filter((id): id is string => Boolean(id)));
  const rows = league.players
    .filter((p) => ids.has(p.id))
    .sort((a, b) => b.poss[1] - a.poss[1]);
  const stints = await Promise.all(
    rows.map(async (row): Promise<PlayerOnOffStintData | null> => {
      const file = await getTeamOnOff(season, row.teamId);
      return file ? { file, league, playerId: row.id } : null;
    })
  );
  return stints.filter((s): s is PlayerOnOffStintData => s != null);
}
