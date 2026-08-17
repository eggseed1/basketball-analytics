"use client";

import type { ComparisonDimension, PlayerComparisonResult } from "@/analytics";
import { PlayerHeadshot } from "@/components/brand/player-headshot";
import { MetricHelp } from "@/components/learn/metric-help";
import { PlayerIdentity } from "@/components/players/player-identity";
import { conceptIdForColumnLabel } from "@/lib/learn-column-concepts";
import { cn } from "@/lib/utils";

function EdgeLabel({
  delta,
  evenThreshold = 3,
  edgeDisplay,
  aName,
  bName,
}: {
  delta?: number;
  evenThreshold?: number;
  edgeDisplay?: string;
  aName: string;
  bName: string;
}) {
  if (edgeDisplay) {
    const even =
      edgeDisplay.toLowerCase() === "even" ||
      edgeDisplay.toLowerCase() === "essentially even";
    return (
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {even ? (
          <MetricHelp conceptId="essentially_even">{edgeDisplay}</MetricHelp>
        ) : (
          edgeDisplay
        )}
      </span>
    );
  }
  if (
    delta == null ||
    !Number.isFinite(delta) ||
    Math.abs(delta) < evenThreshold
  ) {
    return (
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <MetricHelp conceptId="essentially_even">Even</MetricHelp>
      </span>
    );
  }
  return (
    <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
      {delta > 0 ? `${aName} stronger` : `${bName} stronger`}
    </span>
  );
}

function edgeFavorsSide(
  edgeDisplay: string | undefined,
  aName: string,
  bName: string,
  delta: number | undefined,
  evenThreshold: number
): "a" | "b" | "even" {
  if (edgeDisplay) {
    const lower = edgeDisplay.toLowerCase();
    if (
      edgeDisplay === aName ||
      edgeDisplay.startsWith(`${aName} `) ||
      lower === "a edge" ||
      lower.startsWith("a ")
    ) {
      return "a";
    }
    if (
      edgeDisplay === bName ||
      edgeDisplay.startsWith(`${bName} `) ||
      lower === "b edge" ||
      lower.startsWith("b ")
    ) {
      return "b";
    }
    return "even";
  }
  if (delta == null || !Number.isFinite(delta) || Math.abs(delta) < evenThreshold) {
    return "even";
  }
  return delta > 0 ? "a" : "b";
}

export function ComparisonDimensionRow({
  dimension,
  aName,
  bName,
  evenThreshold = 3,
  edgeDisplay,
}: {
  dimension: ComparisonDimension;
  aName: string;
  bName: string;
  /** Absolute |delta| below this is treated as even (player-compare default 3). */
  evenThreshold?: number;
  /** Optional explicit edge label (season-compare uses season years / unavailable). */
  edgeDisplay?: string;
}) {
  const side = edgeFavorsSide(
    edgeDisplay,
    aName,
    bName,
    dimension.delta,
    evenThreshold
  );
  const aWinsExplicit = side === "a";
  const bWinsExplicit = side === "b";
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-border/70 py-3 last:border-0">
      <div className="text-right">
        <p
          className={cn(
            "text-[18px] font-bold tabular-nums tracking-tight",
            aWinsExplicit && "text-foreground",
            bWinsExplicit && "text-muted-foreground"
          )}
        >
          {dimension.aDisplay}
        </p>
        <p className="text-[11px] text-muted-foreground">{aName}</p>
      </div>
      <div className="flex flex-col items-center gap-0.5 px-2">
        <p className="text-[12px] font-semibold">
          {(() => {
            const conceptId = conceptIdForColumnLabel(dimension.label);
            return conceptId ? (
              <MetricHelp conceptId={conceptId}>{dimension.label}</MetricHelp>
            ) : (
              dimension.label
            );
          })()}
        </p>
        <EdgeLabel
          delta={dimension.delta}
          evenThreshold={evenThreshold}
          edgeDisplay={edgeDisplay}
          aName={aName}
          bName={bName}
        />
      </div>
      <div className="text-left">
        <p
          className={cn(
            "text-[18px] font-bold tabular-nums tracking-tight",
            bWinsExplicit && "text-foreground",
            aWinsExplicit && "text-muted-foreground"
          )}
        >
          {dimension.bDisplay}
        </p>
        <p className="text-[11px] text-muted-foreground">{bName}</p>
      </div>
    </div>
  );
}

export function PlayerCompareView({
  result,
}: {
  result: PlayerComparisonResult;
}) {
  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center sm:gap-8">
        <PlayerIdentity
          playerId={result.aId}
          name={result.aName}
          season={result.season}
          className="flex flex-col items-center"
          nameClassName="flex flex-col items-center gap-2 text-center no-underline hover:underline"
        >
          <PlayerHeadshot
            playerId={result.aId}
            name={result.aName}
            size="lg"
          />
          <span className="text-[16px] font-bold tracking-tight">
            {result.aName}
          </span>
        </PlayerIdentity>
        <p className="text-[13px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
          vs
        </p>
        <PlayerIdentity
          playerId={result.bId}
          name={result.bName}
          season={result.season}
          className="flex flex-col items-center"
          nameClassName="flex flex-col items-center gap-2 text-center no-underline hover:underline"
        >
          <PlayerHeadshot
            playerId={result.bId}
            name={result.bName}
            size="lg"
          />
          <span className="text-[16px] font-bold tracking-tight">
            {result.bName}
          </span>
        </PlayerIdentity>
      </header>

      {result.season ? (
        <p className="text-center text-[13px] text-muted-foreground">
          Season {result.season} ·{" "}
          <MetricHelp conceptId="percentiles">percentiles</MetricHelp> among
          qualified peers
        </p>
      ) : null}

      <section className="sports-card px-4 py-2 sm:px-5">
        <h2 className="sr-only">Dimensions</h2>
        {(
          [
            ["rate_ability", "Rate / ability"],
            ["realized_value", "Realized value"],
            ["external", "External impact"],
            ["box", "Box score"],
          ] as const
        ).map(([group, title]) => {
          const rows = result.dimensions.filter(
            (d) => (d.group ?? "box") === group
          );
          if (!rows.length) return null;
          return (
            <div key={group} className="mb-3 last:mb-0">
              <h3 className="border-b border-border/70 py-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                {title}
              </h3>
              {rows.map((d) => (
                <ComparisonDimensionRow
                  key={d.id}
                  dimension={d}
                  aName={result.aName}
                  bName={result.bName}
                />
              ))}
            </div>
          );
        })}
      </section>

      <section className="sports-card flex flex-col gap-2 px-4 py-4 sm:px-5">
        <h2 className="text-[15px] font-bold tracking-tight">
          How are they different?
        </h2>
        <ul className="flex flex-col gap-2">
          {result.differenceSummary.map((line) => (
            <li
              key={line}
              className="text-[14px] leading-relaxed text-muted-foreground"
            >
              {line}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[12px] text-muted-foreground">
          Deeper situational and possession comparisons need PBP data that is
          not available yet.
        </p>
      </section>
    </div>
  );
}
