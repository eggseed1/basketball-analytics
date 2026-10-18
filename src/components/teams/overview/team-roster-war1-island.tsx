import { TeamRosterWar1Panel } from "@/components/teams/overview/team-roster-war1-panel";
import { getPlayerIdAliasIndex } from "@/data/identity/player-identity";
import { nbaTeamIdFromAbbr, NBA_TEAM_META } from "@/data/providers/nba/nba-team-meta";
import { fetchEspnLeagueRosterPlayers } from "@/data/providers/nba/espn-roster-client";
import { fetchDrblSeason } from "@/data/providers/nba/drbl-loader";
import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
} from "@/data/providers/historical/season-range";
import { isProductionApprovedPlayerAlias } from "@/data/providers/impact/player-id-aliases";
import { resolveTeamBrand } from "@/lib/nba-brand";
import { shiftCanonicalSeason } from "@/lib/player-stat-comps";
import {
  buildCurrentRosterWarLeague,
  buildRosterWarLeague,
  type RosterWarTeamMeta,
} from "@/lib/team-roster-war1";

function teamMetaForAbbr(abbreviation: string): RosterWarTeamMeta | null {
  const brand = resolveTeamBrand(abbreviation);
  const abbr = brand?.abbr ?? abbreviation;
  const nbaTeamId = nbaTeamIdFromAbbr(abbr);
  const meta = nbaTeamId ? NBA_TEAM_META[nbaTeamId] : null;
  if (!meta) return null;
  return {
    abbreviation: meta.abbreviation,
    fullName: meta.fullName,
    espnTeamId: brand?.espnTeamId ?? null,
  };
}

/** Published roster WAR1 for the overview. Streams after the rest of the card stack. */
export async function TeamRosterWar1Island({
  season,
  teamKey,
  gamesPlayed,
  record,
}: {
  season: string;
  teamKey: string;
  gamesPlayed: number | null;
  record: { wins: number; losses: number } | null;
}) {
  const aliases = await getPlayerIdAliasIndex();
  const espnForNba = (nbaPlayerId: string) => {
    const alias = aliases.byNba.get(nbaPlayerId);
    if (!alias || !isProductionApprovedPlayerAlias(alias)) return null;
    return alias.espnPlayerId;
  };

  const currentSeason = canonicalSeasonFromStartYear(currentNbaStartYear());
  if (season === currentSeason) {
    const [roster, currentRows] = await Promise.all([
      fetchEspnLeagueRosterPlayers(season).catch(() => []),
      fetchDrblSeason(season).catch(() => []),
    ]);
    let valueSeason = season;
    let warRows = currentRows;
    if (!warRows.length) {
      valueSeason = shiftCanonicalSeason(season, -1);
      warRows = await fetchDrblSeason(valueSeason).catch(() => []);
    }
    if (!roster.length || !warRows.length) return null;

    const slots = roster.flatMap((player) => {
      const meta = teamMetaForAbbr(player.teamAbbreviation ?? "");
      if (!meta) return [];
      return [
        {
          espnId: player.playerId,
          name: player.playerName,
          abbreviation: meta.abbreviation,
        },
      ];
    });
    const resolve = { espnForNba, teamMeta: teamMetaForAbbr };
    const squads = buildCurrentRosterWarLeague(warRows, slots, resolve);
    const focus = teamMetaForAbbr(teamKey);
    const squad = squads.find((row) => row.abbreviation === focus?.abbreviation);
    if (!squad || squad.players.length === 0) return null;
    return (
      <TeamRosterWar1Panel
        squads={squads}
        focusAbbr={squad.abbreviation}
        season={season}
        gamesPlayed={
          valueSeason === season && gamesPlayed != null && Number.isFinite(gamesPlayed)
            ? gamesPlayed
            : null
        }
        record={valueSeason === season ? record : null}
        membership="current"
        valueSeason={valueSeason}
      />
    );
  }

  const rows = await fetchDrblSeason(season).catch(() => []);
  if (!rows.length) return null;

  const squads = buildRosterWarLeague(rows, {
    teamMeta: (nbaTeamId) => {
      const meta = NBA_TEAM_META[nbaTeamId];
      if (!meta) return null;
      return {
        abbreviation: meta.abbreviation,
        fullName: meta.fullName,
        espnTeamId: resolveTeamBrand(meta.abbreviation)?.espnTeamId ?? null,
      };
    },
    espnPlayerId: espnForNba,
  });

  const focus = nbaTeamIdFromAbbr(teamKey);
  const squad = squads.find((row) => row.nbaTeamId === focus);
  if (!squad || squad.players.length === 0) return null;

  return (
    <TeamRosterWar1Panel
      squads={squads}
      focusAbbr={squad.abbreviation}
      season={season}
      gamesPlayed={gamesPlayed != null && Number.isFinite(gamesPlayed) ? gamesPlayed : null}
      record={record}
    />
  );
}
