import { MotionReveal } from "@/components/continuity/motion-reveal";
import { MovementCenterView } from "@/components/movement/movement-center-view";
import { MovementClusterCard } from "@/components/movement/movement-cluster-card";
import {
  getMovementCluster,
  getMovementFeed,
  getMovementPlayerIdSet,
} from "@/data/queries/movement-center.server";
import { type } from "@/lib/design-system";
import Link from "next/link";
import { notFound } from "next/navigation";

export const metadata = {
  title: "Movement Center",
  description:
    "NBA trade and contract reporting from publisher headlines, scored for evidence and linked to the transactions that followed.",
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

export default async function MovementCenterPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const clusterId = one(sp, "cluster");
  const playerId = one(sp, "player");

  const feed = await getMovementFeed();
  if (!feed) {
    return (
      <main data-motion-page className="site-shell py-8">
        <MotionReveal />
        <p className="text-muted-foreground">Movement Center snapshot unavailable.</p>
      </main>
    );
  }

  if (clusterId) {
    const item = await getMovementCluster(clusterId);
    if (!item) notFound();
    return (
      <main data-motion-page className="site-shell flex flex-col gap-4 py-6 sm:py-8">
        <MotionReveal />
        <p className={type.caption}>
          <Link href="/movement" className="font-semibold underline">
            ← Movement Center
          </Link>
        </p>
        <MovementClusterCard
          cluster={item.cluster}
          claims={item.claims}
          score={item.score}
          showAllClaims
        />
      </main>
    );
  }

  const playerIds = playerId ? await getMovementPlayerIdSet(playerId) : null;
  const items = playerIds
    ? feed.items.filter((i) => i.cluster.linkedPlayerIds.some((id) => playerIds.has(id)))
    : feed.items;

  return (
    <main data-motion-page className="site-shell py-6 sm:py-8">
      <MotionReveal />
      <MovementCenterView
        feed={items}
        meta={feed.meta}
        highlightPlayerIds={playerIds ? [...playerIds] : undefined}
        filtered={Boolean(playerIds)}
      />
    </main>
  );
}
