import "server-only";

import { NBA_TEAM_META, nbaTeamIdFromAbbr } from "@/data/providers/nba/nba-team-meta";
import { getLeagueOnOff, getOnOffManifest, getTeamOnOff } from "@/data/runtime/on-off-pbp-store";
import { leagueSeasonRows, type OnOffSeasonRow } from "@/lib/on-off/derive";
import { resolveTeamBrand } from "@/lib/nba-brand";
import type { LeagueOnOffFile, OnOffPhase, TeamOnOffFile } from "@/lib/on-off/types";

/** Seasons with possession-level on/off files, newest first. */
export async function getOnOffSeasons(): Promise<string[]> {
  const manifest = await getOnOffManifest();
  return (manifest?.seasons ?? []).map((s) => s.season).sort((a, b) => b.localeCompare(a));
}

/** Whether the season has playoff files, and which NBA team ids they cover. */
export async function getOnOffPlayoffTeams(season: string): Promise<string[]> {
  const manifest = await getOnOffManifest();
  return manifest?.seasons.find((s) => s.season === season)?.playoffs?.teams ?? [];
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
  season: string,
  phase: OnOffPhase = "regular"
): Promise<TeamOnOffData | null> {
  const nbaTeamId = nbaTeamIdForTeamKey(teamKey);
  if (!nbaTeamId) return null;
  const [file, league] = await Promise.all([
    getTeamOnOff(season, nbaTeamId, phase),
    getLeagueOnOff(season, phase),
  ]);
  return file ? { file, league } : null;
}

export type PlayerOnOffSeasonRow = OnOffSeasonRow & { teamAbbr: string };

/** Every built season and phase the player appears in, newest first, regular season before playoffs. */
export async function getPlayerOnOffSeasons(
  nbaIds: Array<string | null | undefined>
): Promise<PlayerOnOffSeasonRow[]> {
  const manifest = await getOnOffManifest();
  const ids = new Set(nbaIds.filter((id): id is string => Boolean(id)));
  if (!manifest || !ids.size) return [];
  const targets = [...manifest.seasons]
    .sort((a, b) => b.season.localeCompare(a.season))
    .flatMap((s) => [
      { season: s.season, phase: "regular" as const },
      ...(s.playoffs ? [{ season: s.season, phase: "playoffs" as const }] : []),
    ]);
  const leagues = await Promise.all(targets.map((t) => getLeagueOnOff(t.season, t.phase)));
  return leagues.flatMap((league) =>
    league
      ? leagueSeasonRows(league, ids).map((row) => ({
          ...row,
          teamAbbr: NBA_TEAM_META[row.teamId]?.abbreviation ?? "",
        }))
      : []
  );
}

export type PlayerOnOffStintData = TeamOnOffData & { playerId: string };

/** Every team the player logged possessions for that season, most possessions first. */
export async function getPlayerOnOffData(
  nbaIds: Array<string | null | undefined>,
  season: string,
  phase: OnOffPhase = "regular"
): Promise<PlayerOnOffStintData[]> {
  const league = await getLeagueOnOff(season, phase);
  if (!league) return [];
  const ids = new Set(nbaIds.filter((id): id is string => Boolean(id)));
  const rows = league.players
    .filter((p) => ids.has(p.id))
    .sort((a, b) => b.poss[1] - a.poss[1]);
  const stints = await Promise.all(
    rows.map(async (row): Promise<PlayerOnOffStintData | null> => {
      const file = await getTeamOnOff(season, row.teamId, phase);
      return file ? { file, league, playerId: row.id } : null;
    })
  );
  return stints.filter((s): s is PlayerOnOffStintData => s != null);
}
