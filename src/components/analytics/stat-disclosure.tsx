"use client";

import Link from "next/link";

import type { StatContext } from "@/analytics";
import { contextBlurb } from "@/analytics";
import { MetricHelp } from "@/components/learn/metric-help";
import { formatOrdinal } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Level 1-2 progressive disclosure for a single statistic.
 * Keeps the surface simple; exposes context on demand.
 */
export function StatDisclosure({
  label,
  context,
  conceptId,
  className,
}: {
  label?: string;
  context: StatContext;
  /** Optional Learn registry id for MetricHelp on the label. */
  conceptId?: string;
  className?: string;
}) {
  const blurb = contextBlurb(context);
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      {label ? (
        <p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
          {conceptId ? (
            <MetricHelp
              conceptId={conceptId}
              labelClassName="uppercase tracking-wide"
            >
              {label}
            </MetricHelp>
          ) : (
            label
          )}
        </p>
      ) : null}
      <p className="text-[28px] font-bold tracking-tight tabular-nums leading-none">
        {context.display}
      </p>
      {context.percentile != null ? (
        <p className="text-[14px] font-semibold text-foreground">
          <MetricHelp conceptId="percentiles" labelClassName="font-semibold">
            {formatOrdinal(Math.round(context.percentile))} percentile
          </MetricHelp>
          {context.populationLabel ? (
            <span className="font-normal text-muted-foreground">
              {" "}
              · {context.populationLabel}
            </span>
          ) : null}
        </p>
      ) : null}
      {blurb && context.percentile == null ? (
        <p className="text-[12px] text-muted-foreground">{blurb}</p>
      ) : null}
      {(context.sampleSize != null ||
        context.timeframe ||
        context.learnHref) && (
        <p className="text-[12px] text-muted-foreground">
          {[
            context.timeframe,
            context.sampleSize != null ? `${context.sampleSize} peers` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
          {context.learnHref ? (
            <>
              {context.timeframe || context.sampleSize != null ? " · " : null}
              <Link
                href={context.learnHref}
                className="font-semibold underline-offset-2 hover:underline"
              >
                What is this?
              </Link>
            </>
          ) : null}
        </p>
      )}
    </div>
  );
}
