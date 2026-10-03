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
import type {
  MovementClaim,
  MovementDeal,
  MovementDealUnconfirmed,
  MovementEvidenceScore,
  MovementStoryCluster,
} from "@/movement-center/types";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

function formatWhen(claim: MovementClaim) {
  const d = new Date(claim.publishedAt);
  if (claim.provenanceKind === "completed_transaction") {
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  }
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function provenanceLabel(claim: MovementClaim): string {
  switch (claim.provenanceKind) {
    case "original_report":
      return "Original report";
    case "official_statement":
      return "On the record";
    case "completed_transaction":
      return "Transaction log";
    case "cites_report":
    case "aggregation":
      return "Relayed report";
    default:
      return claim.isOriginal ? "Original" : "Derivative";
  }
}

function ClaimTimelineRow({ claim }: { claim: MovementClaim }) {
  const href = resolveMovementClaimHref(claim);

  return (
    <li className={cn(type.caption, "text-muted-foreground")}>
      <time className="tabular-nums text-foreground">
        {formatWhen(claim)}
      </time>
      {" · "}
      {provenanceLabel(claim)}
      {claim.state === "denied" ? " · denial" : ""} ·{" "}
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

function formatDealDate(date: string) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function sentenceCase(label: string) {
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function possessive(name: string) {
  return name.endsWith("s") ? `${name}'` : `${name}'s`;
}

function joinLabels(labels: string[]) {
  if (labels.length <= 1) return labels[0] ?? "";
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

function UnconfirmedNotes({
  items,
  names,
}: {
  items: MovementDealUnconfirmed[];
  names: Map<string, string | undefined>;
}) {
  const groups = new Map<string, MovementDealUnconfirmed[]>();
  for (const item of items) {
    const key = `${item.claimedByTeamId}>${item.toTeamId}`;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return (
    <>
      {[...groups.values()].map((group) => {
        const claimant = names.get(group[0]!.claimedByTeamId) ?? "One team";
        const receiver = names.get(group[0]!.toTeamId) ?? "the other team";
        const only = group.length === 1 ? group[0]! : null;
        const pronoun = only?.playerId ? "him" : only && !only.label.endsWith("s") ? "it" : "them";
        return (
          <p
            key={`${group[0]!.claimedByTeamId}>${group[0]!.toTeamId}`}
            className={cn(type.caption, "text-muted-foreground")}
          >
            The {possessive(claimant)} ESPN entry says they also sent{" "}
            {joinLabels(group.map((g) => g.label))} to the {receiver}. The {possessive(receiver)} entry
            doesn&apos;t list {pronoun}, so we can&apos;t confirm that part of the deal.
          </p>
        );
      })}
    </>
  );
}

function dealTrailHref(deal: MovementDeal, headlinePlayerIds: string[]): string | null {
  const received = deal.sides.flatMap((side) =>
    side.receives.filter((a) => a.playerId).map((a) => ({ teamId: side.teamId, playerId: a.playerId! }))
  );
  const pick = received.find((r) => headlinePlayerIds.includes(r.playerId)) ?? received[0];
  if (!pick) return null;
  return `/acquisitions?${new URLSearchParams({ team: pick.teamId, player: pick.playerId, since: deal.date }).toString()}`;
}

export function DealSides({ deal, compact }: { deal: MovementDeal; compact: boolean }) {
  const names = new Map(deal.sides.map((s) => [s.teamId, s.teamName]));
  const multiTeam = deal.sides.length > 2;
  return (
    <>
    <div
      className={cn(
        "grid gap-2",
        !compact && (multiTeam ? "sm:grid-cols-2 lg:grid-cols-3" : "sm:grid-cols-2")
      )}
    >
      {deal.sides.map((side) => (
        <section
          key={side.teamId}
          className="flex flex-col gap-1.5 rounded-md border border-border/60 frost-surface-muted px-2.5 py-2"
        >
          <h4 className={cn(type.caption, "flex items-center gap-1.5 font-semibold text-foreground")}>
            <TeamLogo teamKey={side.teamId} size="xs" />
            {side.teamName ?? "Team"} receive
          </h4>
          {side.receives.length ? (
            <ul className="flex flex-col gap-0.5">
              {side.receives.map((asset) => {
                const from = multiTeam && asset.fromTeamId ? names.get(asset.fromTeamId) : null;
                return (
                  <li
                    key={`${asset.playerId ?? asset.label}-${asset.fromTeamId ?? ""}`}
                    className={cn(type.bodySm, "leading-snug")}
                  >
                    {asset.playerId ? (
                      <Link
                        href={`/players/${asset.playerId}`}
                        className="font-semibold underline-offset-2 hover:underline"
                      >
                        {asset.label}
                      </Link>
                    ) : asset.nonPlayer ? (
                      <span className="text-muted-foreground">{sentenceCase(asset.label)}</span>
                    ) : (
                      <span className="font-semibold">{asset.label}</span>
                    )}
                    {from ? (
                      <span className={cn(type.caption, "text-muted-foreground")}> from {from}</span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className={cn(type.caption, "text-muted-foreground")}>
              Not listed in the ESPN log
            </p>
          )}
        </section>
      ))}
    </div>
    {deal.unconfirmed?.length ? <UnconfirmedNotes items={deal.unconfirmed} names={names} /> : null}
    </>
  );
}

export function MovementClusterCard({
  cluster,
  claims,
  score,
  compact = false,
  href,
  showAllClaims = false,
  evidenceNote = true,
}: {
  cluster: MovementStoryCluster;
  claims: MovementClaim[];
  score: MovementEvidenceScore;
  compact?: boolean;
  href?: string;
  showAllClaims?: boolean;
  /** Off where the page header already says what evidence scores mean. */
  evidenceNote?: boolean;
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
  const deal = cluster.deal?.sides.length ? cluster.deal : null;
  const tradeTrailHref = deal ? dealTrailHref(deal, cluster.linkedPlayerIds) : null;
  const timelineClaims =
    deal && !showAllClaims
      ? timeline.filter((c) => c.provenanceKind !== "completed_transaction")
      : timeline;

  const clusterLinkClass = href ? "block hover:opacity-95" : undefined;
  const clusterSummary = resolved && completionClaim ? (
    <p
      className={cn(
        type.caption,
        "rounded-md border border-sky-500/25 frost-surface px-2 py-1.5 text-sky-950 dark:text-sky-100"
      )}
    >
      Transaction recorded: {completionClaim.summary}
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
      {deal ? (
        <>
          {href ? (
            <Link href={href} className={clusterLinkClass}>
              <h3 className={cn(compact ? type.bodySm : "text-sm", "font-bold leading-snug")}>
                {cluster.headline}
              </h3>
            </Link>
          ) : (
            <h3 className={cn(compact ? type.bodySm : "text-sm", "font-bold leading-snug")}>
              {cluster.headline}
            </h3>
          )}
          <DealSides deal={deal} compact={compact} />
        </>
      ) : href ? (
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
      {!compact && timelineClaims.length > 0 ? (
        <ul className="mt-1 flex flex-col gap-1.5 border-t border-border/50 pt-2">
          {(showAllClaims ? timelineClaims : timelineClaims.slice(0, 4)).map((claim) => (
            <ClaimTimelineRow key={claim.id} claim={claim} />
          ))}
        </ul>
      ) : null}
      {deal || resolved || evidenceNote ? (
      <p className={cn(type.caption, "text-muted-foreground")}>
        {deal ? (
          <>
            Trade logged {formatDealDate(deal.date)} in the{" "}
            <Link href="/offseason" className="font-semibold underline-offset-2 hover:underline">
              ESPN transaction log
            </Link>
            . Each side lists only what the log names.
            {tradeTrailHref ? (
              <>
                {" "}
                <Link href={tradeTrailHref} className="font-semibold underline-offset-2 hover:underline">
                  See where this trade led →
                </Link>
              </>
            ) : null}
          </>
        ) : resolved ? (
          "Completed move, confirmed by the ESPN transaction log."
        ) : (
          "Evidence rates the reporting, not the odds of a move."
        )}
      </p>
      ) : null}
    </article>
  );
}
