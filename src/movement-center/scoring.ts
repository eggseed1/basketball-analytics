import type {
  MovementClaim,
  MovementEvidenceClass,
  MovementEvidenceScore,
  MovementStoryCluster,
} from "@/movement-center/types";

export const EVIDENCE_SCORE_METHODOLOGY = "movement-m1-0.1";

type SourceTier = { label: string; credibility: number };

type ScoringClaim = MovementClaim & {
  negotiationSpecificity?: "contact" | "framework" | "active_talks" | "offer";
};

function hoursSince(iso: string, now: Date): number {
  return (now.getTime() - new Date(iso).getTime()) / (1000 * 60 * 60);
}

function recencyPoints(hours: number, inSeason: boolean): number {
  const halfLife = inSeason ? 72 : 168;
  const raw = 15 * Math.pow(0.5, hours / halfLife);
  return Math.max(0, Math.round(raw * 10) / 10);
}

function entitySpecificityPoints(claim: ScoringClaim): number {
  const hasPlayer = claim.playerIds.length > 0;
  const hasTeam = claim.teamIds.length > 0;
  if (hasPlayer && hasTeam) return 10;
  if (hasPlayer || hasTeam) return 5;
  return 0;
}

function negotiationPoints(claim: ScoringClaim): number {
  switch (claim.negotiationSpecificity) {
    case "offer":
      return 10;
    case "active_talks":
      return 8;
    case "framework":
      return 6;
    case "contact":
      return 4;
    default:
      return 0;
  }
}

function directnessPoints(claim: ScoringClaim): number {
  if (claim.provenanceKind === "hypothetical_analysis") return 2;
  if (claim.provenanceKind === "community_speculation") return 1;
  if (claim.provenanceKind === "aggregation") return 6;
  if (claim.provenanceKind === "cites_report") return 10;
  if (claim.provenanceKind === "original_report") return 18;
  if (claim.provenanceKind === "official_statement") return 14;
  return 8;
}

/** Score a cluster from its claims — evidence strength, not P(movement). */
export function scoreMovementCluster(
  cluster: MovementStoryCluster,
  claims: MovementClaim[],
  sources: Record<string, SourceTier>,
  now = new Date()
): MovementEvidenceScore {
  const originals = claims.filter(
    (c) => c.isOriginal && !c.citesClaimId && c.provenanceKind === "original_report"
  );
  const uniqueOriginalSources = new Set(originals.map((c) => c.sourceId));
  const corroboration = Math.min(20, uniqueOriginalSources.size * 5);

  let sourceCredibility = 0;
  let reportDirectness = 0;
  let entitySpecificity = 0;
  let negotiationSpecificity = 0;
  let recency = 0;
  let repetitionPenalty = 0;
  let denialCounterevidence = 0;
  let hypotheticalPenalty = 0;

  for (const claim of claims) {
    const tier = sources[claim.sourceId]?.credibility ?? 5;
    sourceCredibility = Math.max(sourceCredibility, tier);
    reportDirectness = Math.max(reportDirectness, directnessPoints(claim));
    entitySpecificity = Math.max(
      entitySpecificity,
      entitySpecificityPoints(claim as ScoringClaim)
    );
    negotiationSpecificity = Math.max(
      negotiationSpecificity,
      negotiationPoints(claim as ScoringClaim)
    );
    recency = Math.max(recency, recencyPoints(hoursSince(claim.publishedAt, now), true));

    if (
      claim.provenanceKind === "aggregation" ||
      claim.provenanceKind === "cites_report"
    ) {
      repetitionPenalty += 5;
    }
    if (claim.state === "denied") {
      denialCounterevidence += 8;
    }
    if (
      claim.evidenceClass === "speculative" ||
      claim.provenanceKind === "hypothetical_analysis"
    ) {
      hypotheticalPenalty += 12;
    }
  }

  repetitionPenalty = Math.min(20, repetitionPenalty);
  denialCounterevidence = Math.min(16, denialCounterevidence);
  hypotheticalPenalty = Math.min(25, hypotheticalPenalty);

  let total = Math.round(
    sourceCredibility +
      reportDirectness +
      corroboration +
      recency +
      entitySpecificity +
      negotiationSpecificity -
      repetitionPenalty -
      denialCounterevidence -
      hypotheticalPenalty
  );

  if (cluster.evidenceClass === "speculative") {
    total = Math.min(total, 25);
  }

  total = Math.max(0, Math.min(100, total));

  return {
    total,
    components: {
      sourceCredibility: Math.round(sourceCredibility),
      reportDirectness: Math.round(reportDirectness),
      independentCorroboration: corroboration,
      recency: Math.round(recency),
      entitySpecificity: Math.round(entitySpecificity),
      negotiationSpecificity: Math.round(negotiationSpecificity),
      hypotheticalPenalty: -Math.round(hypotheticalPenalty),
      repetitionPenalty: -Math.round(repetitionPenalty),
      denialCounterevidence: -Math.round(denialCounterevidence),
    },
    methodologyVersion: EVIDENCE_SCORE_METHODOLOGY,
    computedAt: now.toISOString(),
  };
}

export function evidenceClassLabel(c: MovementEvidenceClass): string {
  switch (c) {
    case "reported":
      return "Reported";
    case "rumored":
      return "Rumored";
    case "speculative":
      return "Speculative";
  }
}

export function activityFromScore(
  score: number,
  clusterCount: number
): "low" | "moderate" | "high" {
  if (clusterCount >= 2 && score >= 55) return "high";
  if (clusterCount >= 1 && score >= 35) return "moderate";
  return "low";
}
