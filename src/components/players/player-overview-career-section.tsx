import { PlayerOverviewCareerClient } from "@/components/players/player-overview-career-client";
import { TextLink } from "@/components/ui/text-link";
import { type } from "@/lib/design-system";
import { type PlayerSeasonKind } from "@/lib/player-destination";
import { playerHref } from "@/lib/player-page-contract";
import { cn } from "@/lib/utils";
import type { ThemeMode } from "@/themes/era-theme";

/**
 * Overview Career stats: same board as the Career tab, loaded client-side so
 * season rows stay out of first HTML. Link to full career analysis below.
 */
export function PlayerOverviewCareerSection({
  playerId,
  season,
  seasonType,
  teamKey,
  fromHistory = false,
  themeMode = "historical",
}: {
  playerId: string;
  season: string;
  seasonType: PlayerSeasonKind;
  /** @deprecated Unused — overview fetches `/api/players/.../seasons`. */
  career?: unknown;
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
      <PlayerOverviewCareerClient
        playerId={playerId}
        season={season}
        seasonType={seasonType}
        teamKey={teamKey}
        fromHistory={fromHistory}
        themeMode={themeMode}
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
