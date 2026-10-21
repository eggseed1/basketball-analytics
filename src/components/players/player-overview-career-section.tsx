import { PlayerCareerIsland } from "@/components/players/player-career-island";
import { TextLink } from "@/components/ui/text-link";
import type { PlayerSeason } from "@/data/types";
import { type } from "@/lib/design-system";
import { type PlayerSeasonKind } from "@/lib/player-destination";
import { playerHref } from "@/lib/player-page-contract";
import { cn } from "@/lib/utils";
import type { ThemeMode } from "@/themes/era-theme";

/**
 * Overview Career stats: same board as the Career tab (game dots, category
 * table, Regular / Playoffs / chart filters), plus a link to analysis.
 */
export async function PlayerOverviewCareerSection({
  playerId,
  season,
  seasonType,
  career,
  teamKey,
  fromHistory = false,
  themeMode = "historical",
}: {
  playerId: string;
  season: string;
  seasonType: PlayerSeasonKind;
  career: PlayerSeason[];
  teamKey?: string | null;
  fromHistory?: boolean;
  themeMode?: ThemeMode;
}) {
  const careerHref = playerHref({
    playerId,
    season,
    view: "career",
    fromHistory,
    themeMode: themeMode === "modern" ? "modern" : "historical",
  });

  return (
    <div className="flex flex-col gap-3">
      <PlayerCareerIsland
        playerId={playerId}
        season={season}
        seasonType={seasonType}
        career={career}
        teamKey={teamKey}
        fromHistory={fromHistory}
        themeMode={themeMode}
        chart="games"
      />
      <TextLink
        href={careerHref}
        scroll={false}
        className={cn(type.caption, "font-semibold")}
      >
        Peak, prime, and career analysis
      </TextLink>
    </div>
  );
}
