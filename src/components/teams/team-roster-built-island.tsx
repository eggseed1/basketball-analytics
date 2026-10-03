import Link from "next/link";

import { RosterArrivals } from "@/components/acquisitions/acquisition-story";
import { getTeamRosterArrivals } from "@/data/queries/acquisition-paths";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

/** Current roster with the move that brought each player in. */
export async function TeamRosterBuiltIsland({ espnTeamId }: { espnTeamId: string }) {
  const roster = await getTeamRosterArrivals(espnTeamId).catch(() => null);
  if (!roster || (!roster.onRoster.length && !roster.notLogged.length)) return null;
  return (
    <section className="flex flex-col gap-2" aria-label="How this roster was built">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[20px] font-bold tracking-tight">How this roster was built</h2>
        <Link
          href={`/acquisitions?team=${encodeURIComponent(espnTeamId)}`}
          className={cn(type.caption, "font-semibold underline-offset-2 hover:underline")}
        >
          Every arrival since 2000 →
        </Link>
      </div>
      <RosterArrivals teamId={espnTeamId} onRoster={roster.onRoster} notLogged={roster.notLogged} />
    </section>
  );
}
