import Link from "next/link";

import { MovementClusterCard } from "@/components/movement/movement-cluster-card";
import { isResolvedMovementState } from "@/movement-center/cluster-state";
import { resolveMovementPresentation } from "@/movement-center/prominence";
import type { MovementFeedItem } from "@/movement-center/types";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

export function MovementCenterView({
  feed,
  season,
  disclaimer,
  status,
  highlightPlayerId,
}: {
  feed: MovementFeedItem[];
  season: string;
  disclaimer: string;
  status: string;
  highlightPlayerId?: string;
}) {
  const presentation = resolveMovementPresentation();
  const activeFeed = feed.filter(
    (item) => !isResolvedMovementState(item.cluster.state)
  );
  const resolvedFeed = feed.filter((item) =>
    isResolvedMovementState(item.cluster.state)
  );

  const renderFeed = (items: MovementFeedItem[]) => (
    <ul className="flex flex-col gap-3">
      {items.map((item) => {
        const playerHit =
          highlightPlayerId &&
          item.cluster.linkedPlayerIds.includes(highlightPlayerId);
        return (
          <li
            key={item.cluster.id}
            className={cn(playerHit && "rounded-md ring-2 ring-primary/30")}
          >
            <MovementClusterCard
              cluster={item.cluster}
              claims={item.claims}
              score={item.score}
              href={`/movement?cluster=${encodeURIComponent(item.cluster.id)}`}
            />
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <p
          className={cn(
            type.caption,
            "font-semibold uppercase tracking-wide text-muted-foreground"
          )}
        >
          {presentation.productName} · {season}
        </p>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {presentation.seasonalLabel}
        </h1>
        <p className={cn(type.bodySm, "max-w-2xl text-muted-foreground")}>
          {presentation.tagline}. Unresolved movement reporting is separate from{" "}
          <Link href="/offseason" className="font-semibold underline">
            official transactions
          </Link>
          .
        </p>
        <p className={cn(type.caption, "rounded-md border border-dashed border-amber-600/30 bg-amber-500/5 px-3 py-2 text-muted-foreground")}>
          {disclaimer} Snapshot status: {status}.
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className={cn(type.bodySm, "font-bold")}>Active story clusters</h2>
        {activeFeed.length === 0 ? (
          <p className={cn(type.bodySm, "text-muted-foreground")}>
            No unresolved clusters in this snapshot.
          </p>
        ) : (
          renderFeed(activeFeed)
        )}
      </section>

      {resolvedFeed.length > 0 ? (
        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-0.5">
            <h2 className={cn(type.bodySm, "font-bold")}>Resolved clusters</h2>
            <p className={cn(type.caption, "text-muted-foreground")}>
              Completed transactions — movement story closed, not active rumor
              language.
            </p>
          </div>
          {renderFeed(resolvedFeed)}
        </section>
      ) : null}
    </div>
  );
}
