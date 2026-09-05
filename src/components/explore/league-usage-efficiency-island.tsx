import { PlayerUsageEfficiencyLazy } from "@/components/charts/recharts-lazy";
import { type } from "@/lib/design-system";
import { buildUsageEfficiencyPoints } from "@/lib/player-usage-efficiency";
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

export async function LeagueUsageEfficiencyIsland({
  season,
  pin,
  team,
  minMinutes,
  fieldSize = "all",
  rankEnd = "high",
}: {
  season: string;
  seasonOptions?: string[];
  pin?: string;
  team?: string;
  minMinutes?: number;
  fieldSize?: PlayerRaceFieldSize;
  rankEnd?: PlayerRaceRankEnd;
}) {
  const pinIds = parsePinIds(pin);
  const teamKeys = parseVizTeamKeys(team);
  const peers = await getFilteredPlayerSeasonsCached(season, 15).catch(
    () => []
  );
  const teamPlayerIds = new Set(
    peers
      .filter((row) => playerMatchesAnyVizTeam(row, teamKeys))
      .map((row) => row.playerId)
  );
  const highlightIds = new Set([...pinIds, ...teamPlayerIds]);
  const built = buildUsageEfficiencyPoints(peers, highlightIds, {
    forceIncludeIds: highlightIds,
    minMinutes,
  });
  const points = applyVizFieldFilter(built, {
    fieldSize,
    rankEnd,
    keyOf: (point) => point.playerId,
    sortValue: (point) => point.usagePct,
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
          Not enough qualified peers with usage and true shooting for {season}.
          Try another season or loosen Min MP / field size.
        </p>
      </div>
    );
  }

  return (
    <PlayerUsageEfficiencyLazy
      points={points}
      season={season}
      playerName={pinLabel}
      highlightLabel="pin"
    />
  );
}
