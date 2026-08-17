import { Suspense } from "react";
import { notFound } from "next/navigation";

import { computeCareerResume } from "@/analytics";
import { TeamWashCard } from "@/components/brand/team-wash-card";
import { DestinationClientShell } from "@/components/continuity/destination-client-shell";
import { DestinationSectionSkeleton } from "@/components/continuity/destination-loading-frame";
import { PlayerAskLinks } from "@/components/players/player-ask-links";
import { PlayerCareerDataGuardBanner } from "@/components/players/player-career-data-guard-banner";
import { PlayerCoreIsland } from "@/components/players/player-core-island";
import { PlayerDestinationIdentity } from "@/components/players/player-destination-identity";
import { PlayerGamesIsland } from "@/components/players/player-games-island";
import { PlayerPageNav } from "@/components/players/player-page-nav";
import { EraThemeScope } from "@/components/time-machine/era-theme-scope";
import { assessProductionProviderGuard } from "@/data/diagnostics/production-provider-guard";
import { getDataProvider } from "@/data/providers";
import { getPlayerCareerSeasons } from "@/data/queries";
import { getPlayerCached } from "@/data/queries/request-cache";
import { resolveHistoricalTeamBrand } from "@/lib/historical-team-brand";
import {
  buildSeasonTeamsMap,
  primaryTeamForSeason,
  resolvePlayerSeason,
} from "@/lib/player-destination";
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
 * Layer 1 identity (player + career) outside Suspense
 * Layer 2 core season / analytics in Suspense
 * Layer 3 games in separate Suspense
 */
export default async function PlayerPage({
  params,
  searchParams,
}: PlayerPageProps) {
  const { playerId } = await params;
  const sp = await searchParams;
  const seasonParam = Array.isArray(sp.season) ? sp.season[0] : sp.season;
  const { fromHistory, themeMode, applyEraTheme } =
    parseDestinationHistoryArrival(sp);

  const [player, career] = await Promise.all([
    getPlayerCached(playerId),
    getPlayerCareerSeasons(playerId),
  ]);

  if (!player && career.length === 0) notFound();

  const season = resolvePlayerSeason(career, seasonParam);
  const seasonOptions = [
    ...new Set(career.map((row) => row.season)),
  ].sort((a, b) => b.localeCompare(a));
  const seasonTeams = buildSeasonTeamsMap(career);
  const primaryTeam = primaryTeamForSeason(career, season);
  const teamKey = primaryTeam?.teamId;
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
  const careerResume = computeCareerResume({
    playerId,
    playerName: displayName,
    career,
    viewingSeason: season,
  });

  const bioBits = [
    player?.jersey ? `#${player.jersey}` : null,
    primaryTeam?.position ?? player?.position,
    historicalBrand?.displayName ?? primaryTeam?.teamName,
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

  const eraTheme = applyEraTheme
    ? resolveActiveEraTheme(season, themeMode)
    : null;

  const body = (
    <DestinationClientShell className="site-shell flex flex-1 flex-col gap-4 py-5 sm:gap-5 sm:py-7">
      <main className="flex flex-1 flex-col gap-4 sm:gap-5">
        <PlayerDestinationIdentity
          playerId={playerId}
          displayName={displayName}
          season={season}
          teamKey={teamKey}
          historicalBrand={historicalBrand}
          useHistoricalBranding={useHistoricalBranding}
          bioBits={bioBits}
          detailBits={detailBits}
          seasonOptions={seasonOptions}
          seasonTeams={seasonTeams}
          fromHistory={fromHistory}
          themeMode={themeMode}
          backHref={backHref}
        >
          <PlayerPageNav />
          <PlayerCareerDataGuardBanner guard={careerDataGuard} />
        </PlayerDestinationIdentity>

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
