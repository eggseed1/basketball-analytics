import { PlayerOverviewCareerClient } from "@/components/players/player-overview-career-client";
import { TextLink } from "@/components/ui/text-link";
import type { PlayerSeason } from "@/data/types";
import {
  filterCareerBoardSource,
  toCareerBoardRows,
} from "@/lib/career-board-rows";
import { type } from "@/lib/design-system";
import { type PlayerSeasonKind } from "@/lib/player-destination";
import { playerHref } from "@/lib/player-page-contract";
import { cn } from "@/lib/utils";
import type { ThemeMode } from "@/themes/era-theme";

/**
 * Overview Career stats: same board as the Career tab. Prefer SSR career rows
 * when the page already loaded them; otherwise the client retries the seasons
 * API (cold edge hits can return an empty array).
 */
export function PlayerOverviewCareerSection({
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
  career?: PlayerSeason[];
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

  const initialRows =
    career && career.length > 0
      ? toCareerBoardRows(filterCareerBoardSource(career))
      : null;

  return (
    <div className="flex flex-col gap-3">
      <PlayerOverviewCareerClient
        playerId={playerId}
        season={season}
        seasonType={seasonType}
        teamKey={teamKey}
        fromHistory={fromHistory}
        themeMode={themeMode}
        initialRows={initialRows && initialRows.length > 0 ? initialRows : null}
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
