import { type } from "@/lib/design-system";
import { formatRankLine, metricTipProps, type RankedMetric } from "@/lib/team-page-metrics";
import { cn } from "@/lib/utils";

/** Ranked team metric tile; the parent `dl` carries `data-hover-group`. */
export function TeamMetricTile({ metric }: { metric: RankedMetric }) {
  return (
    <div
      data-stat-tile
      data-hover-item
      {...metricTipProps(metric)}
      className="rounded-md border border-border/60 frost-surface-soft px-3 py-3"
    >
      <dt className={cn(type.caption, "font-semibold uppercase text-muted-foreground")}>
        {metric.label}
      </dt>
      <dd className="mt-1 text-xl font-semibold tabular-nums">{metric.formattedValue}</dd>
      <dd className={cn(type.caption, "mt-1 text-muted-foreground")}>{formatRankLine(metric)}</dd>
    </div>
  );
}
