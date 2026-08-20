import { Suspense } from "react";
import { notFound } from "next/navigation";

import { PageAtmosphere } from "@/components/brand/page-atmosphere";
import { DestinationClientShell } from "@/components/continuity/destination-client-shell";
import { DestinationSectionSkeleton } from "@/components/continuity/destination-loading-frame";
import { PlayerCareerDataGuardBanner } from "@/components/players/player-career-data-guard-banner";
import { PlayerCareerIsland } from "@/components/players/player-career-island";
import { PlayerDestinationIdentity } from "@/components/players/player-destination-identity";
import { PlayerGamesIsland } from "@/components/players/player-games-island";
import { PlayerPercentileIsland } from "@/components/players/player-percentile-island";
import { PlayerStatsIsland } from "@/components/players/player-stats-island";
import { PlayerVisualizationsIsland } from "@/components/players/player-visualizations";
import { EraThemeScope } from "@/components/time-machine/era-theme-scope";
import { assessProductionProviderGuard } from "@/data/diagnostics/production-provider-guard";
import { getDataProvider } from "@/data/providers";
import { getPlayerCareerSeasons } from "@/data/queries";
import { getPlayerCached } from "@/data/queries/request-cache";
import { resolveHistoricalTeamBrand } from "@/lib/historical-team-brand";
import { resolveTeamBrand } from "@/lib/nba-brand";
import { brandAtmosphereColors } from "@/lib/game-matchup-theme";
import { resolvePlayerIdentity } from "@/data/identity/player-identity";
import {
  buildSeasonTeamsMap,
  parsePlayerDepthTab,
  parsePlayerSeasonKind,
  primaryTeamForSeason,
  resolvePlayerSeason,
} from "@/lib/player-destination";
import {
  brandableTeamKey,
  cardStintsForSeason,
  lastCardStint,
  multiTeamDisplayLabel,
  resolveSelectedSeasonTeamContext,
} from "@/lib/player-team-context";
import { resolveActiveEraTheme } from "@/themes/era-theme";
import {
  parseDestinationHistoryArrival,
} from "@/themes/history-url";

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
 * Progressive player destination:
 * Layer 1 identity (player + career) outside Suspense
 * Layer 2 depth (career / game logs / visualizations) in Suspense
 */
export default async function PlayerPage({
  params,
  searchParams,
}: PlayerPageProps) {
  const { playerId } = await params;
  const sp = await searchParams;
  const seasonParam = one(sp, "season");
  const depth = parsePlayerDepthTab(one(sp, "depth"));
  const seasonType = parsePlayerSeasonKind(one(sp, "seasonType"));
  const compareSeason = one(sp, "compare");
  const { fromHistory, themeMode, applyEraTheme } =
    parseDestinationHistoryArrival(sp);

  const [player, career, identity] = await Promise.all([
    getPlayerCached(playerId),
    getPlayerCareerSeasons(playerId),
    resolvePlayerIdentity(playerId),
  ]);

  if (!player && career.length === 0) notFound();

  const season = resolvePlayerSeason(career, seasonParam);
  const seasonOptions = [
    ...new Set(career.map((row) => row.season)),
  ].sort((a, b) => b.localeCompare(a));
  const seasonTeams = buildSeasonTeamsMap(career);
  const seasonTeamCtx = resolveSelectedSeasonTeamContext(career, season);
  const primaryTeam = seasonTeamCtx.row;
  const isMultiTeamRow = seasonTeamCtx.kind === "MULTI_TEAM_AGGREGATE";
  const seasonStints = cardStintsForSeason(career, season);
  const lastStint = lastCardStint(seasonStints);
  // Multi-team seasons still disclose every stop, but brand as the last club.
  const teamKey = lastStint?.teamKey ?? seasonTeamCtx.brandTeamKey;
  const teamLabel = lastStint
    ? lastStint.teamLabel
    : isMultiTeamRow
      ? multiTeamDisplayLabel(primaryTeam)
      : seasonTeamCtx.displayLabel ??
        (primaryTeam && !brandableTeamKey(primaryTeam.teamId)
          ? "Team unavailable"
          : null);
  const useHistoricalBranding =
    applyEraTheme && themeMode !== "modern";
  const historicalBrand =
    useHistoricalBranding && teamKey
      ? resolveHistoricalTeamBrand(teamKey, season, "era")
      : null;

  const careerDataGuard = assessProductionProviderGuard({
    providerName: getDataProvider().name,
    playerId,
    careerRowCount: career.length,
  });

  const displayName = player?.fullName ?? career[0]?.playerName ?? playerId;
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

  const eraTheme = applyEraTheme
    ? resolveActiveEraTheme(season, themeMode)
    : null;

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
          heightLabel={heightLabel}
          weightLabel={weightLabel}
          birthDate={player?.birthDate ?? null}
          draftInfo={player?.draftInfo ?? null}
          college={player?.college ?? null}
          historicalBrand={historicalBrand}
          useHistoricalBranding={useHistoricalBranding}
          seasonOptions={seasonOptions}
          recentSeasons={recentSeasons}
          fromHistory={fromHistory}
          themeMode={themeMode}
          depth={depth}
          seasonType={seasonType}
          compareSeason={compareSeason}
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
              />
            </Suspense>
          }
        >
          <PlayerCareerDataGuardBanner guard={careerDataGuard} />
        </PlayerDestinationIdentity>

        {depth === "career" ? (
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
              compareSeason={compareSeason}
              teamKey={teamKey}
              fromHistory={fromHistory}
              themeMode={themeMode}
            />
          </Suspense>
        ) : null}

        {depth === "stats" ? (
          <Suspense
            fallback={
              <DestinationSectionSkeleton label="Loading statistics…" />
            }
          >
            <PlayerStatsIsland
              playerId={playerId}
              season={season}
              seasonType={seasonType}
              career={career}
              teamKey={teamKey}
            />
          </Suspense>
        ) : null}

        {depth === "games" ? (
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

        {depth === "viz" ? (
          <Suspense
            fallback={
              <DestinationSectionSkeleton label="Loading visualizations…" />
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
            />
          </Suspense>
        ) : null}
      </main>
    </DestinationClientShell>
  );

  if (!eraTheme) return body;
  return <EraThemeScope theme={eraTheme}>{body}</EraThemeScope>;
}
