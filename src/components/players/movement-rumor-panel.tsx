import Link from "next/link";

import { MovementClusterCard } from "@/components/movement/movement-cluster-card";
import { TeamLogo } from "@/components/brand/team-logo";
import { TextLink } from "@/components/ui/text-link";
import { isResolvedMovementState } from "@/movement-center/cluster-state";
import { resolveMovementPresentation } from "@/movement-center/prominence";
import type { PlayerMovementBundle } from "@/movement-center/types";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

/** Rumor Mill tab body — no outer glass shell (lives inside intelligence rail). */
export function MovementRumorPanel({
  playerId,
  playerName,
  bundle,
}: {
  playerId: string;
  playerName: string;
  bundle?: PlayerMovementBundle | null;
}) {
  const presentation = resolveMovementPresentation();
  const monitor = bundle?.monitor ?? null;
  const activeClusters =
    bundle?.clusters.filter((c) => !isResolvedMovementState(c.state)) ?? [];
  const displayClusters = (
    activeClusters.length ? activeClusters : (bundle?.clusters ?? [])
  ).slice(0, 2);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <p className={cn(type.bodySm, "font-semibold leading-snug")}>
          {presentation.seasonalLabel}
        </p>
        <p className={cn(type.caption, "text-muted-foreground")}>
          {presentation.tagline}
        </p>
      </div>

      {monitor && bundle ? (
        <>
          <MonitorSummary monitor={monitor} />
          <ul className="flex flex-col gap-2">
            {displayClusters.map((cluster) => (
              <li key={cluster.id}>
                <MovementClusterCard
                  cluster={cluster}
                  claims={bundle.claimsByCluster[cluster.id] ?? []}
                  score={bundle.scoresByCluster[cluster.id]!}
                  compact
                  href={`/movement?cluster=${encodeURIComponent(cluster.id)}`}
                />
              </li>
            ))}
          </ul>
          <TextLink
            href={`/movement?player=${encodeURIComponent(playerId)}`}
            className={type.caption}
          >
            Full movement monitor →
          </TextLink>
        </>
      ) : (
        <div className="flex flex-col gap-2 rounded-md border border-dashed border-border/70 frost-surface-muted px-2.5 py-2">
          <p className={cn(type.caption, "text-muted-foreground")}>
            No curated movement evidence for {playerName} in the current
            snapshot.
          </p>
        </div>
      )}

      <p className={cn(type.caption, "text-muted-foreground")}>
        <Link href="/offseason" className="font-semibold underline">
          Official transactions
        </Link>{" "}
        ·{" "}
        <Link href="/movement" className="font-semibold underline">
          Movement Center
        </Link>
      </p>
    </div>
  );
}

function MonitorSummary({
  monitor,
}: {
  monitor: NonNullable<PlayerMovementBundle["monitor"]>;
}) {
  const score = monitor.evidenceScore?.total;
  return (
    <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
      <div>
        <dt className={cn(type.caption, "text-muted-foreground")}>Activity</dt>
        <dd className={cn(type.bodySm, "font-semibold capitalize")}>
          {monitor.activityLevel}
        </dd>
      </div>
      <div>
        <dt className={cn(type.caption, "text-muted-foreground")}>Direction</dt>
        <dd className={cn(type.bodySm, "font-semibold capitalize")}>
          {monitor.direction}
        </dd>
      </div>
      {monitor.linkedTeamIds.length > 0 ? (
        <div className="col-span-2">
          <dt className={cn(type.caption, "text-muted-foreground")}>
            Teams linked
          </dt>
          <dd className="mt-1 flex flex-wrap gap-1">
            {monitor.linkedTeamIds.map((id) => (
              <TeamLogo key={id} teamKey={id} size="sm" />
            ))}
          </dd>
        </div>
      ) : null}
      {score != null ? (
        <div className="col-span-2">
          <dt className={cn(type.caption, "text-muted-foreground")}>
            Top evidence strength
          </dt>
          <dd className={cn(type.bodySm, "font-semibold tabular-nums")}>
            {score}/100
            <span className="ml-1 font-normal text-muted-foreground">
              (not probability)
            </span>
          </dd>
        </div>
      ) : null}
    </dl>
  );
}
