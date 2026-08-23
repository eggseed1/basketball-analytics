import { Suspense } from "react";
import { notFound } from "next/navigation";

import { PageAtmosphere } from "@/components/brand/page-atmosphere";
import { PriorSeasonStatsNotice } from "@/components/explore/season-not-started-notice";
import { GlassSurface } from "@/components/brand/glass-surface";
import { DestinationClientShell } from "@/components/continuity/destination-client-shell";
import { DestinationSectionSkeleton } from "@/components/continuity/destination-loading-frame";
import { HistoricalCareerSurface } from "@/components/players/historical-career-surface";
import { PlayerCareerDataGuardBanner } from "@/components/players/player-career-data-guard-banner";
import { PlayerCareerIsland } from "@/components/players/player-career-island";
import { PlayerDestinationIdentity } from "@/components/players/player-destination-identity";
import { PlayerGamesIsland } from "@/components/players/player-games-island";
import { PlayerPercentileIsland } from "@/components/players/player-percentile-island";
import { PlayerStatDepthIsland } from "@/components/players/player-stat-depth-island";
import { PlayerStatsIsland } from "@/components/players/player-stats-island";
import { PlayerVisualizationsIsland } from "@/components/players/player-visualizations";
import { EraThemeScope } from "@/components/time-machine/era-theme-scope";
import { assessProductionProviderGuard } from "@/data/diagnostics/production-provider-guard";
import {
  getHistoryCareerForPlayer,
  getHistorySeasonsForPlayer,
} from "@/data/history/player-career";
import { resolvePlayerIdentityCached } from "@/data/identity/player-identity-cache";
import { getPlayerPortraitUrl } from "@/data/media/get-player-media";
import { getDataProvider } from "@/data/providers";
import { getPlayerCareerSeasonsCached } from "@/data/queries";
import { getPlayerCached } from "@/data/queries/request-cache";
import { resolveHistoricalTeamBrand } from "@/lib/historical-team-brand";
import { brandAtmosphereColors } from "@/lib/game-matchup-theme";
import { resolveTeamBrand } from "@/lib/nba-brand";
import { resolvePlayerStatsSeason } from "@/lib/player-board-season";
import {
  buildSeasonTeamsMap,
  parsePlayerSeasonKind,
  primaryTeamForSeason,
  resolvePlayerSeason,
} from "@/lib/player-destination";
import {
  parsePlayerPageView,
  parsePlayerStatMode,
  parseGameLogTableMode,
  playerPageCapabilities,
} from "@/lib/player-page-contract";
import {
  brandableTeamKey,
  cardStintsForCareer,
  cardStintsForSeason,
  cardStintsFromTeamKeys,
  isRetiredPlayerCareer,
  lastCardStint,
  mergeCardStints,
  multiTeamDisplayLabel,
  resolveSelectedSeasonTeamContext,
} from "@/lib/player-team-context";
import { firstUsablePlayerDisplayName } from "@/lib/player-display-name";
import { resolveActiveEraTheme } from "@/themes/era-theme";
import {
  historyHref,
  parseDestinationHistoryArrival,
} from "@/themes/history-url";
import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
} from "@/data/providers/historical/season-range";
import { PlayerAccoladesIsland } from "@/components/players/player-accolades-island";
import { PlayerContractTransactionsIsland } from "@/components/players/player-contract-transactions-island";
import { PlayerUpcomingGamesIsland } from "@/components/players/player-upcoming-games-island";
import { PlayerSentimentTabIsland } from "@/components/players/player-sentiment-tab-island";
import { PlayerCareerAnalysisIsland } from "@/components/players/player-career-analysis-island";

interface PlayerPageProps {
  params: Promise<{ playerId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function one(
  sp: Record<string, string | string[] | undefined>,
  key: string
): string | undefined {
  const v = sp[key];
  return Array.isArray(v) ? v[0] : v;
}

export async function generateMetadata({ params }: PlayerPageProps) {
  const { playerId } = await params;
  const player = await getPlayerCached(playerId);
  return {
    title: player
      ? `${player.fullName} | Basketball Analytics`
      : "Player | Basketball Analytics",
  };
}

/**
 * Hannah exact player frontend composition + P18 product contracts.
 * URL semantics: P18 `?season=&view=` (seven tabs).
 * Presentation: Hannah identity / glass / depth islands / shot map.
 */
export default async function PlayerPage({
  params,
  searchParams,
}: PlayerPageProps) {
  const { playerId } = await params;
  const sp = await searchParams;
  const seasonParam = one(sp, "season");
  const view = parsePlayerPageView(one(sp, "view"));
  const seasonType = parsePlayerSeasonKind(one(sp, "seasonType"));
  const pageParam = one(sp, "page");
  const statParam = one(sp, "stat");
  const filterParam = one(sp, "filter");
  const modeParam = one(sp, "mode");
  const statMode = parsePlayerStatMode(statParam);
  const gameLogMode = parseGameLogTableMode(modeParam);
  const gamesPage = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);
  const filter = filterParam ?? "ALL";
  const { fromHistory, themeMode, applyEraTheme } =
    parseDestinationHistoryArrival(sp);

  // Do not block first paint on league-wide ESPN roster crawl — career overlay
  // already applies preseason franchise identity when needed.
  const [player, career, identity] = await Promise.all([
    getPlayerCached(playerId),
    getPlayerCareerSeasonsCached(playerId),
    resolvePlayerIdentityCached(playerId),
  ]);
  const historyCareer = getHistoryCareerForPlayer(playerId);
  const historySeasons = getHistorySeasonsForPlayer(playerId);
  const { getMasterPlayer, getUniverseSeasonsForPlayer } = await import(
    "@/data/history/player-universe"
  );
  const masterPlayer = getMasterPlayer(playerId);
  // Skip full-universe scan when career or history already supplies seasons.
  const universeSeasons =
    historySeasons.length > 0
      ? historySeasons
      : career.length > 0
        ? []
        : getUniverseSeasonsForPlayer(playerId);

  if (!player && career.length === 0 && !historyCareer && !masterPlayer) {
    notFound();
  }

  const historySeasonIds = [
    ...new Set([
      ...historySeasons.map((s) => s.season),
      ...universeSeasons.map((s) => s.season),
    ]),
  ];
  const season = resolvePlayerSeason(career, seasonParam, historySeasonIds, {
    preferPeakWhenHistorical: true,
    isActive: masterPlayer?.isActive,
  });
  const statsCtx = resolvePlayerStatsSeason(career, season);
  const seasonOptions = [
    ...new Set([...career.map((row) => row.season), ...historySeasonIds]),
  ].sort((a, b) => b.localeCompare(a));
  const nowSeason = canonicalSeasonFromStartYear(currentNbaStartYear());
  const seasonTeams = buildSeasonTeamsMap(career);
  const seasonTeamCtx = resolveSelectedSeasonTeamContext(career, season);
  const primaryTeam = seasonTeamCtx.row;
  const isMultiTeamRow = seasonTeamCtx.kind === "MULTI_TEAM_AGGREGATE";
  const seasonStints = cardStintsForSeason(career, season);
  const lastStint = lastCardStint(seasonStints);
  const teamKey = lastStint?.teamKey ?? seasonTeamCtx.brandTeamKey;
  const teamLabel = lastStint
    ? lastStint.teamLabel
    : isMultiTeamRow
      ? multiTeamDisplayLabel(primaryTeam)
      : seasonTeamCtx.displayLabel ??
        (primaryTeam && !brandableTeamKey(primaryTeam.teamId)
          ? "Team unavailable"
          : null);
  const lastCareerSeason =
    masterPlayer?.lastSeason ??
    historyCareer?.lastSeason ??
    [...career].sort((a, b) => b.season.localeCompare(a.season))[0]?.season ??
    null;
  const hasCurrentSeasonRoster = career.some((row) => row.season === nowSeason);
  const hasCurrentSeasonGames = career.some(
    (row) => row.season === nowSeason && row.gamesPlayed > 0
  );
  const isRetired = isRetiredPlayerCareer({
    lastSeason: lastCareerSeason,
    isActive: masterPlayer?.isActive,
    nowSeason,
    hasCurrentSeasonGames,
    hasCurrentSeasonRoster,
  });
  const priorSeason = canonicalSeasonFromStartYear(currentNbaStartYear() - 1);
  const showLiveIntelligence =
    !isRetired ||
    (lastCareerSeason != null &&
      lastCareerSeason >= priorSeason &&
      masterPlayer?.isActive !== false);
  const careerTeamStints = mergeCardStints(
    mergeCardStints(
      cardStintsForCareer(career),
      cardStintsFromTeamKeys(
        masterPlayer?.teamHistory ?? historyCareer?.teams ?? []
      )
    ),
    cardStintsFromTeamKeys(
      (historySeasons.length > 0 ? historySeasons : universeSeasons).flatMap(
        (s) => s.teamIds ?? []
      )
    )
  );
  const useHistoricalBranding = applyEraTheme && themeMode !== "modern";
  const historicalBrand =
    useHistoricalBranding && teamKey
      ? resolveHistoricalTeamBrand(teamKey, season, "era")
      : null;

  const scheduleTeamKey = isRetired
    ? null
    : (() => {
        const nowRow = career.find((row) => row.season === nowSeason);
        return nowRow ? brandableTeamKey(nowRow.teamId) ?? null : null;
      })();

  const careerDataGuard = assessProductionProviderGuard({
    providerName: getDataProvider().name,
    playerId,
    careerRowCount: career.length,
  });

  const latestCareerName = [...career]
    .sort((a, b) => b.season.localeCompare(a.season))[0]?.playerName;
  // Never prefer synthetic "Player 1628983" career labels over bio / identity.
  const displayName =
    firstUsablePlayerDisplayName(
      identity.displayName,
      player?.fullName,
      latestCareerName,
      historyCareer?.playerName,
      masterPlayer?.displayName
    ) ?? playerId;
  const bioPosition = primaryTeam?.position ?? player?.position ?? null;
  const seasonStintsWithPosition = seasonStints.map((stint) => ({
    ...stint,
    position: stint.position || bioPosition,
  }));
  const heightLabel = player?.heightInches
    ? `${Math.floor(player.heightInches / 12)}'${player.heightInches % 12}"`
    : null;
  const weightLabel = player?.weightLbs ? `${player.weightLbs} lb` : null;
  const recentSeasons = [...new Set(career.map((row) => row.season))]
    .sort((a, b) => b.localeCompare(a))
    .slice(0, 5)
    .map((s) => primaryTeamForSeason(career, s))
    .filter((row): row is NonNullable<typeof row> => row != null);

  const portraitUrl = getPlayerPortraitUrl(playerId);
  const eraTheme = applyEraTheme
    ? resolveActiveEraTheme(season, themeMode)
    : null;

  const caps = playerPageCapabilities({
    selectedSeason: season,
    careerFirstSeason:
      historyCareer?.firstSeason ??
      masterPlayer?.firstSeason ??
      seasonOptions.at(-1),
    showSentiment: showLiveIntelligence,
  });

  const careerSeasonsForTable =
    historySeasons.length > 0 ? historySeasons : universeSeasons;

  const palette =
    useHistoricalBranding && historicalBrand?.palette
      ? historicalBrand.palette
      : resolveTeamBrand(teamKey);
  const atmosphere = brandAtmosphereColors(
    palette?.primary,
    palette?.secondary
  );

  const body = (
    <DestinationClientShell className="site-shell flex flex-1 flex-col gap-4 py-5 sm:gap-5 sm:py-7">
      <PageAtmosphere
        colorA={atmosphere?.colorA}
        colorB={atmosphere?.colorB}
      />
      <main className="relative z-[1] flex flex-1 flex-col gap-4 sm:gap-5">
        <PlayerDestinationIdentity
          playerId={playerId}
          espnId={identity.espnId}
          nbaId={identity.nbaId}
          displayName={displayName}
          season={season}
          teamKey={teamKey}
          teamName={historicalBrand?.displayName ?? teamLabel}
          position={bioPosition}
          seasonStints={seasonStintsWithPosition}
          showCareerTeams={isRetired && careerTeamStints.length > 0}
          careerTeamStints={careerTeamStints}
          heightLabel={heightLabel}
          weightLabel={weightLabel}
          birthDate={player?.birthDate ?? null}
          draftInfo={player?.draftInfo ?? null}
          college={player?.college ?? null}
          portraitUrl={portraitUrl}
          historicalBrand={historicalBrand}
          useHistoricalBranding={useHistoricalBranding}
          seasonOptions={seasonOptions}
          recentSeasons={recentSeasons}
          fromHistory={fromHistory}
          themeMode={themeMode}
          view={view}
          caps={caps}
          seasonType={seasonType}
          accolades={
            <Suspense fallback={null}>
              <PlayerAccoladesIsland
                playerId={playerId}
                teamKey={teamKey}
                historicalBrand={historicalBrand}
              />
            </Suspense>
          }
          upcomingSchedule={
            scheduleTeamKey ? (
              <Suspense fallback={null}>
                <PlayerUpcomingGamesIsland
                  playerId={playerId}
                  scheduleTeamKey={scheduleTeamKey}
                />
              </Suspense>
            ) : null
          }
          frontOffice={
            <Suspense fallback={null}>
              <PlayerContractTransactionsIsland
                playerId={playerId}
                playerName={displayName}
                teamKey={teamKey}
                historicalBrand={historicalBrand}
              />
            </Suspense>
          }
          hero={
            <Suspense
              fallback={
                <div className="col-span-1">
                  <DestinationSectionSkeleton label="Loading percentile ranking…" />
                </div>
              }
            >
              <PlayerPercentileIsland
                playerId={playerId}
                displayName={displayName}
                season={season}
                career={career}
                seasonOptions={seasonOptions}
                seasonTeams={seasonTeams}
                identityTeamKey={teamKey}
                nbaId={identity.nbaId}
              />
            </Suspense>
          }
        >
          <PlayerCareerDataGuardBanner guard={careerDataGuard} />
        </PlayerDestinationIdentity>

        {view === "sentiment" ? (
          <Suspense
            fallback={
              <DestinationSectionSkeleton label="Loading sentiment…" />
            }
          >
            <PlayerSentimentTabIsland
              playerId={playerId}
              playerName={displayName}
              teamKey={teamKey}
              historicalBrand={historicalBrand}
            />
          </Suspense>
        ) : null}

        {view === "games" ? (
          <Suspense
            fallback={
              <DestinationSectionSkeleton label="Loading game log…" />
            }
          >
            <PlayerGamesIsland
              playerId={playerId}
              season={season}
              seasons={seasonOptions}
              seasonType={seasonType}
              teamKey={teamKey}
            />
          </Suspense>
        ) : null}

        {view === "overview" || view === "career" ? (
          <Suspense
            fallback={
              <DestinationSectionSkeleton label="Loading career…" />
            }
          >
            <PlayerCareerIsland
              playerId={playerId}
              season={season}
              seasonType={seasonType}
              career={career}
              teamKey={teamKey}
              fromHistory={fromHistory}
              themeMode={themeMode}
            />
          </Suspense>
        ) : null}

        {view === "career" ? (
          <Suspense
            fallback={
              <DestinationSectionSkeleton label="Loading career analysis…" />
            }
          >
            <PlayerCareerAnalysisIsland
              playerId={playerId}
              displayName={displayName}
              season={season}
              career={career}
              teamKey={teamKey}
            />
          </Suspense>
        ) : null}

        {view === "overview" ? (
          <Suspense
            fallback={
              <DestinationSectionSkeleton label="Loading statistics…" />
            }
          >
            <div className="flex flex-col gap-3">
              {statsCtx.usingPriorSeasonStats ? (
                <PriorSeasonStatsNotice
                  requestSeason={statsCtx.requestSeason}
                  statsSeason={statsCtx.statsSeason}
                />
              ) : null}
              <PlayerStatsIsland
                playerId={playerId}
                season={season}
                statsSeason={statsCtx.statsSeason}
                seasonType={seasonType}
                career={career}
                teamKey={teamKey}
                fromHistory={fromHistory}
                themeMode={themeMode === "modern" ? "modern" : "historical"}
              />
            </div>
          </Suspense>
        ) : null}

        {careerSeasonsForTable.length > 0 &&
        historyCareer &&
        (view === "overview" || view === "career") ? (
          <HistoricalCareerSurface
            career={historyCareer}
            seasons={careerSeasonsForTable}
            playerId={playerId}
            viewingSeason={season}
          />
        ) : null}

        {view === "shooting" ? (
          <Suspense
            fallback={
              <DestinationSectionSkeleton label="Loading shot chart…" />
            }
          >
            <PlayerVisualizationsIsland
              playerId={playerId}
              nbaId={identity.nbaId}
              season={season}
              seasons={seasonOptions}
              seasonType={seasonType}
              teamKey={teamKey}
              teamLabel={historicalBrand?.displayName ?? teamLabel}
              teamAbbr={
                isMultiTeamRow ? "TOT" : (primaryTeam?.teamAbbreviation ?? "TOT")
              }
            />
          </Suspense>
        ) : null}

        {view === "splits" || view === "advanced" || view === "highs" ? (
          <Suspense
            fallback={
              <DestinationSectionSkeleton label="Loading deep stats…" />
            }
          >
            <GlassSurface effect="css" className="p-1 sm:p-2">
              <PlayerStatDepthIsland
                playerId={playerId}
                season={season}
                view={view}
                page={gamesPage}
                statMode={statMode}
                gameLogMode={gameLogMode}
                filter={filter}
                historySeasons={careerSeasonsForTable}
                career={career}
                careerFirstSeason={
                  historyCareer?.firstSeason ??
                  masterPlayer?.firstSeason ??
                  seasonOptions.at(-1)
                }
                fromHistory={fromHistory}
                themeMode={themeMode === "modern" ? "modern" : "historical"}
              />
            </GlassSurface>
          </Suspense>
        ) : null}

      </main>
    </DestinationClientShell>
  );

  if (!eraTheme) return body;
  return <EraThemeScope theme={eraTheme}>{body}</EraThemeScope>;
}
