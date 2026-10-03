/**
 * Turn stored publisher headlines into movement claims and story clusters.
 * Pure: callers pass the rows, a title entity resolver and display names, so
 * the same code can run in the build script or a scheduled Worker.
 */

import {
  classifyMovementHeadline,
  type MovementFamily,
} from "@/movement-center/classify-headline";
import {
  outletSourceId,
  outletTier,
  reporterSourceId,
  reporterTier,
  type MovementSourceTier,
  type ReporterMention,
} from "@/movement-center/reporters";
import type {
  MovementClaim,
  MovementClaimType,
  MovementStoryCluster,
} from "@/movement-center/types";

export type MovementNewsRow = {
  id: string;
  url: string;
  title: string;
  outlet: string;
  publishedAt: string;
  reporters?: ReporterMention[];
};

export type TitleEntities = { playerIds: string[]; teamIds: string[] };

export type NewsClusterContext = {
  resolveTitle: (title: string) => TitleEntities;
  playerName: (playerId: string) => string | undefined;
  teamName: (teamId: string) => string | undefined;
};

export type NewsClusterResult = {
  claims: MovementClaim[];
  clusters: MovementStoryCluster[];
  families: Map<string, MovementFamily>;
  sources: Record<string, MovementSourceTier>;
  skipped: number;
};

/** A story stays open while reports keep arriving within this many days. */
export const CLUSTER_WINDOW_DAYS = 45;
const MAX_PLAYERS_PER_CLAIM = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

const DIRECTNESS: Record<MovementClaim["provenanceKind"], number> = {
  original_report: 5,
  official_statement: 4,
  completed_transaction: 6,
  cites_report: 3,
  aggregation: 2,
  commentary: 1,
  hypothetical_analysis: 0,
  community_speculation: 0,
};

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names[0]}, ${names[1]} and others`;
}

function storyLabel(
  type: MovementClaimType,
  agreed: boolean,
  negotiating: boolean,
  team?: string
): string {
  const withTeam = (label: string) => (team ? `${label} with the ${team}` : label);
  switch (type) {
    case "extension_talks":
      if (agreed) return withTeam("reported extension");
      return withTeam(negotiating ? "extension talks" : "contract future");
    case "trade_request":
      return "trade request";
    case "trade_interest":
      return agreed ? "reported trade agreement" : "trade talk";
    case "free_agent_interest":
      return "free agency";
    default:
      return withTeam(negotiating ? "contract talks" : "contract future");
  }
}

function sourceFor(
  row: MovementNewsRow,
  provenance: MovementClaim["provenanceKind"]
): { id: string; tier: MovementSourceTier; label: string; reporterLabel?: string } {
  const reporter = row.reporters?.[0];
  if (reporter) {
    const tier = reporterTier(reporter);
    const sameOutlet = reporter.outlet === row.outlet;
    return {
      id: reporterSourceId(reporter),
      tier,
      label: sameOutlet ? tier.label : `${row.outlet}, citing ${tier.label}`,
      reporterLabel: row.reporters!.map((r) => r.name).join(", "),
    };
  }
  const ownSources = provenance === "original_report" || provenance === "official_statement";
  const tier = outletTier(row.outlet, ownSources ? "own_sources" : "relayed");
  return { id: outletSourceId(row.outlet), tier, label: row.outlet };
}

type OpenCluster = {
  cluster: MovementStoryCluster;
  family: MovementFamily;
  claims: MovementClaim[];
};

function intersects(a: string[], b: string[]): boolean {
  return a.some((id) => b.includes(id));
}

function finalizeCluster(open: OpenCluster, ctx: NewsClusterContext): void {
  const { cluster, claims } = open;
  const sorted = [...claims].sort((a, b) => a.publishedAt.localeCompare(b.publishedAt));
  const primary = [...claims].sort(
    (a, b) =>
      DIRECTNESS[b.provenanceKind] - DIRECTNESS[a.provenanceKind] ||
      b.publishedAt.localeCompare(a.publishedAt)
  )[0]!;
  const latest = sorted.at(-1)!;
  const names = cluster.linkedPlayerIds
    .map((id) => ctx.playerName(id))
    .filter((n): n is string => Boolean(n));
  const team = latest.teamIds.length === 1 ? ctx.teamName(latest.teamIds[0]!) : undefined;
  const agreed = /\bagree(s|d)?\b|\bagreement\b/i.test(latest.summary);
  const negotiating = claims.some(
    (c) => c.negotiationSpecificity && c.negotiationSpecificity !== "contact"
  );

  cluster.primaryClaimId = primary.id;
  cluster.claimIds = sorted.map((c) => c.id);
  cluster.firstSeenAt = sorted[0]!.publishedAt;
  cluster.lastMeaningfulAt = latest.publishedAt;
  cluster.evidenceClass = claims.some((c) => c.evidenceClass === "reported") ? "reported" : "rumored";
  cluster.state = latest.state === "denied" ? "denied" : "unresolved";
  cluster.headline = `${joinNames(names)}: ${storyLabel(latest.claimType, agreed, negotiating, team)}`;
}

export function buildNewsClusters(
  rows: MovementNewsRow[],
  ctx: NewsClusterContext
): NewsClusterResult {
  const sources: Record<string, MovementSourceTier> = {};
  const claims: MovementClaim[] = [];
  const open: OpenCluster[] = [];
  let skipped = 0;

  const ordered = [...rows].sort((a, b) => a.publishedAt.localeCompare(b.publishedAt));
  const seenTitles = new Set<string>();

  for (const row of ordered) {
    const titleKey = row.title.toLowerCase().replace(/\W+/g, " ").trim();
    if (seenTitles.has(titleKey)) continue;
    seenTitles.add(titleKey);

    const verdict = classifyMovementHeadline(row);
    if (!verdict) {
      skipped += 1;
      continue;
    }
    const entities = ctx.resolveTitle(row.title);
    if (!entities.playerIds.length || entities.playerIds.length > MAX_PLAYERS_PER_CLAIM) {
      skipped += 1;
      continue;
    }

    const source = sourceFor(row, verdict.provenanceKind);
    sources[source.id] = source.tier;

    const claim: MovementClaim = {
      id: `mv-${row.id}`,
      clusterId: "",
      summary: row.title,
      claimType: verdict.claimType,
      evidenceClass: verdict.evidenceClass,
      state: verdict.denial ? "denied" : "unresolved",
      provenanceKind: verdict.provenanceKind,
      publishedAt: row.publishedAt,
      sourceId: source.id,
      sourceLabel: source.label,
      reporterLabel: source.reporterLabel,
      sourceUrl: row.url,
      playerIds: entities.playerIds,
      teamIds: entities.teamIds,
      isOriginal:
        verdict.provenanceKind === "original_report" ||
        verdict.provenanceKind === "official_statement",
      negotiationSpecificity: verdict.negotiationSpecificity,
    };

    const at = new Date(row.publishedAt).getTime();
    const home = open
      .filter(
        (o) =>
          o.family === verdict.family &&
          intersects(o.cluster.linkedPlayerIds, claim.playerIds) &&
          at - new Date(o.cluster.lastMeaningfulAt).getTime() <= CLUSTER_WINDOW_DAYS * DAY_MS
      )
      .sort((a, b) => b.cluster.lastMeaningfulAt.localeCompare(a.cluster.lastMeaningfulAt))[0];

    if (home) {
      claim.clusterId = home.cluster.id;
      home.claims.push(claim);
      home.cluster.lastMeaningfulAt = claim.publishedAt;
      home.cluster.linkedPlayerIds = [...new Set([...home.cluster.linkedPlayerIds, ...claim.playerIds])];
      home.cluster.linkedTeamIds = [...new Set([...home.cluster.linkedTeamIds, ...claim.teamIds])];
    } else {
      const id = `mv-${verdict.family}-${claim.playerIds[0]}-${row.publishedAt.slice(0, 10).replace(/-/g, "")}`;
      claim.clusterId = id;
      open.push({
        family: verdict.family,
        claims: [claim],
        cluster: {
          id,
          headline: "",
          primaryClaimId: claim.id,
          claimIds: [claim.id],
          evidenceClass: claim.evidenceClass,
          state: "unresolved",
          firstSeenAt: claim.publishedAt,
          lastMeaningfulAt: claim.publishedAt,
          linkedPlayerIds: [...claim.playerIds],
          linkedTeamIds: [...claim.teamIds],
        },
      });
    }
    claims.push(claim);
  }

  const families = new Map<string, MovementFamily>();
  for (const o of open) {
    finalizeCluster(o, ctx);
    families.set(o.cluster.id, o.family);
  }

  return {
    claims,
    clusters: open.map((o) => o.cluster),
    families,
    sources,
    skipped,
  };
}
