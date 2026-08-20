import { Suspense } from "react";
import { notFound } from "next/navigation";

import { computeCareerResume } from "@/analytics";
import { TeamWashCard } from "@/components/brand/team-wash-card";
import { DestinationClientShell } from "@/components/continuity/destination-client-shell";
import { DestinationSectionSkeleton } from "@/components/continuity/destination-loading-frame";
import { HistoricalCareerSurface } from "@/components/players/historical-career-surface";
import { PlayerAskLinks } from "@/components/players/player-ask-links";
import { PlayerCareerDataGuardBanner } from "@/components/players/player-career-data-guard-banner";
import { PlayerCoreIsland } from "@/components/players/player-core-island";
import { PlayerDestinationIdentity } from "@/components/players/player-destination-identity";
import { PlayerDepthNav } from "@/components/players/player-depth-nav";
import { PlayerGamesIsland } from "@/components/players/player-games-island";
import { PlayerStatDepthIsland } from "@/components/players/player-stat-depth-island";
import { EraThemeScope } from "@/components/time-machine/era-theme-scope";
import { assessProductionProviderGuard } from "@/data/diagnostics/production-provider-guard";
import {
  getHistoryCareerForPlayer,
  getHistorySeasonsForPlayer,
} from "@/data/history/player-career";
import { getDataProvider } from "@/data/providers";
import { getPlayerCareerSeasons } from "@/data/queries";
import { getPlayerCached } from "@/data/queries/request-cache";
import { getPlayerPortraitUrl } from "@/data/media/get-player-media";
import { resolveHistoricalTeamBrand } from "@/lib/historical-team-brand";
import {
  buildSeasonTeamsMap,
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
  multiTeamDisplayLabel,
  resolveSelectedSeasonTeamContext,
} from "@/lib/player-team-context";
import { resolveActiveEraTheme } from "@/themes/era-theme";
import {
  historyHref,
  parseDestinationHistoryArrival,
} from "@/themes/history-url";

interface PlayerPageProps {
  params: Promise<{ playerId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
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
 * Progressive player destination:
 * Layer 1 identity outside Suspense
 * Layer 2 core / games (overview) + deep stats islands
 */
export default async function PlayerPage({
  params,
  searchParams,
}: PlayerPageProps) {
  const { playerId } = await params;
  const sp = await searchParams;
  const seasonParam = Array.isArray(sp.season) ? sp.season[0] : sp.season;
  const viewParam = Array.isArray(sp.view) ? sp.view[0] : sp.view;
  const pageParam = Array.isArray(sp.page) ? sp.page[0] : sp.page;
  const statParam = Array.isArray(sp.stat) ? sp.stat[0] : sp.stat;
  const filterParam = Array.isArray(sp.filter) ? sp.filter[0] : sp.filter;
  const modeParam = Array.isArray(sp.mode) ? sp.mode[0] : sp.mode;
  const view = parsePlayerPageView(viewParam);
  const statMode = parsePlayerStatMode(statParam);
  const gameLogMode = parseGameLogTableMode(modeParam);
  const gamesPage = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);
  const filter = filterParam ?? "ALL";
  const { fromHistory, themeMode, applyEraTheme } =
    parseDestinationHistoryArrival(sp);

  const [player, career] = await Promise.all([
    getPlayerCached(playerId),
    getPlayerCareerSeasons(playerId),
  ]);
  const historyCareer = getHistoryCareerForPlayer(playerId);
  const historySeasons = getHistorySeasonsForPlayer(playerId);
  const { getMasterPlayer, getUniverseSeasonsForPlayer } = await import(
    "@/data/history/player-universe"
  );
  const masterPlayer = getMasterPlayer(playerId);
  const universeSeasons =
    historySeasons.length > 0
      ? historySeasons
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
  const season = resolvePlayerSeason(career, seasonParam, historySeasonIds);
  const seasonOptions = [
    ...new Set([...career.map((row) => row.season), ...historySeasonIds]),
  ].sort((a, b) => b.localeCompare(a));
  const seasonTeams = buildSeasonTeamsMap(career);
  const seasonTeamCtx = resolveSelectedSeasonTeamContext(career, season);
  const primaryTeam = seasonTeamCtx.row;
  const isMultiTeamRow = seasonTeamCtx.kind === "MULTI_TEAM_AGGREGATE";
  const teamKey = seasonTeamCtx.brandTeamKey;
  const teamLabel = isMultiTeamRow
    ? multiTeamDisplayLabel(primaryTeam)
    : seasonTeamCtx.displayLabel ??
      (primaryTeam && !brandableTeamKey(primaryTeam.teamId)
        ? "Team unavailable"
        : null);
  const useHistoricalBranding = applyEraTheme && themeMode !== "modern";
  const historicalBrand =
    useHistoricalBranding && teamKey
      ? resolveHistoricalTeamBrand(teamKey, season, "era")
      : null;

  const careerDataGuard = assessProductionProviderGuard({
    providerName: getDataProvider().name,
    playerId,
    careerRowCount: career.length,
  });

  const displayName =
    player?.fullName ??
    career[0]?.playerName ??
    historyCareer?.playerName ??
    masterPlayer?.displayName ??
    playerId;
  const careerResume = computeCareerResume({
    playerId,
    playerName: displayName,
    career,
    viewingSeason: season,
  });

  const bioBits = [
    player?.jersey ? `#${player.jersey}` : null,
    primaryTeam?.position ?? player?.position,
    historicalBrand?.displayName ?? teamLabel,
    season,
  ].filter(Boolean) as string[];

  const detailBits = [
    player?.heightInches
      ? `${Math.floor(player.heightInches / 12)}'${player.heightInches % 12}"`
      : null,
    player?.weightLbs ? `${player.weightLbs} lb` : null,
    player?.age != null ? `Age ${player.age}` : null,
    player?.birthDate ? `Born ${player.birthDate}` : null,
    player?.birthPlace ?? null,
    player?.college ? `College: ${player.college}` : null,
    player?.draftInfo ? `Draft: ${player.draftInfo}` : null,
    player?.experience ?? null,
  ].filter(Boolean) as string[];

  const backHref = fromHistory
    ? historyHref({
        season,
        theme: themeMode === "modern" ? "modern" : undefined,
      })
    : "/explore/players";

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
  });

  const careerSeasonsForTable =
    historySeasons.length > 0 ? historySeasons : universeSeasons;

  const body = (
    <DestinationClientShell className="site-shell flex flex-1 flex-col gap-4 py-5 sm:gap-5 sm:py-7">
      <main className="flex flex-1 flex-col gap-4 sm:gap-5">
        <PlayerDestinationIdentity
          playerId={playerId}
          displayName={displayName}
          season={season}
          teamKey={teamKey}
          teamName={teamLabel}
          historicalBrand={historicalBrand}
          useHistoricalBranding={useHistoricalBranding}
          bioBits={bioBits}
          detailBits={detailBits}
          seasonOptions={seasonOptions}
          seasonTeams={seasonTeams}
          fromHistory={fromHistory}
          themeMode={themeMode}
          backHref={backHref}
          portraitUrl={portraitUrl}
        >
          <PlayerCareerDataGuardBanner guard={careerDataGuard} />
          <PlayerDepthNav
            playerId={playerId}
            season={season}
            view={view}
            caps={caps}
            fromHistory={fromHistory}
            themeMode={themeMode === "modern" ? "modern" : "historical"}
          />
        </PlayerDestinationIdentity>

        {view === "overview" ? (
          <>
            <Suspense
              fallback={
                <DestinationSectionSkeleton label="Loading season analysis…" />
              }
            >
              <PlayerCoreIsland
                playerId={playerId}
                displayName={displayName}
                season={season}
                career={career}
                seasonOptions={seasonOptions}
                seasonTeams={seasonTeams}
                careerDataGuardSilentEmpty={
                  careerDataGuard.isSilentEmptyCareerRisk
                }
                identityTeamKey={teamKey}
                useHistoricalBranding={useHistoricalBranding}
                fromHistory={fromHistory}
                themeMode={themeMode}
              />
            </Suspense>

            <Suspense
              fallback={
                <DestinationSectionSkeleton label="Loading game log…" />
              }
            >
              <PlayerGamesIsland
                playerId={playerId}
                season={season}
                career={career}
                seasonOptions={seasonOptions}
                seasonTeams={seasonTeams}
                identityTeamKey={teamKey}
                useHistoricalBranding={useHistoricalBranding}
                fromHistory={fromHistory}
                themeMode={themeMode}
              />
            </Suspense>
          </>
        ) : null}

        <Suspense
          fallback={
            <DestinationSectionSkeleton label="Loading player statistics…" />
          }
        >
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
              historyCareer?.firstSeason ?? masterPlayer?.firstSeason
            }
            fromHistory={fromHistory}
            themeMode={themeMode === "modern" ? "modern" : "historical"}
          />
        </Suspense>

        {view === "overview" && historyCareer && historySeasons.length > 0 ? (
          <HistoricalCareerSurface
            career={historyCareer}
            seasons={historySeasons}
            playerId={playerId}
            viewingSeason={season}
          />
        ) : null}

        <section
          id="ask"
          className="scroll-mt-16 flex flex-col gap-3"
          aria-label="Ask DRBL"
        >
          <div>
            <h2 className="text-[17px] font-bold tracking-tight">Ask DRBL</h2>
            <p className="text-[13px] text-muted-foreground">
              Prefill supported queries — no custom player NLP on this page.
            </p>
          </div>
          <TeamWashCard teamKey={teamKey} className="p-4 sm:p-5">
            <PlayerAskLinks
              playerId={playerId}
              playerName={displayName}
              season={season}
              peakSeason={careerResume.peak?.season}
            />
          </TeamWashCard>
        </section>
      </main>
    </DestinationClientShell>
  );

  if (!eraTheme) return body;
  return <EraThemeScope theme={eraTheme}>{body}</EraThemeScope>;
}
