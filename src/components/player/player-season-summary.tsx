import type { SeasonSummaryStat } from "@/lib/player-stat-views";
import type { PlayerPercentile } from "@/data/queries";
import { percentileColor } from "@/components/player/percentile-rankings";
import { StatTooltip } from "@/components/ui/stat-tooltip";

const PERCENTILE_KEYS: Record<string, string> = {
  pts: "pointsPer36",
  trb: "reboundRate",
  ast: "assistRate",
  fg: "fieldGoalPct",
  fg3: "threePointPct",
  ft: "freeThrowPct",
  efg: "effectiveFieldGoalPct",
  ts: "trueShootingPct",
  usg: "usagePct",
};

export function PlayerSeasonSummary({
  season,
  stats,
  percentiles,
}: {
  season: string;
  stats: SeasonSummaryStat[];
  percentiles: PlayerPercentile[];
}) {
  const byKey = new Map(percentiles.map((p) => [p.key, p]));

  return (
    <section
      aria-labelledby="season-summary-heading"
      className="rounded-xl border border-border bg-card p-4"
    >
      <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="season-summary-heading" className="text-lg font-semibold">
            {season} summary
          </h2>
          <p className="text-sm text-muted-foreground">
            Headline counting and rate stats with percentile color ticks under
            each value.
          </p>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5 lg:grid-cols-10">
        {stats.map((stat) => {
          const pctKey = PERCENTILE_KEYS[stat.key];
          const pct = pctKey ? byKey.get(pctKey) : undefined;
          return (
            <div
              key={stat.key}
              className="flex flex-col gap-1.5 rounded-lg bg-muted/30 px-2.5 py-2"
            >
              <dt className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
                <StatTooltip nestable stat={stat.label}>
                  {stat.label}
                </StatTooltip>
              </dt>
              <dd className="text-2xl font-semibold tabular-nums tracking-tight">
                {stat.value}
              </dd>
              {pct ? (
                <div
                  className="h-1.5 overflow-hidden rounded-full bg-muted"
                  role="img"
                  aria-label={`${stat.label} ${pct.percentile}th percentile`}
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${pct.percentile}%`,
                      backgroundColor: percentileColor(pct.quality),
                    }}
                  />
                </div>
              ) : (
                <div className="h-1.5" aria-hidden />
              )}
            </div>
          );
        })}
      </dl>
    </section>
  );
}
