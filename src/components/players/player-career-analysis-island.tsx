import {
  computeCareerResume,
  dedupeCareerSeasons,
} from "@/analytics";
import { GlassSurface } from "@/components/brand/glass-surface";
import { TeamLogo } from "@/components/brand/team-logo";
import { PlayerCareerResumeLazy as PlayerCareerResume } from "@/components/charts/recharts-lazy";
import { PlayerSeasonSideCompare } from "@/components/players/player-season-side-compare";
import type { PlayerSeason } from "@/data/types";
import {
  brandableTeamKey,
  brandableTeamKeyFromRow,
} from "@/lib/player-team-context";
import { brandAtmosphereColors } from "@/lib/game-matchup-theme";
import { resolveTeamBrand, teamBrandBarColor } from "@/lib/nba-brand";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

/**
 * Career-tab analysis: Peak / Prime / Longevity resume + inline season compare.
 */
export async function PlayerCareerAnalysisIsland({
  playerId: _playerId,
  displayName,
  season,
  career,
  teamKey,
}: {
  playerId: string;
  displayName: string;
  season: string;
  career: PlayerSeason[];
  teamKey?: string | null;
}) {
  const careerDeduped = dedupeCareerSeasons(career);

  const careerResume = computeCareerResume({
    playerId: _playerId,
    playerName: displayName,
    career: careerDeduped,
    viewingSeason: season,
  });

  const seasonStats =
    careerDeduped.find((row) => row.season === season) ?? null;

  const careerStartTeamKey = brandableTeamKey(
    [...careerDeduped].sort((a, b) => a.season.localeCompare(b.season))[0]
      ?.teamId
  );
  const analysisTeamKey =
    brandableTeamKey(teamKey) ??
    brandableTeamKeyFromRow(seasonStats) ??
    careerStartTeamKey;

  const compareB =
    careerResume.peak && careerResume.peak.season !== season
      ? careerResume.peak.season
      : careerDeduped.map((r) => r.season).find((s) => s !== season) ??
        season;

  const brand = resolveTeamBrand(analysisTeamKey);
  const wash = brandAtmosphereColors(brand?.primary, brand?.secondary);
  const peakRow = careerResume.peak
    ? careerDeduped.find((r) => r.season === careerResume.peak!.season)
    : null;
  const accentA = teamBrandBarColor(
    seasonStats?.teamId ?? analysisTeamKey
  );
  const accentB = teamBrandBarColor(
    peakRow?.teamId ??
      careerDeduped.find((r) => r.season === compareB)?.teamId ??
      analysisTeamKey
  );

  return (
    <section
      id="career-analysis"
      className="scroll-mt-16 flex flex-col gap-4"
      aria-label="Career analysis"
    >
      <PlayerCareerResume
        resume={careerResume}
        teamKey={analysisTeamKey}
        careerStartTeamKey={careerStartTeamKey}
      />

      <GlassSurface
        effect="css"
        accentColor={wash?.colorA}
        accentColorB={wash?.colorB}
        className="flex flex-col gap-4 p-4 sm:p-5"
      >
        <div className="flex items-center gap-2">
          {analysisTeamKey ? (
            <TeamLogo teamKey={analysisTeamKey} size="sm" />
          ) : null}
          <div>
            <h3
              id="career-season-explorer"
              className={cn(type.title, "scroll-mt-16 tracking-tight")}
            >
              Compare seasons
            </h3>
            <p className={cn(type.bodySm, "text-muted-foreground")}>
              Pick two seasons — bars run from center toward each side.
            </p>
          </div>
        </div>
        <PlayerSeasonSideCompare
          seasons={careerDeduped}
          defaultA={season}
          defaultB={compareB}
          accentA={accentA}
          accentB={accentB}
        />
      </GlassSurface>
    </section>
  );
}
