import Link from "next/link";

import {
  MovementEvidenceBadge,
  MovementStateBadge,
} from "@/components/movement/movement-evidence-badge";
import { TeamLogo } from "@/components/brand/team-logo";
import { AppLink } from "@/components/ui/app-link";
import { isResolvedMovementState } from "@/movement-center/cluster-state";
import {
  movementClaimOpensNewTab,
  resolveMovementClaimHref,
} from "@/movement-center/claim-source";
import type { MovementClaim, MovementEvidenceScore, MovementStoryCluster } from "@/movement-center/types";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

function formatWhen(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function ClaimTimelineRow({ claim }: { claim: MovementClaim }) {
  const href = resolveMovementClaimHref(claim);

  return (
    <li className={cn(type.caption, "text-muted-foreground")}>
      <time className="tabular-nums text-foreground">
        {formatWhen(claim.publishedAt)}
      </time>
      {" · "}
      {claim.isOriginal ? "Original" : "Derivative"} ·{" "}
      {href ? (
        <AppLink
          href={href}
          newTab={movementClaimOpensNewTab(href)}
          className="font-semibold text-foreground/90 underline-offset-2 hover:underline"
        >
          {claim.sourceLabel}
        </AppLink>
      ) : (
        <span className="font-semibold text-foreground/80">
          {claim.sourceLabel}
        </span>
      )}
      <p className="mt-0.5">{claim.summary}</p>
    </li>
  );
}

export function MovementClusterCard({
  cluster,
  claims,
  score,
  compact = false,
  href,
}: {
  cluster: MovementStoryCluster;
  claims: MovementClaim[];
  score: MovementEvidenceScore;
  compact?: boolean;
  href?: string;
}) {
  const primary =
    claims.find((c) => c.id === cluster.primaryClaimId) ?? claims[0];
  const resolved = isResolvedMovementState(cluster.state);
  const completionClaim =
    resolved
      ? claims.find((c) => c.provenanceKind === "completed_transaction") ??
        primary
      : null;
  const timeline = [...claims].sort((a, b) =>
    b.publishedAt.localeCompare(a.publishedAt)
  );

  const clusterLinkClass = href ? "block hover:opacity-95" : undefined;
  const clusterSummary = resolved && completionClaim ? (
    <p
      className={cn(
        type.caption,
        "rounded-md border border-sky-500/25 frost-surface px-2 py-1.5 text-sky-950 dark:text-sky-100"
      )}
    >
      Transaction recorded — {completionClaim.summary}
    </p>
  ) : primary ? (
    <p className={cn(type.caption, "text-muted-foreground")}>{primary.summary}</p>
  ) : null;

  return (
    <article
      className={cn(
        "flex flex-col gap-2 rounded-md border frost-surface-soft",
        compact ? "px-2.5 py-2" : "px-3 py-3",
        resolved
          ? "border-sky-500/35 bg-sky-500/[0.06]"
          : "border-border/70"
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <MovementEvidenceBadge evidenceClass={cluster.evidenceClass} />
        <MovementStateBadge state={cluster.state} />
        {!resolved ? (
          <span className={cn(type.caption, "ml-auto tabular-nums text-muted-foreground")}>
            Evidence {score.total}/100
          </span>
        ) : (
          <span className={cn(type.caption, "ml-auto font-semibold text-sky-800 dark:text-sky-200")}>
            Resolved
          </span>
        )}
      </div>
      {href ? (
        <Link href={href} className={clusterLinkClass}>
          <h3 className={cn(compact ? type.bodySm : "text-sm", "font-bold leading-snug")}>
            {cluster.headline}
          </h3>
          {clusterSummary}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {cluster.linkedTeamIds.slice(0, 4).map((teamId) => (
              <TeamLogo key={teamId} teamKey={teamId} size="xs" />
            ))}
          </div>
        </Link>
      ) : (
        <>
          <h3 className={cn(compact ? type.bodySm : "text-sm", "font-bold leading-snug")}>
            {cluster.headline}
          </h3>
          {clusterSummary}
          <div className="flex flex-wrap items-center gap-1.5">
            {cluster.linkedTeamIds.slice(0, 4).map((teamId) => (
              <TeamLogo key={teamId} teamKey={teamId} size="xs" />
            ))}
          </div>
        </>
      )}
      {!compact && timeline.length > 0 ? (
        <ul className="mt-1 flex flex-col gap-1.5 border-t border-border/50 pt-2">
          {timeline.slice(0, 4).map((claim) => (
            <ClaimTimelineRow key={claim.id} claim={claim} />
          ))}
        </ul>
      ) : null}
      <p className={cn(type.caption, "text-muted-foreground")}>
        {resolved
          ? "Completed movement — linked to official transaction ledger when available."
          : "Strength of reporting — not trade probability."}
      </p>
    </article>
  );
}
