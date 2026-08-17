import { TeamSeasonEvidenceProfileSection } from "@/components/teams/team-season-evidence-profile";
import { SEASON_EVIDENCE_METHODOLOGY } from "@/analytics/season-evidence";
import type { TeamSeasonEvidence } from "@/analytics/season-evidence";
import { getTeamSeasonEvidence } from "@/data/queries";

export async function TeamEvidenceIsland({
  teamId,
  season,
  abbreviation,
  fullName,
}: {
  teamId: string;
  season: string;
  abbreviation: string;
  fullName: string;
}) {
  const seasonEvidence = await getTeamSeasonEvidence({
    teamId,
    season,
    abbreviation,
    fullName,
  }).catch(
    (): TeamSeasonEvidence => ({
      subject: {
        kind: "team",
        teamId,
        abbreviation,
        fullName,
        matchTeamIds: [],
        matchAbbrs: [abbreviation],
      },
      season,
      findings: [],
      games: [],
      methodology: SEASON_EVIDENCE_METHODOLOGY,
      coverage: {
        gameCount: 0,
        categories: [],
        unsupported: [],
      },
      error: "Season evidence temporarily unavailable.",
    })
  );

  return <TeamSeasonEvidenceProfileSection evidence={seasonEvidence} />;
}
