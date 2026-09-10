import type { AnalyticalFinding, TeamTrait } from "@/analytics";
import { StatDisclosure } from "@/components/analytics/stat-disclosure";
import { GlassSurface } from "@/components/brand/glass-surface";
import { type } from "@/lib/design-system";
import { formatNumber, formatOrdinal } from "@/lib/format";
import { percentileSavantColor } from "@/lib/player-grade";
import {
  formatRankLine,
  type RankedMetric,
} from "@/lib/team-page-metrics";
import { cn } from "@/lib/utils";

function MetricCard({ metric }: { metric: RankedMetric }) {
  return (
    <div className="rounded-md frost-surface px-3 py-3">
      <p
        className={cn(
          type.caption,
          "font-semibold uppercase tracking-wide text-muted-foreground"
        )}
      >
        {metric.label}
      </p>
      <p className={cn(type.page, "mt-1 tabular-nums")}>
        {metric.formattedValue}
      </p>
      <p className={cn(type.caption, "mt-1 text-muted-foreground")}>
        {formatRankLine(metric)}
      </p>
      {metric.differenceFromAverage != null && metric.missingReason == null ? (
        <p className={cn(type.caption, "text-muted-foreground")}>
          {metric.differenceFromAverage >= 0 ? "+" : ""}
          {formatNumber(metric.differenceFromAverage, 2)} vs league avg
        </p>
      ) : null}
      {metric.previousFormatted ? (
        <p className={cn(type.caption, "text-muted-foreground")}>
          {metric.previousFormatted}
        </p>
      ) : null}
    </div>
  );
}

function PercentileRow({ metric }: { metric: RankedMetric }) {
  if (metric.missingReason || metric.percentile == null) return null;
  const pct = Math.max(0, Math.min(100, metric.percentile));
  return (
    <div className="grid grid-cols-[minmax(7rem,9rem)_minmax(0,1fr)_3.5rem] items-center gap-x-2 px-1 py-1.5">
      <span className={cn(type.bodySm, "text-right font-semibold")}>
        {metric.label}
      </span>
      <span className="relative mx-2 flex h-7 min-w-0 items-center">
        <span
          className="absolute inset-y-[8px] rounded-full bg-foreground/[0.08]"
          style={{ left: 8, right: 8 }}
          aria-hidden
        />
        <span
          className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background"
          style={{
            left: `calc(8px + (100% - 16px) * ${pct / 100})`,
            backgroundColor: percentileSavantColor(pct),
          }}
          aria-hidden
        />
      </span>
      <span className={cn(type.caption, "tabular-nums")}>
        {Math.round(pct)}
      </span>
    </div>
  );
}

export function TeamOverviewBoard({
  offense,
  defense,
  factors,
  strengths,
  weaknesses,
  howTheyWin,
  traits,
}: {
  offense: RankedMetric[];
  defense: RankedMetric[];
  factors: RankedMetric[];
  strengths: TeamTrait[];
  weaknesses: TeamTrait[];
  howTheyWin: AnalyticalFinding[];
  traits: TeamTrait[];
}) {
  return (
    <div className="flex flex-col gap-4">
      <GlassSurface effect="css" className="flex flex-col gap-3 p-4 sm:p-5">
        <div>
          <h2 className={type.heading}>Strengths and weaknesses</h2>
          <p className={cn(type.bodySm, "mt-1 text-muted-foreground")}>
            Top and bottom league percentiles on this board. Adjectives only
            when the rank supports them.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p
              className={cn(
                type.caption,
                "font-semibold uppercase tracking-wide text-muted-foreground"
              )}
            >
              Strengths
            </p>
            <ul className="mt-2 flex flex-col gap-2">
              {strengths.slice(0, 3).map((t) => (
                <li key={t.id} className="rounded-md frost-surface px-3 py-2">
                  <p className={cn(type.bodySm, "font-semibold")}>{t.label}</p>
                  <p className={cn(type.caption, "text-muted-foreground")}>
                    {t.display} · {formatOrdinal(Math.round(t.percentile))} pct
                  </p>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p
              className={cn(
                type.caption,
                "font-semibold uppercase tracking-wide text-muted-foreground"
              )}
            >
              Weaknesses
            </p>
            <ul className="mt-2 flex flex-col gap-2">
              {weaknesses.slice(0, 3).map((t) => (
                <li key={t.id} className="rounded-md frost-surface px-3 py-2">
                  <p className={cn(type.bodySm, "font-semibold")}>{t.label}</p>
                  <p className={cn(type.caption, "text-muted-foreground")}>
                    {t.display} · {formatOrdinal(Math.round(t.percentile))} pct
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </div>
        {howTheyWin.length ? (
          <ul className="flex flex-col gap-2">
            {howTheyWin.map((finding) => (
              <li key={finding.id} className="rounded-md bg-secondary/50 px-3 py-3">
                <p
                  className={cn(
                    type.caption,
                    "font-bold uppercase tracking-wide text-muted-foreground"
                  )}
                >
                  {finding.eyebrow}
                </p>
                <p className={cn(type.bodySm, "font-semibold")}>
                  {finding.title}
                </p>
                <p className={cn(type.bodySm, "mt-1 text-muted-foreground")}>
                  {finding.body}
                </p>
              </li>
            ))}
          </ul>
        ) : null}
      </GlassSurface>

      <div className="grid gap-4 lg:grid-cols-2">
        <GlassSurface effect="css" className="flex flex-col gap-2 p-4">
          <h2 className={type.heading}>Offense profile</h2>
          {offense.map((m) => (
            <PercentileRow key={`off-${m.key}`} metric={m} />
          ))}
        </GlassSurface>
        <GlassSurface effect="css" className="flex flex-col gap-2 p-4">
          <h2 className={type.heading}>Defense profile</h2>
          {defense.map((m) => (
            <PercentileRow key={`def-${m.key}`} metric={m} />
          ))}
        </GlassSurface>
      </div>

      <GlassSurface effect="css" className="flex flex-col gap-3 p-4 sm:p-5">
        <div>
          <h2 className={type.heading}>Four factors</h2>
          <p className={cn(type.bodySm, "mt-1 text-muted-foreground")}>
            eFG%, turnovers per game, offensive rebound %, free throws per FGA.
            Opponent four factors need a tracking feed.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {factors.map((metric) => (
            <MetricCard key={`ff-${metric.key}`} metric={metric} />
          ))}
        </div>
      </GlassSurface>

      {traits.length ? (
        <GlassSurface effect="css" className="flex flex-col gap-3 p-4 sm:p-5">
          <div>
            <h2 className={type.heading}>Board context</h2>
            <p className={cn(type.bodySm, "mt-1 text-muted-foreground")}>
              Level-2 disclosure on every trait. All Stats holds the full
              ledger.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {traits.slice(0, 6).map((trait) => (
              <div key={trait.id} className="rounded-md frost-surface px-3 py-3">
                <StatDisclosure
                  label={trait.label}
                  context={trait.context}
                  conceptId={
                    trait.id === "3par"
                      ? "three_par"
                      : trait.id === "asttov"
                        ? "ast_to"
                        : trait.id === "opp"
                          ? "opp_ppg"
                          : trait.id
                  }
                />
              </div>
            ))}
          </div>
        </GlassSurface>
      ) : null}
    </div>
  );
}
