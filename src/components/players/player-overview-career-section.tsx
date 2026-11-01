import { PlayerOverviewCareerClient } from "@/components/players/player-overview-career-client";
import { TextLink } from "@/components/ui/text-link";
import { enrichPlayerCareerAdvancedCached } from "@/data/queries/request-cache";
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

function hasDarko(rows: PlayerSeason[]) {
  return rows.some(
    (row) => row.darkoDpm != null && Number.isFinite(row.darkoDpm)
  );
}

function hasWar1(rows: PlayerSeason[]) {
  return rows.some(
    (row) =>
      row.r1WinEquivalents != null && Number.isFinite(row.r1WinEquivalents)
  );
}

/**
 * Attach DARKO / WAR1 for the career board. Raw page career is box scores;
 * without this the chart defaults to PTS and hides impact chips.
 */
async function enrichCareerImpact(
  playerId: string,
  career: PlayerSeason[]
): Promise<PlayerSeason[]> {
  if (!career.length) return career;
  let source = await enrichPlayerCareerAdvancedCached(playerId, career).catch(
    () => career
  );
  if (hasDarko(source) && hasWar1(source)) return source;
  try {
    const { attachBundledBrefDarkoRaptor, attachDrblToPlayerSeasons } =
      await import("@/data/queries/players");
    if (!hasDarko(source)) {
      source = await attachBundledBrefDarkoRaptor(playerId, source);
    }
    if (!hasWar1(source)) {
      source = await attachDrblToPlayerSeasons(playerId, source).catch(
        () => source
      );
    }
  } catch {
    /* keep source */
  }
  return source;
}

/**
 * Overview Career stats: same board as the Career tab. Prefer SSR career rows
 * when the page already loaded them; otherwise the client retries the seasons
 * API (cold edge hits can return an empty array).
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

  const enriched =
    career && career.length > 0
      ? await enrichCareerImpact(playerId, career)
      : [];
  const initialRows =
    enriched.length > 0
      ? toCareerBoardRows(filterCareerBoardSource(enriched))
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
