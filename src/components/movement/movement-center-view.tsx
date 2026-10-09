import Link from "next/link";

import { MovementClusterCard } from "@/components/movement/movement-cluster-card";
import { MoreInfo } from "@/components/ui/more-info";
import {
  isFellThroughMovementState,
  isResolvedMovementState,
} from "@/movement-center/cluster-state";
import { resolveMovementPresentation } from "@/movement-center/prominence";
import type { MovementCuratedSnapshot, MovementFeedItem } from "@/movement-center/types";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

function formatDay(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function MovementCenterView({
  feed,
  meta,
  highlightPlayerIds,
  filtered = false,
}: {
  feed: MovementFeedItem[];
  meta: MovementCuratedSnapshot["meta"];
  highlightPlayerIds?: string[];
  filtered?: boolean;
}) {
  const presentation = resolveMovementPresentation();
  const byRecent = (a: MovementFeedItem, b: MovementFeedItem) =>
    b.cluster.lastMeaningfulAt.localeCompare(a.cluster.lastMeaningfulAt);
  const activeFeed = feed
    .filter((item) => !isResolvedMovementState(item.cluster.state))
    .sort(byRecent);
  const resolvedFeed = feed
    .filter(
      (item) =>
        isResolvedMovementState(item.cluster.state) &&
        !isFellThroughMovementState(item.cluster.state)
    )
    .sort(byRecent);
  const fellThroughFeed = feed
    .filter((item) => isFellThroughMovementState(item.cluster.state))
    .sort(byRecent);
  const headlineDay = formatDay(meta.latestHeadlineAt);
  const ledgerDay = formatDay(meta.latestTransactionDate);
  const windowDay = formatDay(meta.tradeWindowStart);

  const renderFeed = (items: MovementFeedItem[]) => (
    <ul className="flex flex-col gap-3">
      {items.map((item) => {
        const playerHit = item.cluster.linkedPlayerIds.some((id) =>
          highlightPlayerIds?.includes(id)
        );
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
              evidenceNote={false}
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
          {presentation.productName} · {meta.season}
        </p>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {presentation.seasonalLabel}
        </h1>
        <p className={cn(type.bodySm, "max-w-2xl text-muted-foreground")}>
          {presentation.tagline}. Moves that are already official live on the{" "}
          <Link href="/offseason" className="font-semibold underline">
            transactions page
          </Link>
          .
        </p>
        <p className={cn(type.caption, "max-w-3xl text-muted-foreground")}>{meta.disclaimer}</p>
        {(meta.headlinesScanned != null && meta.feeds?.length) || ledgerDay ? (
          <MoreInfo summary="Sources">
            <p>
              {meta.headlinesScanned != null && meta.feeds?.length ? (
                <>
                  Scanned {meta.headlinesScanned} headlines from {meta.feeds.length}{" "}
                  {meta.feeds.length === 1 ? "news feed" : "news feeds"}
                  {headlineDay ? `, newest ${headlineDay}` : ""}.{" "}
                </>
              ) : null}
              {ledgerDay ? <>Transaction log through {ledgerDay}.</> : null}
            </p>
          </MoreInfo>
        ) : null}
        {filtered ? (
          <p className={type.caption}>
            <Link href="/movement" className="font-semibold underline">
              Show all stories
            </Link>
          </p>
        ) : null}
      </header>

      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 className={cn(type.bodySm, "font-bold")}>Open stories</h2>
          <p className={cn(type.caption, "text-muted-foreground")}>
            Trade and contract reporting that has not shown up in the transaction log yet.
          </p>
        </div>
        {activeFeed.length === 0 ? (
          <p className={cn(type.bodySm, "text-muted-foreground")}>
            {filtered
              ? "No open trade or contract stories for this player in the headlines we track."
              : "No open trade or contract stories in the headlines we track right now."}
          </p>
        ) : (
          renderFeed(activeFeed)
        )}
      </section>

      {resolvedFeed.length > 0 ? (
        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-0.5">
            <h2 className={cn(type.bodySm, "font-bold")}>Completed moves</h2>
            <p className={cn(type.caption, "text-muted-foreground")}>
              {windowDay ? `Trades in the transaction log since ${windowDay}` : "Trades in the transaction log"}
              , plus reported stories that turned into a logged move.
            </p>
          </div>
          {renderFeed(resolvedFeed)}
        </section>
      ) : null}

      {fellThroughFeed.length > 0 ? (
        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-0.5">
            <h2 className={cn(type.bodySm, "font-bold")}>Fell through</h2>
            <p className={cn(type.caption, "text-muted-foreground")}>
              Stories where the player moved to a team the reports didn&apos;t name, or the trade
              deadline passed with no deal. The reporting may still have been accurate when it ran.
            </p>
          </div>
          {renderFeed(fellThroughFeed)}
        </section>
      ) : null}
    </div>
  );
}
