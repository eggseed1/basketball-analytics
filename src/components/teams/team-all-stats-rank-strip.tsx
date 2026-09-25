import { TransitionLink } from "@/components/continuity/query-nav";
import { type } from "@/lib/design-system";
import { formatNumber } from "@/lib/format";
import {
  formatRankLine,
  type RankedMetric,
} from "@/lib/team-page-metrics";
import { teamPageHref } from "@/lib/team-destination";
import { cn } from "@/lib/utils";

function MetricTile({ metric }: { metric: RankedMetric }) {
  return (
    <div className="rounded-md border border-border/60 frost-surface-soft px-3 py-3">
      <p
        className={cn(
          type.caption,
          "font-semibold uppercase text-muted-foreground"
        )}
      >
        {metric.label}
      </p>
      <p className="mt-1 text-xl font-semibold tabular-nums">
        {metric.formattedValue}
      </p>
      <p className={cn(type.caption, "mt-1 text-muted-foreground")}>
        {formatRankLine(metric)}
      </p>
    </div>
  );
}

/**
 * All Stats rank strip — season board ranks before the trait ledger.
 */
export function TeamAllStatsRankStrip({
  teamId,
  season,
  metrics,
}: {
  teamId: string;
  season: string;
  metrics: RankedMetric[];
}) {
  const present = metrics.filter((m) => !m.missingReason);
  if (!present.length) return null;

  const offenseHref = teamPageHref(teamId, { season, tab: "offense" });
  const defenseHref = teamPageHref(teamId, { season, tab: "defense" });

  return (
    <div className="sports-card flex flex-col gap-3 p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className={cn(type.bodySm, "font-semibold")}>
            League ranks (board)
          </h3>
          <p className={cn(type.caption, "text-muted-foreground")}>
            Same season board as Overview — missing feeds stay blank, not 0.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <TransitionLink
            href={offenseHref}
            className={cn(type.caption, "font-semibold underline")}
          >
            Offense →
          </TransitionLink>
          <TransitionLink
            href={defenseHref}
            className={cn(type.caption, "font-semibold underline")}
          >
            Defense →
          </TransitionLink>
        </div>
      </div>
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {present.map((metric) => (
          <MetricTile key={`${metric.group}-${metric.key}`} metric={metric} />
        ))}
      </dl>
      <p className={cn(type.caption, "text-muted-foreground")}>
        {present.length} published
        {metrics.length - present.length > 0
          ? ` · ${metrics.length - present.length} unpublished on this board`
          : " · full board published"}
        {present[0]?.sample != null
          ? ` · sample ${formatNumber(present[0].sample, 0)} GP`
          : null}
      </p>
    </div>
  );
}

