import { LeaguePlayerScatterLazy } from "@/components/charts/recharts-lazy";
import { type } from "@/lib/design-system";
import {
  buildLeagueScatterPoints,
  leagueScatterDefaultRankEnd,
  leagueScatterRankValue,
  type LeagueScatterKind,
} from "@/lib/league-player-scatter";
import { applyVizFieldFilter } from "@/lib/viz-field-filter";
import type {
  PlayerRaceFieldSize,
  PlayerRaceRankEnd,
} from "@/lib/player-race-tracker";
import { getFilteredPlayerSeasonsCached } from "@/data/queries/request-cache";
import {
  parseVizTeamKeys,
  playerMatchesAnyVizTeam,
} from "@/lib/viz-team-highlight";
import { cn } from "@/lib/utils";

function parsePinIds(raw: string | undefined): string[] {
  if (!raw) return [];
  return [
    ...new Set(
      raw
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean)
    ),
  ].slice(0, 12);
}

export async function LeaguePlayerScatterIsland({
  kind,
  season,
  pin,
  team,
  minMinutes,
  fieldSize = "all",
  rankEnd,
}: {
  kind: LeagueScatterKind;
  season: string;
  pin?: string;
  team?: string;
  minMinutes?: number;
  fieldSize?: PlayerRaceFieldSize;
  rankEnd?: PlayerRaceRankEnd;
}) {
  const pinIds = parsePinIds(pin);
  const teamKeys = parseVizTeamKeys(team);
  const resolvedRankEnd =
    rankEnd ?? leagueScatterDefaultRankEnd(kind);
  const peers = await getFilteredPlayerSeasonsCached(season, 15).catch(
    () => []
  );
  const teamPlayerIds = new Set(
    peers
      .filter((row) => playerMatchesAnyVizTeam(row, teamKeys))
      .map((row) => row.playerId)
  );
  const highlightIds = new Set([...pinIds, ...teamPlayerIds]);
  const built = buildLeagueScatterPoints(peers, kind, highlightIds, {
    forceIncludeIds: highlightIds,
    minMinutes,
  });
  const points = applyVizFieldFilter(built, {
    fieldSize,
    rankEnd: resolvedRankEnd,
    keyOf: (point) => point.playerId,
    sortValue: (point) => leagueScatterRankValue(kind, point),
    isPinned: (point) => point.isSelf,
  });
  const pinned = points.filter((p) => p.isSelf);
  const pinLabel = teamKeys.length
    ? teamKeys.length === 1
      ? `${teamKeys[0]} roster`
      : `${teamKeys.length} teams`
    : pinned.length === 1
      ? pinned[0]!.playerName
      : pinned.length > 1
        ? `${pinned.length} pinned`
        : "";

  if (points.length < 8 && !pinned.length) {
    return (
      <div className="sports-card px-4 py-10 text-center">
        <p className={cn(type.bodySm, "text-muted-foreground")}>
          Not enough qualified peers for this view in {season}. Try another
          season or loosen Min MP / field size.
        </p>
      </div>
    );
  }

  return (
    <LeaguePlayerScatterLazy
      kind={kind}
      points={points}
      season={season}
      playerName={pinLabel}
      highlightLabel="pin"
    />
  );
}
