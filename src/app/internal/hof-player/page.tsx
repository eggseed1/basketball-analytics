import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { PageAtmosphere } from "@/components/brand/page-atmosphere";
import { DestinationClientShell } from "@/components/continuity/destination-client-shell";
import { DestinationSectionSkeleton } from "@/components/continuity/destination-loading-frame";
import { PlayerAccoladesIsland } from "@/components/players/player-accolades-island";
import { PlayerContractTransactionsIsland } from "@/components/players/player-contract-transactions-island";
import { PlayerDestinationIdentity } from "@/components/players/player-destination-identity";
import { PlayerPercentileIsland } from "@/components/players/player-percentile-island";
import { PlayerStatsIsland } from "@/components/players/player-stats-island";
import { getPlayerPortraitUrl } from "@/data/media/get-player-media";
import { resolvePlayerIdentityCached } from "@/data/identity/player-identity-cache";
import { getPlayerCareerSeasonsCached, getPlayerCached } from "@/data/queries/request-cache";
import { brandAtmosphereColors } from "@/lib/game-matchup-theme";
import { HOF_PAGE_FRAME_CLASS } from "@/lib/hall-of-fame-style";
import { firstUsablePlayerDisplayName } from "@/lib/player-display-name";
import {
  buildSeasonTeamsMap,
  primaryTeamForSeason,
  resolvePlayerSeason,
} from "@/lib/player-destination";
import { playerPageCapabilities } from "@/lib/player-page-contract";
import {
  cardStintsForSeason,
  lastCardStint,
  resolveSelectedSeasonTeamContext,
} from "@/lib/player-team-context";
import { resolveTeamBrand } from "@/lib/nba-brand";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

/** Michael Jordan — default HOF example subject. */
const DEFAULT_HOF_PLAYER_ID = "893";

export const metadata: Metadata = {
  title: "Hall of Fame player example",
  robots: { index: false, follow: false, nocache: true },
};

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function one(
  sp: Record<string, string | string[] | undefined>,
  key: string
): string | undefined {
  const v = sp[key];
  return Array.isArray(v) ? v[0] : v;
}

/**
 * Internal prototype — golden outline on identity + stat surfaces for HOF players.
 * Visit /internal/hof-player or /internal/hof-player?player=893
 */
export default async function HofPlayerExamplePage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const playerId = one(sp, "player") ?? DEFAULT_HOF_PLAYER_ID;
  const seasonParam = one(sp, "season");

  const [player, career, identity] = await Promise.all([
    getPlayerCached(playerId),
    getPlayerCareerSeasonsCached(playerId),
    resolvePlayerIdentityCached(playerId),
  ]);

  if (!player && career.length === 0) notFound();

  /** Internal HOF demo — outline always on; accolades stream in via Suspense. */
  const honor = "hof" as const;

  const seasonOptions = [...new Set(career.map((row) => row.season))].sort(
    (a, b) => b.localeCompare(a)
  );
  const season = resolvePlayerSeason(career, seasonParam, seasonOptions, {
    preferPeakWhenHistorical: true,
  });
  const seasonTeams = buildSeasonTeamsMap(career);
  const seasonTeamCtx = resolveSelectedSeasonTeamContext(career, season);
  const primaryTeam = seasonTeamCtx.row;
  const seasonStints = cardStintsForSeason(career, season);
  const teamKey = lastCardStint(seasonStints)?.teamKey ?? seasonTeamCtx.brandTeamKey;
  const teamLabel =
    lastCardStint(seasonStints)?.teamLabel ?? seasonTeamCtx.displayLabel;
  const displayName =
    firstUsablePlayerDisplayName(
      identity.displayName,
      player?.fullName,
      [...career].sort((a, b) => b.season.localeCompare(a.season))[0]
        ?.playerName
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
  const atmosphere = brandAtmosphereColors(
    resolveTeamBrand(teamKey)?.primary,
    resolveTeamBrand(teamKey)?.secondary
  );
  const caps = playerPageCapabilities({
    selectedSeason: season,
    careerFirstSeason: seasonOptions.at(-1),
  });

  return (
    <DestinationClientShell className="site-shell flex flex-1 flex-col gap-4 py-5 sm:gap-5 sm:py-7">
      <PageAtmosphere
        colorA={atmosphere?.colorA}
        colorB={atmosphere?.colorB}
      />
      <main className="relative z-[1] flex flex-1 flex-col gap-4 sm:gap-5">
        <p className={cn(type.caption, "font-semibold uppercase tracking-wide text-muted-foreground")}>
          Internal example · Hall of Fame golden outline
        </p>

        <div className={HOF_PAGE_FRAME_CLASS}>
          <div className="hof-page-frame__inner flex flex-col gap-4 p-3 sm:gap-5 sm:p-4">
            <PlayerDestinationIdentity
              playerId={playerId}
              espnId={identity.espnId}
              nbaId={identity.nbaId}
              displayName={displayName}
              season={season}
              teamKey={teamKey}
              teamName={teamLabel}
              position={bioPosition}
              seasonStints={seasonStintsWithPosition}
              heightLabel={heightLabel}
              weightLabel={weightLabel}
              birthDate={player?.birthDate ?? null}
              draftInfo={player?.draftInfo ?? null}
              college={player?.college ?? null}
              portraitUrl={portraitUrl}
              seasonOptions={seasonOptions}
              recentSeasons={recentSeasons}
              view="overview"
              caps={caps}
              honor={honor}
              accolades={
                <Suspense fallback={null}>
                  <PlayerAccoladesIsland
                    playerId={playerId}
                    teamKey={teamKey}
                    honor={honor}
                  />
                </Suspense>
              }
              frontOffice={
                <Suspense fallback={null}>
                  <PlayerContractTransactionsIsland
                    playerId={playerId}
                    playerName={displayName}
                    teamKey={teamKey}
                    honor={honor}
                  />
                </Suspense>
              }
              hero={
                <Suspense
                  fallback={
                    <DestinationSectionSkeleton label="Loading percentile ranking…" />
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
                    honor={honor}
                    nbaId={identity.nbaId}
                  />
                </Suspense>
              }
            />

            <Suspense
              fallback={<DestinationSectionSkeleton label="Loading statistics…" />}
            >
              <PlayerStatsIsland
                playerId={playerId}
                season={season}
                seasonType="regular"
                career={career}
                teamKey={teamKey}
                honor={honor}
              />
            </Suspense>
          </div>
        </div>
      </main>
    </DestinationClientShell>
  );
}
