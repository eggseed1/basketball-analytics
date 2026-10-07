import { useId } from "react";

import { StandingsDiffBarsLazy } from "@/components/charts/recharts-lazy";
import type { DiffPoint } from "@/components/charts/standings-diff-bars";
import type { StandingRow } from "@/data/types";
import { type } from "@/lib/design-system";
import { teamBrandCompareBarFill } from "@/lib/nba-brand";
import { cn } from "@/lib/utils";

/**
 * Point-differential board for standings: who is actually outscoring opponents.
 * The frame renders on the server at the chart's final height, so the tables
 * below hold their place while the bars load.
 */
export function StandingsDiffBoard({
  season,
  east,
  west,
  className,
}: {
  season: string;
  east: StandingRow[];
  west: StandingRow[];
  className?: string;
}) {
  const chartId = useId();
  const mapRow = (row: StandingRow): DiffPoint => ({
    abbr: row.abbreviation,
    name: row.displayName,
    differential: row.differential,
    fill: teamBrandCompareBarFill(row.abbreviation),
    conference: row.conference,
  });
  const data = [...east.map(mapRow), ...west.map(mapRow)].sort(
    (a, b) => b.differential - a.differential
  );

  if (data.length < 8) return null;

  const peak = Math.max(...data.map((d) => Math.abs(d.differential)), 0.5);

  return (
    <figure
      aria-labelledby={`${chartId}-title`}
      aria-describedby={`${chartId}-desc`}
      className={cn("sports-card flex flex-col gap-2 p-3 sm:p-4", className)}
    >
      <div>
        <p id={`${chartId}-title`} className={cn(type.heading)}>
          Scoring margin · {season}
        </p>
        <p id={`${chartId}-desc`} className={cn(type.caption, "text-muted-foreground")}>
          Average point differential across both conferences, to read alongside
          the W/L table.
        </p>
      </div>
      <div className="w-full min-w-0" style={{ height: Math.max(280, data.length * 18 + 32) }}>
        <StandingsDiffBarsLazy data={data} peak={peak} />
      </div>
    </figure>
  );
}
