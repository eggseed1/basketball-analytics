import { Suspense } from "react";
import { notFound } from "next/navigation";

import { PageAtmosphere } from "@/components/brand/page-atmosphere";
import { PriorSeasonStatsNotice } from "@/components/explore/season-not-started-notice";
import { GlassSurface } from "@/components/brand/glass-surface";
import { DestinationClientShell } from "@/components/continuity/destination-client-shell";
import { HistoricalCareerSurface } from "@/components/players/historical-career-surface";
import { PlayerCareerDataGuardBanner } from "@/components/players/player-career-data-guard-banner";
import { PlayerCareerIsland } from "@/components/players/player-career-island";
import { PlayerDestinationIdentity } from "@/components/players/player-destination-identity";
import { PlayerGamesIsland } from "@/components/players/player-games-island";
import { PlayerPercentileIsland } from "@/components/players/player-percentile-island";
import {
  PlayerBoardSkeleton,
  PlayerIdentitySlotSkeleton,
  PlayerPercentileSkeleton,
} from "@/components/players/player-page-skeletons";
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
import { lookupEspnIdByPlayerName } from "@/data/runtime/espn-name-index";
import { remapLegendNbaIdToBref, resolveLegacyNbaPersonId } from "@/data/runtime/legend-nba-to-bref";
import {
  getBundledCurrentRosterEntry,
  resolveBundledCurrentTeamId,
} from "@/data/runtime/current-roster-snapshot";
import { resolveHistoricalTeamBrand } from "@/lib/historical-team-brand";
import { brandAtmosphereColors } from "@/lib/game-matchup-theme";
import {
  HOF_PAGE_FRAME_CLASS,
  isHallOfFamePlayerId,
} from "@/lib/hall-of-fame-style";
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
  resolvePlayerScheduleTeamKey,
  resolveSelectedSeasonTeamContext,
} from "@/lib/player-team-context";
import { firstUsablePlayerDisplayName } from "@/lib/player-display-name";
import { resolveActiveEraTheme } from "@/themes/era-theme";
import {
  parseDestinationHistoryArrival,
} from "@/themes/history-url";
import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
} from "@/data/providers/historical/season-range";
import { slimEdgeProductEnabled } from "@/data/providers/nba/runtime-policy";
import { PlayerAccoladesIsland } from "@/components/players/player-accolades-island";
import { PlayerContractTransactionsIsland } from "@/components/players/player-contract-transactions-island";
import { PlayerUpcomingGamesFromSnapshot } from "@/components/players/player-upcoming-games-island";
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

function uniquePlayerIds(
  ...ids: Array<string | null | undefined>
): string[] {
  return [
    ...new Set(
      ids
        .map((id) => String(id ?? "").trim())
        .filter(Boolean)
    ),
  ];
}

function firstByPlayerId<T>(
  ids: string[],
  load: (id: string) => T | null
): T | null {
  for (const id of ids) {
    const value = load(id);
    if (value) return value;
  }
  return null;
}

function firstRowsByPlayerId<T>(
  ids: string[],
  load: (id: string) => T[]
): T[] {
  for (const id of ids) {
    const rows = load(id);
    if (rows.length > 0) return rows;
  }
  return [];
}

/** Legacy Cloudflare BRef peer-board ids → ESPN athlete id when known. */
function resolvePublicPlayerId(raw: string): string {
  let id = String(raw ?? "").trim();
  try {
    id = decodeURIComponent(id);
  } catch {
    // keep raw
  }
  // NBA Stats person ids for retired legends → BRef slugs (CF-safe career path).
  if (/^\d+$/.test(id)) {
    id = resolveLegacyNbaPersonId(id) ?? id;
  }
  const remapped = remapLegendNbaIdToBref(id);
  if (remapped) return remapped;

  if (!id.toLowerCase().startsWith("bref:")) return id;
  const inner = id.slice(id.indexOf(":") + 1);
  const namePart = inner.split("|")[0] ?? "";
  return lookupEspnIdByPlayerName(namePart) ?? id;
}

export async function generateMetadata({ params }: PlayerPageProps) {
  const { playerId: rawId } = await params;
  const playerId = resolvePublicPlayerId(rawId);
  const [player, identity] = await Promise.all([
    getPlayerCached(playerId),
    resolvePlayerIdentityCached(playerId).catch(() => null),
  ]);
  const displayName = firstUsablePlayerDisplayName(
    identity?.displayName,
    player?.fullName
  );
  return {
    title: displayName
      ? `${displayName} | Basketball Analytics`
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
  const { playerId: rawId } = await params;
  const sp = await searchParams;
  // Resolve legacy bref: peer-board ids to ESPN athlete ids (no redirect required).
  const playerId = resolvePublicPlayerId(rawId);
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

  const [player, career, identity] = await Promise.all([
    getPlayerCached(playerId),
    getPlayerCareerSeasonsCached(playerId).catch(() => []),
    resolvePlayerIdentityCached(playerId).catch(() => null),
  ]);

  // Public player routes use ESPN athlete ids while history/master registries
  // are generally keyed by NBA PERSON_ID. Search every verified namespace.
  const playerLookupIds = uniquePlayerIds(
    identity?.nbaId,
    playerId,
    identity?.espnId
  );
  const historyCareer = firstByPlayerId(
    playerLookupIds,
    getHistoryCareerForPlayer
  );
  const historySeasons = firstRowsByPlayerId(
    playerLookupIds,
    getHistorySeasonsForPlayer
  );
  const { getMasterPlayer, getUniverseSeasonsForPlayer } = await import(
    "@/data/history/player-universe"
  );
  const masterPlayer = firstByPlayerId(playerLookupIds, getMasterPlayer);
  // Skip full-universe scans when career or history already supplies seasons.
  const universeSeasons =
    historySeasons.length > 0
      ? historySeasons
      : career.length > 0
        ? []
        : firstRowsByPlayerId(playerLookupIds, getUniverseSeasonsForPlayer);

  // A verified alias is enough to establish the route even when every optional
  // upstream is temporarily down. Unknown ids still receive the real 404.
  if (
    !player &&
    career.length === 0 &&
    !historyCareer &&
    !masterPlayer &&
    !identity?.displayName
  ) {
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
    ...new Set([
      ...career
        .filter(
          (row) =>
            row.gamesPlayed > 0 ||
            Boolean(
              row.per ||
                row.vorp ||
                row.winShares ||
                row.points ||
                row.offensiveRating
            )
        )
        .map((row) => row.season),
      ...historySeasonIds,
    ]),
  ].sort((a, b) => b.localeCompare(a));
  const nowSeason = canonicalSeasonFromStartYear(currentNbaStartYear());
  const seasonTeams = buildSeasonTeamsMap(career);
  const seasonTeamCtx = resolveSelectedSeasonTeamContext(career, season);
  const primaryTeam = seasonTeamCtx.row;
  const isMultiTeamRow = seasonTeamCtx.kind === "MULTI_TEAM_AGGREGATE";
  const seasonStints = cardStintsForSeason(career, season);
  const lastStint = lastCardStint(seasonStints);
  const seasonTeamKey = lastStint?.teamKey ?? seasonTeamCtx.brandTeamKey;
  // Default / current-season chrome follows ESPN roster (offseason trades),
  // not last completed season's BRef stint — keeps identity aligned with sentiment.
  const viewingHistoricalSeason =
    Boolean(seasonParam) && seasonParam !== nowSeason;
  const rosterTeamId = resolveBundledCurrentTeamId(
    identity?.espnId,
    playerId,
    identity?.nbaId
  );
  const currentFranchiseId =
    brandableTeamKey(player?.currentTeamId) ??
    brandableTeamKey(rosterTeamId) ??
    null;
  const teamKey =
    !viewingHistoricalSeason && currentFranchiseId
      ? currentFranchiseId
      : seasonTeamKey;
  const rosterEntry =
    getBundledCurrentRosterEntry(identity?.espnId) ??
    getBundledCurrentRosterEntry(playerId) ??
    getBundledCurrentRosterEntry(identity?.nbaId);
  const teamLabel =
    !viewingHistoricalSeason && currentFranchiseId
      ? rosterEntry?.teamName ||
        lastStint?.teamLabel ||
        seasonTeamCtx.displayLabel
      : lastStint
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

  const scheduleTeamKey = resolvePlayerScheduleTeamKey({
    isRetired,
    career,
    nowSeason,
    teamKey,
    masterTeamHistory: masterPlayer?.teamHistory ?? historyCareer?.teams ?? null,
    historyTeams: historyCareer?.teams ?? null,
  });

  const careerDataGuard = assessProductionProviderGuard({
    providerName: getDataProvider().name,
    playerId,
    careerRowCount: career.length,
  });

  const latestCareerName = [...career]
    .sort((a, b) => b.season.localeCompare(a.season))[0]?.playerName;
  const displayName =
    firstUsablePlayerDisplayName(
      identity?.displayName,
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

  const portraitUrl = getPlayerPortraitUrl(rawId) ??
    getPlayerPortraitUrl(playerId) ??
    (identity?.nbaId ? getPlayerPortraitUrl(identity.nbaId) : null) ??
    (identity?.espnId ? getPlayerPortraitUrl(identity.espnId) : null);
  const honor = isHallOfFamePlayerId(
    rawId,
    playerId,
    identity?.nbaId,
    identity?.espnId
  )
    ? ("hof" as const)
    : undefined;
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

  // Slim edge (explicit SLIM_EDGE_PRODUCT=1 only) — paid Workers run the full page.
  const slimWorker = slimEdgeProductEnabled();

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

  const mainContent = (
    <>
        <PlayerDestinationIdentity
          playerId={playerId}
          espnId={identity?.espnId}
          nbaId={identity?.nbaId}
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
          honor={honor}
          accolades={
            slimWorker ? null : (
              <Suspense fallback={<PlayerIdentitySlotSkeleton />}>
                <PlayerAccoladesIsland
                  playerId={playerId}
                  teamKey={teamKey}
                  historicalBrand={historicalBrand}
                  honor={honor}
                />
              </Suspense>
            )
          }
          upcomingSchedule={
            !slimWorker && scheduleTeamKey ? (
              <Suspense fallback={<PlayerIdentitySlotSkeleton />}>
                <PlayerUpcomingGamesFromSnapshot
                  scheduleTeamKey={scheduleTeamKey}
                />
              </Suspense>
            ) : null
          }
          frontOffice={
            slimWorker ? null : (
              <Suspense fallback={<PlayerIdentitySlotSkeleton />}>
                <PlayerContractTransactionsIsland
                  playerId={playerId}
                  playerName={displayName}
                  teamKey={teamKey}
                  historicalBrand={historicalBrand}
                  honor={honor}
                />
              </Suspense>
            )
          }
          hero={
            <Suspense
              fallback={
                <div className="col-span-1 min-h-[28rem]">
                  <PlayerPercentileSkeleton />
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
                nbaId={identity?.nbaId}
                espnId={identity?.espnId}
                honor={honor}
              />
            </Suspense>
          }
        >
          <PlayerCareerDataGuardBanner guard={careerDataGuard} />
        </PlayerDestinationIdentity>

        {view === "sentiment" ? (
          <Suspense
            fallback={<PlayerBoardSkeleton label="Loading sentiment…" />}
          >
            <PlayerSentimentTabIsland
              playerId={playerId}
              playerName={displayName}
              teamKey={teamKey}
              historicalBrand={historicalBrand}
              honor={honor}
            />
          </Suspense>
        ) : null}

        {view === "games" ? (
          <Suspense
            fallback={<PlayerBoardSkeleton label="Loading game log…" />}
          >
            {statsCtx.usingPriorSeasonStats ? (
              <PriorSeasonStatsNotice
                requestSeason={statsCtx.requestSeason}
                statsSeason={statsCtx.statsSeason}
              />
            ) : null}
            <PlayerGamesIsland
              playerId={playerId}
              season={statsCtx.statsSeason}
              seasons={seasonOptions}
              seasonType={seasonType}
              teamKey={teamKey}
            />
          </Suspense>
        ) : null}

        {view === "overview" || view === "career" ? (
          slimWorker && view === "overview" ? null : (
            <Suspense
              fallback={<PlayerBoardSkeleton label="Loading career…" />}
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
          )
        ) : null}

        {view === "career" && !slimWorker ? (
          <Suspense
            fallback={
              <PlayerBoardSkeleton label="Loading career analysis…" />
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
            fallback={<PlayerBoardSkeleton label="Loading statistics…" />}
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
                honor={honor}
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
            fallback={<PlayerBoardSkeleton label="Loading shot chart…" />}
          >
            {statsCtx.usingPriorSeasonStats ? (
              <PriorSeasonStatsNotice
                requestSeason={statsCtx.requestSeason}
                statsSeason={statsCtx.statsSeason}
              />
            ) : null}
            <PlayerVisualizationsIsland
              playerId={playerId}
              nbaId={identity?.nbaId}
              season={statsCtx.statsSeason}
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
            fallback={<PlayerBoardSkeleton label="Loading deep stats…" />}
          >
            {statsCtx.usingPriorSeasonStats ? (
              <PriorSeasonStatsNotice
                requestSeason={statsCtx.requestSeason}
                statsSeason={statsCtx.statsSeason}
              />
            ) : null}
            <GlassSurface effect="css" className="p-1 sm:p-2" honor={honor}>
              <PlayerStatDepthIsland
                playerId={playerId}
                season={statsCtx.statsSeason}
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
    </>
  );

  const body = (
    <DestinationClientShell className="site-shell flex flex-1 flex-col gap-4 py-5 sm:gap-5 sm:py-7">
      <PageAtmosphere
        colorA={atmosphere?.colorA}
        colorB={atmosphere?.colorB}
      />
      <main className="relative z-[1] flex flex-1 flex-col gap-4 sm:gap-5">
        {honor === "hof" ? (
          <div className={HOF_PAGE_FRAME_CLASS}>
            <div className="hof-page-frame__inner flex flex-col gap-4 p-3 sm:gap-5 sm:p-4">
              {mainContent}
            </div>
          </div>
        ) : (
          mainContent
        )}
      </main>
    </DestinationClientShell>
  );

  if (!eraTheme) return body;
  return <EraThemeScope theme={eraTheme}>{body}</EraThemeScope>;
}
