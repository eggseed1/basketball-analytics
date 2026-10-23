import {
  PlayerCareerBoard,
} from "@/components/players/player-career-board";
import { getPlayerPlayoffCareerSeasons } from "@/data/queries";
import { enrichPlayerCareerAdvancedCached } from "@/data/queries/request-cache";
import type { PlayerSeason } from "@/data/types";
import {
  filterCareerBoardSource,
  pickCareerCompareSeason,
  toCareerBoardRows,
} from "@/lib/career-board-rows";
import { type PlayerSeasonKind } from "@/lib/player-destination";
import type { ThemeMode } from "@/themes/era-theme";

export { toCareerBoardRows } from "@/lib/career-board-rows";

export async function PlayerCareerIsland({
  playerId,
  season,
  seasonType,
  career,
  compareSeason,
  teamKey,
  fromHistory = false,
  themeMode = "historical",
  chart = "games",
  hideTitle = false,
  initialMetric,
  showFilters = true,
  /**
   * Overview critical path: skip the ~4s advanced enrich. Bundled career
   * already carries DARKO/basic cols for the chart; Career tab keeps `"full"`.
   */
  enrich = "full",
}: {
  playerId: string;
  season: string;
  seasonType: PlayerSeasonKind;
  career: PlayerSeason[];
  compareSeason?: string;
  teamKey?: string | null;
  fromHistory?: boolean;
  themeMode?: ThemeMode;
  chart?: "seasons" | "games";
  hideTitle?: boolean;
  initialMetric?: "darko" | "war1" | "ppg" | "apg" | "rpg" | "ts" | "usg";
  showFilters?: boolean;
  enrich?: "full" | "fast";
}) {
  try {
    const source =
      seasonType === "playoffs"
        ? await getPlayerPlayoffCareerSeasons(playerId).catch(() => career)
        : enrich === "fast"
          ? await (async () => {
              // Local bundled DARKO/RAPTOR only — no stats.nba advanced crawl.
              const { attachBundledBrefDarkoRaptor } = await import(
                "@/data/queries/players"
              );
              return attachBundledBrefDarkoRaptor(playerId, career).catch(
                () => career
              );
            })()
          : await enrichPlayerCareerAdvancedCached(playerId, career).catch(
              () => career
            );
    const rows = toCareerBoardRows(filterCareerBoardSource(source));
    const seasons = rows.map((row) => row.season);
    const compare = pickCareerCompareSeason(seasons, season, compareSeason);
    const preferDarko =
      initialMetric ??
      (rows.some((row) => row.darko != null) ? "darko" : undefined);

    // Game dots hydrate on the client — embedding full career logs here used to
    // add ~200–300KB to the player-page RSC payload (500+ games for long careers).
    return (
      <PlayerCareerBoard
        playerId={playerId}
        season={season}
        seasonType={seasonType}
        rows={rows}
        compareSeason={compare}
        teamKey={teamKey}
        fromHistory={fromHistory}
        themeMode={themeMode}
        chart={chart}
        hideTitle={hideTitle}
        initialMetric={preferDarko}
        showFilters={showFilters}
      />
    );
  } catch {
    const rows = toCareerBoardRows(career);
    return (
      <PlayerCareerBoard
        playerId={playerId}
        season={season}
        seasonType={seasonType}
        rows={rows}
        compareSeason={season}
        teamKey={teamKey}
        fromHistory={fromHistory}
        themeMode={themeMode}
        chart={chart}
        hideTitle={hideTitle}
        showFilters={showFilters}
      />
    );
  }
}
