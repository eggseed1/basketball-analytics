import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { PageAtmosphere } from "@/components/brand/page-atmosphere";
import { PriorSeasonStatsNotice } from "@/components/explore/season-not-started-notice";
import { PlayerOnOffIsland } from "@/components/players/player-on-off-island";
import { seasonHasOnOff } from "@/lib/on-off/types";
import { shareImageMetadata } from "@/lib/share-images";
import { JsonLd } from "@/components/seo/json-ld";
import { absoluteUrl } from "@/lib/site-url";
import {
  GlassSurface,
  GlassTintScaleProvider,
} from "@/components/brand/glass-surface";
import { DestinationClientShell } from "@/components/continuity/destination-client-shell";
import { HistoricalCareerSurface } from "@/components/players/historical-career-surface";
import { PlayerAskLinks } from "@/components/players/player-ask-links";
import { PlayerCareerDataGuardBanner } from "@/components/players/player-career-data-guard-banner";
import { PlayerCareerIsland } from "@/components/players/player-career-island";
import { PlayerDestinationIdentity } from "@/components/players/player-destination-identity";
import { MotionReveal } from "@/components/continuity/motion-reveal";
import { PlayerPercentileIsland } from "@/components/players/player-percentile-island";
import { PlayerNotYetPlayed } from "@/components/players/player-not-yet-played";
import { unplayedDrafteeFor } from "@/data/runtime/draftee-search";
import { PlayerComparisonsBoard } from "@/components/players/player-comparisons-board";
import {
  PlayerCareerAnalysisIslandDeferred,
  PlayerGamesIslandDeferred,
  PlayerSentimentTabIslandDeferred,
  PlayerStatDepthIslandDeferred,
  PlayerVisualizationsIslandDeferred,
} from "@/components/players/player-page-deferred-islands";
import {
  PlayerBoardSkeleton,
  PlayerOverviewContractSkeleton,
  PlayerPercentileSkeleton,
} from "@/components/players/player-page-skeletons";
import { PlayerOverviewCareerSection } from "@/components/players/player-overview-career-section";
import { PlayerViewSeasonProvider } from "@/components/players/player-view-season";
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
import { awardWinnerIdForQuery } from "@/data/runtime/awards-search-boost";
import { parseBrefPlayerSlug } from "@/data/providers/nba/bref-career-from-page";
import {
  ensurePlayerSearch,
  findPlayerSearchRowByName,
  getPlayerSearchIndex,
} from "@/data/runtime/player-search-snapshot";
import {
  getBundledCurrentRosterEntry,
  resolveBundledCurrentTeamId,
} from "@/data/runtime/current-roster-snapshot";
import { resolveHistoricalTeamBrand } from "@/lib/historical-team-brand";
import { brandAtmosphereColors } from "@/lib/game-matchup-theme";
import { isHallOfFamePlayerId } from "@/lib/hall-of-fame-style";
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
  multiTeamSeasonLabel,
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
import { isPreseasonRosterSeason } from "@/data/providers/nba/espn-roster-client";
import { slimEdgeProductEnabled } from "@/data/providers/nba/runtime-policy";
import { PlayerAccoladesIsland } from "@/components/players/player-accolades-island";
import {
  PlayerArrivalIsland,
  PlayerContractSectionIsland,
} from "@/components/players/player-contract-transactions-island";
import { PlayerUpcomingGamesFromSnapshot } from "@/components/players/player-upcoming-games-island";
import { yieldForStreaming } from "@/lib/stream-yield";

/** Team color stays a hint on player cards, close to the neutral home page cards. */
const PLAYER_CARD_TINT_SCALE = 0.3;

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

  // Search lists a few pre-1997 legends (Bird, Jordan) under ESPN ids; their
  // careers only exist in the baked BRef bundle.
  if (/^\d+$/.test(id)) {
    const row = getPlayerSearchIndex().find((r) => r.id === id);
    if (row && (row.firstSeason ?? row.season) < "1996-97") {
      const legend = awardWinnerIdForQuery(row.name);
      if (legend?.startsWith("bref:")) return legend;
    }
  }

  if (!id.toLowerCase().startsWith("bref:")) return id;
  if (parseBrefPlayerSlug(id)) return id;
  // Name-shaped ids (`bref:ed o'bannon|tot:1996-97`, `bref:ed obannon`).
  const inner = id.slice(id.indexOf(":") + 1);
  const namePart = inner.split("|")[0] ?? "";
  const season = /(\d{4}-\d{2})$/.exec(inner)?.[1] ?? null;
  const fromEspn = lookupEspnIdByPlayerName(namePart);
  if (fromEspn) return fromEspn;
  const row = findPlayerSearchRowByName(namePart, season);
  return row?.id && row.id !== id ? row.id : id;
}

/** ESPN id for a bref: route only when exactly one indexed player has that name. */
function uniqueEspnIdForBrefName(
  playerId: string,
  displayName: string | null | undefined
): string | null {
  if (!playerId.toLowerCase().startsWith("bref:") || !displayName) return null;
  const espnId = lookupEspnIdByPlayerName(displayName);
  if (!espnId) return null;
  const nameLower = displayName.toLowerCase();
  const sameName = getPlayerSearchIndex().filter((r) => r.nameLower === nameLower);
  return sameName.length === 1 && sameName[0]!.id === espnId ? espnId : null;
}

export async function generateMetadata({ params }: PlayerPageProps) {
  await yieldForStreaming();
  const t = await getTranslations("PlayerDetail");
  const { playerId: rawId } = await params;
  // Metadata only needs the name index — skip portrait ASSETS on this path.
  await ensurePlayerSearch();
  const playerId = resolvePublicPlayerId(rawId);
  // Sync search/roster only — live getPlayerCached blocked metadata on cold MISS.
  const searchHit = getPlayerSearchIndex().find((r) => r.id === playerId);
  const displayName = firstUsablePlayerDisplayName(searchHit?.name);
  const canonicalId =
    uniqueEspnIdForBrefName(playerId, displayName) ?? playerId;
  return {
    title: displayName
      ? t("metaStatsTitle", { name: displayName })
      : t("metaPlayerFallback"),
    alternates: { canonical: `/players/${encodeURIComponent(canonicalId)}` },
    description: displayName
      ? `${displayName} stats by season, game log, shot chart, on/off splits, DRBL impact rating and contract.`
      : undefined,
    ...shareImageMetadata(
      "players",
      canonicalId,
      displayName ?? t("metaPlayerFallback")
    ),
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
  await yieldForStreaming();
  const t = await getTranslations("PlayerDetail");
  const { playerId: rawId } = await params;
  const sp = await searchParams;
  // Kick portrait ASSETS early; await only when identity needs the URL so
  // career / identity work overlaps the three map fetches.
  const portraitsReady = import("@/data/media/portrait-lookup-store").then(
    (m) => m.ensurePortraitMaps()
  );
  await ensurePlayerSearch();
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
  const nowSeason = canonicalSeasonFromStartYear(currentNbaStartYear());
  const season = resolvePlayerSeason(career, seasonParam, historySeasonIds, {
    preferPeakWhenHistorical: true,
    isActive: masterPlayer?.isActive,
    nowSeason,
  });
  const statsCtx = resolvePlayerStatsSeason(career, season);
  // Baked draft list says he hasn't played, and no career row disagrees. An
  // empty career alone could be an upstream outage, not a rookie.
  const notYetPlayed = career.some((row) => row.gamesPlayed > 0) || historyCareer
    ? null
    : unplayedDrafteeFor(playerId, identity?.espnId, identity?.nbaId);
  const peakSeasonHint = (() => {
    let best: { season: string; ppg: number } | null = null;
    for (const row of career) {
      if (!(row.gamesPlayed >= 20) || !(row.points > 0)) continue;
      const ppg = row.points / row.gamesPlayed;
      if (!Number.isFinite(ppg)) continue;
      if (!best || ppg > best.ppg) best = { season: row.season, ppg };
    }
    return best?.season ?? null;
  })();
  // Keep the open league year (and the resolved selection) on the slider even
  // at 0 GP — otherwise seasonOnTrack snaps Explore deep links 2026-27→2025-26.
  const keepCurrentOnTrack =
    !isPreseasonRosterSeason(nowSeason) ||
    career.some((row) => row.season === nowSeason);
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
      ...(keepCurrentOnTrack ? [nowSeason] : []),
      season,
    ]),
  ].sort((a, b) => b.localeCompare(a));
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
  // An unsigned pick's profile still names the team holding his rights, so
  // only a roster spot counts as a current team for him.
  const currentFranchiseId =
    (notYetPlayed ? null : brandableTeamKey(player?.currentTeamId)) ??
    brandableTeamKey(rosterTeamId) ??
    null;
  const teamKey = notYetPlayed
    ? currentFranchiseId
    : !viewingHistoricalSeason && currentFranchiseId
      ? currentFranchiseId
      : seasonTeamKey;
  const rosterEntry =
    getBundledCurrentRosterEntry(identity?.espnId) ??
    getBundledCurrentRosterEntry(playerId) ??
    getBundledCurrentRosterEntry(identity?.nbaId);
  const teamLabel =
    notYetPlayed && !currentFranchiseId
      ? null
      : !viewingHistoricalSeason && currentFranchiseId
      ? rosterEntry?.teamName ||
        lastStint?.teamLabel ||
        seasonTeamCtx.displayLabel
      : lastStint
        ? lastStint.teamLabel
        : isMultiTeamRow && primaryTeam
          ? multiTeamSeasonLabel(primaryTeam, career)
          : seasonTeamCtx.displayLabel ??
            (primaryTeam && !brandableTeamKey(primaryTeam.teamId)
              ? t("teamUnavailable")
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
  const recentSeasons = [...new Set(notYetPlayed ? [] : career.map((row) => row.season))]
    .sort((a, b) => b.localeCompare(a))
    .slice(0, 5)
    .map((s) => primaryTeamForSeason(career, s))
    .filter((row): row is NonNullable<typeof row> => row != null);

  await portraitsReady;
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

  // Slim edge (explicit SLIM_EDGE_PRODUCT=1 only) — paid Workers run the full page.
  const slimWorker = slimEdgeProductEnabled();

  // Identity chrome paints first; percentile hero streams (tall skeleton holds
  // layout). Awaiting the hero blocked cold MISS TTFB on pools + enrich.
  const percentileHeroNode = !notYetPlayed ? (
    <Suspense fallback={<PlayerPercentileSkeleton />}>
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
  ) : null;

  const accoladesNode = slimWorker ? null : (
    <Suspense fallback={null}>
      <PlayerAccoladesIsland
        playerId={playerId}
        playerName={displayName === playerId ? null : displayName}
        teamKey={teamKey}
        historicalBrand={historicalBrand}
        honor={honor}
      />
    </Suspense>
  );

  const upcomingScheduleNode =
    !slimWorker && scheduleTeamKey ? (
      <Suspense fallback={null}>
        <PlayerUpcomingGamesFromSnapshot scheduleTeamKey={scheduleTeamKey} />
      </Suspense>
    ) : null;

  const frontOfficeNode = slimWorker ? null : (
    <Suspense fallback={null}>
      <PlayerArrivalIsland
        playerId={playerId}
        espnId={identity?.espnId}
        nbaId={identity?.nbaId}
        playerName={displayName}
        teamKey={teamKey}
        historicalBrand={historicalBrand}
        honor={honor}
      />
    </Suspense>
  );

  const caps = playerPageCapabilities({
    selectedSeason: season,
    careerFirstSeason:
      historyCareer?.firstSeason ??
      masterPlayer?.firstSeason ??
      seasonOptions.at(-1),
    showSentiment: showLiveIntelligence,
    hasOnOff: seasonHasOnOff(statsCtx.statsSeason),
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

  const mainContent = (
    <>
        {statsCtx.usingPriorSeasonStats ? (
          <PriorSeasonStatsNotice
            variant="banner"
            requestSeason={statsCtx.requestSeason}
            statsSeason={statsCtx.statsSeason}
          />
        ) : null}
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
          accolades={accoladesNode}
          upcomingSchedule={upcomingScheduleNode}
          frontOffice={frontOfficeNode}
          hero={
            notYetPlayed ? (
              <PlayerNotYetPlayed
                playerName={displayName}
                draftYear={notYetPlayed.year}
                overall={notYetPlayed.overall}
              />
            ) : (
              percentileHeroNode
            )
          }
        >
          <PlayerCareerDataGuardBanner guard={careerDataGuard} />
        </PlayerDestinationIdentity>

        {view === "sentiment" ? (
          <Suspense
            fallback={<PlayerBoardSkeleton label={t("loadingSentiment")} />}
          >
            <PlayerSentimentTabIslandDeferred
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
            fallback={<PlayerBoardSkeleton label={t("loadingGameLog")} />}
          >
            <PlayerGamesIslandDeferred
              playerId={playerId}
              season={statsCtx.statsSeason}
              seasonType={seasonType}
              teamKey={teamKey}
            />
          </Suspense>
        ) : null}

        {view === "overview" && !(slimWorker || notYetPlayed) ? (
          <Suspense
            fallback={<PlayerBoardSkeleton label={t("loadingCareer")} />}
          >
            <PlayerOverviewCareerSection
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
            fallback={<PlayerBoardSkeleton label={t("loadingCareer")} />}
          >
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
          </Suspense>
        ) : null}

        {view === "career" && !slimWorker ? (
          <Suspense
            fallback={
              <PlayerBoardSkeleton label={t("loadingCareerAnalysis")} />
            }
          >
            <PlayerCareerAnalysisIslandDeferred
              playerId={playerId}
              displayName={displayName}
              season={season}
              career={career}
              teamKey={teamKey}
            />
          </Suspense>
        ) : null}

        {view === "overview" && !slimWorker ? (
          <Suspense
            fallback={
              <PlayerOverviewContractSkeleton label={t("loadingSalary")} />
            }
          >
            <PlayerContractSectionIsland
              playerId={playerId}
              playerName={displayName}
              teamKey={teamKey}
              nbaId={identity?.nbaId}
              season={seasonParam}
              variant="summary"
            />
          </Suspense>
        ) : null}

        {view === "salary" && !slimWorker ? (
          <Suspense
            fallback={
              <PlayerOverviewContractSkeleton label={t("loadingSalary")} />
            }
          >
            <PlayerContractSectionIsland
              playerId={playerId}
              playerName={displayName}
              teamKey={teamKey}
              nbaId={identity?.nbaId}
              season={seasonParam}
              variant="full"
            />
          </Suspense>
        ) : null}

        {view === "career" &&
        careerSeasonsForTable.length > 0 &&
        historyCareer ? (
          <HistoricalCareerSurface
            career={historyCareer}
            seasons={careerSeasonsForTable}
            playerId={playerId}
            viewingSeason={season}
            mode="full"
          />
        ) : null}

        {view === "overview" && career.length > 0 ? (
          <PlayerComparisonsBoard
            playerId={playerId}
            season={season}
            teamKey={teamKey}
            espnId={identity?.espnId}
            position={bioPosition}
          />
        ) : null}

        {view === "overview" && !slimWorker && !notYetPlayed ? (
          <section
            id="ask"
            data-slot="section-frame"
            className="scroll-mt-16 flex flex-col gap-3"
            aria-label={t("askAria")}
          >
            <div>
              <h2 className="text-[20px] font-bold tracking-tight">
                {t("askTitle", { name: displayName })}
              </h2>
              <p className="text-[14px] text-muted-foreground">
                {t("askHint")}
              </p>
            </div>
            <div className="sports-card p-4 sm:p-5">
              <PlayerAskLinks
                playerId={playerId}
                playerName={displayName}
                season={statsCtx.statsSeason}
                peakSeason={peakSeasonHint}
                fromHistory={fromHistory}
              />
            </div>
          </section>
        ) : null}

        {view === "shooting" ? (
          <Suspense
            fallback={<PlayerBoardSkeleton label={t("loadingShotChart")} />}
          >
            <PlayerVisualizationsIslandDeferred
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

        {view === "onoff" ? (
          <Suspense fallback={<PlayerBoardSkeleton label={t("loadingOnOff")} />}>
            <PlayerOnOffIsland
              playerId={playerId}
              nbaIds={[identity?.nbaId, /^\d+$/.test(playerId) ? playerId : null]}
              season={statsCtx.statsSeason}
              playerName={displayName}
            />
          </Suspense>
        ) : null}

        {view === "splits" || view === "advanced" || view === "highs" ? (
          <Suspense
            fallback={<PlayerBoardSkeleton label={t("loadingDeepStats")} />}
          >
            <PlayerStatDepthIslandDeferred
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
          </Suspense>
        ) : null}
    </>
  );

  const body = (
    <DestinationClientShell className="site-shell flex flex-1 flex-col gap-4 pb-5 sm:gap-5 sm:pb-7">
      <PageAtmosphere
        colorA={atmosphere?.colorA}
        colorB={atmosphere?.colorB}
      />
      <main data-motion-page className="relative z-[1] flex flex-1 flex-col gap-4 sm:gap-5">
        {career.length === 0 ? <span hidden data-page-cache="skip" /> : null}
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "ProfilePage",
            mainEntity: {
              "@type": "Person",
              name: displayName,
              url: absoluteUrl(
                `/players/${encodeURIComponent(
                  identity?.espnId ?? uniqueEspnIdForBrefName(playerId, displayName) ?? playerId
                )}`
              ),
            },
          }}
        />
        <MotionReveal />
        <GlassTintScaleProvider scale={PLAYER_CARD_TINT_SCALE}>
          <PlayerViewSeasonProvider
            initialSeason={season}
            seasonOptions={seasonOptions}
          >
            {/* Stack so overview sections hold for scroll reveal; hero stays eager. */}
            <div
              data-motion-stack
              className="flex flex-col gap-4 sm:gap-5"
            >
              {mainContent}
            </div>
          </PlayerViewSeasonProvider>
        </GlassTintScaleProvider>
      </main>
    </DestinationClientShell>
  );

  if (!eraTheme) return body;
  return <EraThemeScope theme={eraTheme}>{body}</EraThemeScope>;
}
