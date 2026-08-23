import Link from "next/link";

import { MovementClusterCard } from "@/components/movement/movement-cluster-card";
import { getTeamMovementFeed } from "@/data/queries/movement-center.server";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

export async function TeamMovementIsland({
  teamId,
}: {
  teamId: string;
}) {
  const items = await getTeamMovementFeed(teamId, { activeOnly: true });
  if (!items?.length) return null;

  return (
    <section
      id="movement"
      className="scroll-mt-16 flex flex-col gap-3"
      aria-label="Movement Center"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-[20px] font-bold tracking-tight">
            Movement Center
          </h2>
          <p className={cn(type.bodySm, "text-muted-foreground")}>
            Unresolved movement reporting linked to this franchise.
          </p>
        </div>
        <Link
          href={`/movement`}
          className={cn(type.caption, "font-semibold underline")}
        >
          Full board →
        </Link>
      </div>
      <ul className="flex flex-col gap-2">
        {items.slice(0, 3).map((item) => (
          <li key={item.cluster.id}>
            <MovementClusterCard
              cluster={item.cluster}
              claims={item.claims}
              score={item.score}
              compact
              href={`/movement?cluster=${encodeURIComponent(item.cluster.id)}`}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
