import { PlayerCompFuturesChartLazy as PlayerCompFuturesChart } from "@/components/charts/recharts-lazy";
import { type } from "@/lib/design-system";
import { loadCompFuturesBundle } from "@/lib/player-comp-futures";
import type { PlayerSeason } from "@/data/types";
import { cn } from "@/lib/utils";

export function PlayerCompFuturesPanel({
  focal,
  career,
  teamKey,
  espnId,
}: {
  focal: PlayerSeason | null;
  career: PlayerSeason[];
  teamKey?: string | null;
  espnId?: string | null;
}) {
  const bundle = loadCompFuturesBundle(focal, career, espnId);
  if (!bundle) return null;
  const first = bundle.items.find((item) => item.metricId === bundle.defaultId) ?? bundle.items[0]!;

  return (
    <div className="flex flex-col gap-3 border-t border-border/60 pt-4">
      <div>
        <h3 className={cn(type.heading, "tracking-tight")}>Comps and futures</h3>
        <p className="mt-1 text-[13px] leading-snug text-muted-foreground">
          {first.focalName}&apos;s line runs through {first.focalSeason}. After that
          age, each faint line is a comp&apos;s actual rating. The dashed line starts
          on his mark and follows the weighted median of how those comps changed.
        </p>
      </div>
      <PlayerCompFuturesChart bundle={bundle} teamKey={teamKey ?? focal?.teamId} />
    </div>
  );
}
