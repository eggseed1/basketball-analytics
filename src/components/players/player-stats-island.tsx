import { dedupeCareerSeasons } from "@/analytics/career-resume";
import { PlayerStatsBoard } from "@/components/players/player-stats-board";
import type { GlassSurfaceHonor } from "@/components/brand/glass-surface";
import { getPlayerPlayoffCareerSeasons } from "@/data/queries";
import { enrichPlayerCareerAdvancedCached } from "@/data/queries/request-cache";
import type { PlayerSeason } from "@/data/types";
import { type PlayerSeasonKind } from "@/lib/player-destination";
import type { ThemeMode } from "@/themes/era-theme";

export async function PlayerStatsIsland({
  playerId,
  season,
  statsSeason,
  seasonType,
  career,
  teamKey,
  fromHistory = false,
  themeMode = "historical",
  honor,
}: {
  playerId: string;
  season: string;
  statsSeason?: string;
  seasonType: PlayerSeasonKind;
  career: PlayerSeason[];
  teamKey?: string | null;
  fromHistory?: boolean;
  themeMode?: ThemeMode;
  honor?: GlassSurfaceHonor;
}) {
  const source =
    seasonType === "playoffs"
      ? await getPlayerPlayoffCareerSeasons(playerId)
      : await enrichPlayerCareerAdvancedCached(playerId, career).catch(
          () => career
        );
  const rows = dedupeCareerSeasons(source);

  return (
    <PlayerStatsBoard
      playerId={playerId}
      season={season}
      statsSeason={statsSeason ?? season}
      seasonType={seasonType}
      rows={rows}
      teamKey={teamKey}
      fromHistory={fromHistory}
      themeMode={themeMode}
      honor={honor}
    />
  );
}
