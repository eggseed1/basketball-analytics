import { MovementCenterView } from "@/components/movement/movement-center-view";
import { MovementClusterCard } from "@/components/movement/movement-cluster-card";
import { getMovementCluster, getMovementFeed } from "@/data/queries/movement-center.server";
import { type } from "@/lib/design-system";
import Link from "next/link";
import { notFound } from "next/navigation";

export const metadata = {
  title: "Movement Center",
  description:
    "Evidence-backed NBA movement reporting — separate from official transactions.",
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

  const feed = getMovementFeed();
  if (!feed) {
    return (
      <main className="site-shell py-8">
        <p className="text-muted-foreground">Movement Center snapshot unavailable.</p>
      </main>
    );
  }

  if (clusterId) {
    const item = getMovementCluster(clusterId);
    if (!item) notFound();
    return (
      <main className="site-shell flex flex-col gap-4 py-6 sm:py-8">
        <p className={type.caption}>
          <Link href="/movement" className="font-semibold underline">
            ← Movement Center
          </Link>
        </p>
        <MovementClusterCard
          cluster={item.cluster}
          claims={item.claims}
          score={item.score}
        />
      </main>
    );
  }

  const items = playerId
    ? feed.items.filter((i) => i.cluster.linkedPlayerIds.includes(playerId))
    : feed.items;

  return (
    <main className="site-shell py-6 sm:py-8">
      <MovementCenterView
        feed={items}
        season={feed.season}
        disclaimer={feed.disclaimer}
        status={feed.status}
        highlightPlayerId={playerId}
      />
    </main>
  );
}
