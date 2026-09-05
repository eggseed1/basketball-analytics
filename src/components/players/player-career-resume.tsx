"use client";

import Link from "next/link";
import { useId, useMemo, type ReactNode } from "react";
import {
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { CareerResume, PeakImpactResult } from "@/analytics";
import { formatCpi } from "@/analytics";
import {
  FrostRechartsTooltip,
  rechartsFrostWrapperStyle,
} from "@/components/brand/frost-recharts-tooltip";
import { TeamLogo } from "@/components/brand/team-logo";
import { TeamWashCard } from "@/components/brand/team-wash-card";
import { MetricHelp } from "@/components/learn/metric-help";
import {
  buildTeamSegmentedChart,
  CareerMonotoneStroke,
  type CareerSeriesPoint,
} from "@/components/players/career-team-trend-chart";
import { type } from "@/lib/design-system";
import { formatNumber } from "@/lib/format";
import { brandAtmosphereColors } from "@/lib/game-matchup-theme";
import { useChartTheme } from "@/lib/chart-theme";
import {
  resolveTeamBrand,
} from "@/lib/nba-brand";
import { brandableTeamKey } from "@/lib/player-team-context";
import { cn } from "@/lib/utils";

/**
 * Visual Career Resume — Peak / Prime / Longevity with franchise team colors.
 */
export function PlayerCareerResume({
  resume,
  peakImpact = null,
  teamKey,
  careerStartTeamKey,
}: {
  resume: CareerResume;
  /** Season-true DARKO / RAPTOR / BPM peak — separate from CPI Peak. */
  peakImpact?: PeakImpactResult | null;
  teamKey?: string | null;
  careerStartTeamKey?: string | null;
}) {
  const chartTheme = useChartTheme();
  const peak = resume.peak;

  const brandKey = brandableTeamKey(teamKey) ?? brandableTeamKey(careerStartTeamKey);
  const brand = resolveTeamBrand(brandKey);
  const accent = chartTheme.teamBarColor(brandKey);
  const wash = brandAtmosphereColors(brand?.primary, brand?.secondary);

  const seriesPoints: CareerSeriesPoint[] = useMemo(() => {
    return [...resume.qualifyingSeasons]
      .sort((a, b) => a.season.localeCompare(b.season))
      .map((s) => {
        const { color, abbr } = chartTheme.teamColor(s.teamId);
        return {
          season: s.season.slice(2),
          fullSeason: s.season,
          value: Number(s.cpi.toFixed(1)),
          teamId: s.teamId,
          teamAbbr: abbr !== "-" ? abbr : s.teamName.slice(0, 3).toUpperCase(),
          color,
          percentile: Math.round(s.ofPeak * 100),
        };
      });
  }, [chartTheme, resume.qualifyingSeasons]);

  const { data, strokeStops, legend } = useMemo(
    () => buildTeamSegmentedChart(seriesPoints),
    [seriesPoints]
  );
  const strokeGradId = `career-resume-stroke-${useId().replace(/:/g, "")}`;

  const peakCpi = peak?.cpi ?? 0;
  const primeFloor = peakCpi * 0.9;
  const longevityFloor = peakCpi * 0.7;
  const peakTeamKey = peak ? brandableTeamKey(peak.teamId) : undefined;

  const franchiseLegend = legend.filter(
    (t) => t.teamId !== "TOT" && t.teamId !== "2TM" && t.teamAbbr !== "-"
  );

  return (
    <TeamWashCard
      teamKey={careerStartTeamKey ?? teamKey}
      secondaryTeamKey={teamKey}
      className="flex flex-col gap-5 p-4 sm:p-5"
    >
      <div className="flex min-w-0 items-center gap-2.5">
        {brandKey ? <TeamLogo teamKey={brandKey} size="sm" /> : null}
        <div className="min-w-0">
          <h2 className={cn(type.heading, "tracking-tight")}>
            <MetricHelp
              conceptId="career_resume"
              labelClassName="font-bold tracking-tight"
            >
              Career resume
            </MetricHelp>
          </h2>
          <p className={cn(type.bodySm, "text-muted-foreground")}>
            Production vs this player&apos;s own peak
          </p>
        </div>
      </div>

      {resume.limitedReason && !peak ? (
        <p className={cn(type.bodySm, "text-muted-foreground")}>
          {resume.limitedReason}
        </p>
      ) : null}

      {peak && data.length > 0 ? (
        <figure className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <LegendSwatch
              color={chartTheme.teamTint(brandKey, 0.14)}
              border={accent}
              label="Longevity ≥70%"
            />
            <LegendSwatch
              color={chartTheme.teamTint(brandKey, 0.28)}
              border={accent}
              label="Prime ≥90%"
            />
            {franchiseLegend.map((t) => (
              <span
                key={t.teamId}
                className={cn(
                  type.caption,
                  "inline-flex items-center gap-1 text-muted-foreground"
                )}
              >
                <TeamLogo teamKey={t.teamId} size="2xs" />
                <span
                  className="size-2 rounded-full"
                  style={{ backgroundColor: t.color }}
                  aria-hidden
                />
                {t.teamAbbr}
              </span>
            ))}
          </div>
          <div className="h-[200px] w-full sm:h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={data}
                margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
              >
                <XAxis
                  dataKey="season"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  domain={[
                    (dataMin: number) =>
                      Math.max(
                        0,
                        Math.floor(Math.min(dataMin, longevityFloor) * 0.85)
                      ),
                    (dataMax: number) =>
                      Math.ceil(Math.max(dataMax, peakCpi) * 1.05),
                  ]}
                  width={36}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  tickFormatter={(v) => formatNumber(Number(v), 0)}
                />
                <Tooltip
                  content={<CareerCpiTooltip />}
                  wrapperStyle={rechartsFrostWrapperStyle}
                  cursor={{ stroke: accent, strokeWidth: 1, strokeOpacity: 0.35 }}
                />
                {peakCpi > 0 ? (
                  <>
                    <ReferenceArea
                      y1={longevityFloor}
                      y2={peakCpi * 1.08}
                      fill={accent}
                      fillOpacity={0.07}
                      ifOverflow="extendDomain"
                    />
                    <ReferenceArea
                      y1={primeFloor}
                      y2={peakCpi * 1.08}
                      fill={accent}
                      fillOpacity={0.14}
                      ifOverflow="extendDomain"
                    />
                    <ReferenceLine
                      y={peakCpi}
                      stroke={accent}
                      strokeDasharray="4 4"
                      strokeOpacity={0.7}
                    />
                  </>
                ) : null}
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke={`url(#${strokeGradId})`}
                  strokeWidth={2.5}
                  isAnimationActive={false}
                  shape={(shapeProps) => (
                    <CareerMonotoneStroke
                      points={shapeProps.points}
                      strokeWidth={shapeProps.strokeWidth}
                      gradientId={strokeGradId}
                      strokeStops={strokeStops}
                    />
                  )}
                  dot={(props) => {
                    const { cx, cy, payload } = props as {
                      cx?: number;
                      cy?: number;
                      payload?: {
                        fullSeason?: string;
                        color?: string;
                        percentile?: number;
                        value?: number;
                      };
                    };
                    if (cx == null || cy == null || !payload) return null;
                    const isPeak = payload.fullSeason === peak.season;
                    const ofPeak =
                      typeof payload.percentile === "number"
                        ? payload.percentile
                        : 0;
                    return (
                      <circle
                        cx={cx}
                        cy={cy}
                        r={isPeak ? 5.5 : ofPeak >= 90 ? 3.75 : 2.75}
                        fill={payload.color ?? accent}
                        stroke={isPeak ? "var(--background)" : undefined}
                        strokeWidth={isPeak ? 2 : 0}
                      />
                    );
                  }}
                  activeDot={{ r: 5, stroke: "var(--background)", strokeWidth: 2 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </figure>
      ) : null}

      {peak ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <ResumeStat
            label={
              <MetricHelp
                conceptId="career_peak"
                labelClassName="font-bold uppercase tracking-wide"
              >
                Peak
              </MetricHelp>
            }
            primary={peak.season}
            secondary={`${formatNumber(peak.breakdown.ppg, 1)} / ${formatNumber(peak.breakdown.rpg, 1)} / ${formatNumber(peak.breakdown.apg, 1)}`}
            tertiary={`CPI ${formatCpi(peak.cpi)}`}
            href={peak.seasonHref}
            accent={chartTheme.teamBarColor(peak.teamId) || accent}
            teamKey={peakTeamKey}
          />
          <ResumeStat
            label={
              <MetricHelp
                conceptId="career_prime"
                labelClassName="font-bold uppercase tracking-wide"
              >
                Prime
              </MetricHelp>
            }
            primary={
              resume.prime?.contiguousFrom && resume.prime?.contiguousTo
                ? `${shortSeason(resume.prime.contiguousFrom)}–${shortSeason(resume.prime.contiguousTo)}`
                : resume.prime
                  ? `${resume.prime.seasonCount} yrs`
                  : "—"
            }
            secondary={
              resume.prime
                ? `${resume.prime.seasonCount} seasons ≥90% of peak`
                : "Need 2+ seasons"
            }
            accent={accent}
          />
          <ResumeStat
            label={
              <MetricHelp
                conceptId="career_longevity"
                labelClassName="font-bold uppercase tracking-wide"
              >
                Longevity
              </MetricHelp>
            }
            primary={
              resume.longevity
                ? `${resume.longevity.seasonCount} seasons`
                : "—"
            }
            secondary="≥70% of peak CPI"
            accent={wash?.colorB ?? accent}
          />
        </div>
      ) : null}

      {peakImpact?.primary ? (
        <div className="rounded-md border border-border/60 frost-surface-muted px-3 py-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className={cn(type.caption, "font-bold uppercase tracking-wide")}>
              Peak Impact
            </p>
            <Link
              href={peakImpact.primary.seasonHref}
              className={cn(
                type.bodySm,
                "font-semibold underline-offset-2 hover:underline"
              )}
            >
              {peakImpact.primary.season} · {peakImpact.primary.metricLabel}{" "}
              {peakImpact.primary.display}
            </Link>
          </div>
          <p className={cn(type.caption, "mt-1 text-muted-foreground")}>
            {peakImpact.note}
          </p>
          {peakImpact.byMetric.raptor &&
          peakImpact.primary.metricId !== "raptor" ? (
            <p className={cn(type.caption, "mt-1 text-muted-foreground")}>
              RAPTOR peak (≤2021-22):{" "}
              <Link
                href={peakImpact.byMetric.raptor.seasonHref}
                className="font-semibold underline-offset-2 hover:underline"
              >
                {peakImpact.byMetric.raptor.season} ·{" "}
                {peakImpact.byMetric.raptor.display}
              </Link>
            </p>
          ) : null}
          {peakImpact.byMetric.bpm &&
          peakImpact.primary.metricId !== "bpm" ? (
            <p className={cn(type.caption, "mt-1 text-muted-foreground")}>
              BPM peak:{" "}
              <Link
                href={peakImpact.byMetric.bpm.seasonHref}
                className="font-semibold underline-offset-2 hover:underline"
              >
                {peakImpact.byMetric.bpm.season} ·{" "}
                {peakImpact.byMetric.bpm.display}
              </Link>
            </p>
          ) : null}
        </div>
      ) : null}

      {resume.incompleteCurrent ? (
        <p className={cn(type.caption, "text-muted-foreground")}>
          {resume.incompleteCurrent.season} ({resume.incompleteCurrent.gamesPlayed}{" "}
          GP) not counted yet.
        </p>
      ) : null}
    </TeamWashCard>
  );
}

function shortSeason(season: string): string {
  return season.length >= 7 ? season.slice(2) : season;
}

function CareerCpiTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{
    value?: number | string;
    color?: string;
    payload?: {
      fullSeason?: string;
      value?: number;
      percentile?: number;
      teamAbbr?: string;
      color?: string;
    };
  }>;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  const color = row?.color ?? payload[0]?.color;
  return (
    <FrostRechartsTooltip active={active} className="w-max max-w-[14rem]">
      <p className={cn(type.caption, "font-semibold text-foreground")}>
        {row?.fullSeason ?? "Season"}
        {row?.teamAbbr ? ` · ${row.teamAbbr}` : ""}
      </p>
      <p
        className={cn(type.caption, "mt-0.5 tabular-nums")}
        style={{ color: color ?? "var(--muted-foreground)" }}
      >
        CPI {formatNumber(Number(row?.value ?? payload[0]?.value), 1)}
        {row?.percentile != null ? ` · ${row.percentile}% of peak` : ""}
      </p>
    </FrostRechartsTooltip>
  );
}

function LegendSwatch({
  color,
  border,
  label,
}: {
  color: string;
  border: string;
  label: string;
}) {
  return (
    <span
      className={cn(
        type.caption,
        "inline-flex items-center gap-1.5 text-muted-foreground"
      )}
    >
      <span
        className="inline-block size-2.5 rounded-[2px]"
        style={{
          backgroundColor: color,
          boxShadow: `inset 0 0 0 1px ${border}`,
        }}
        aria-hidden
      />
      {label}
    </span>
  );
}

function ResumeStat({
  label,
  primary,
  secondary,
  tertiary,
  href,
  accent,
  teamKey,
}: {
  label: ReactNode;
  primary: string;
  secondary: string;
  tertiary?: string;
  href?: string;
  accent: string;
  teamKey?: string | null;
}) {
  const body = (
    <>
      <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 flex items-center gap-1.5 text-[18px] font-bold tracking-tight tabular-nums">
        {teamKey ? <TeamLogo teamKey={teamKey} size="2xs" /> : null}
        {primary}
      </p>
      <p className={cn(type.caption, "text-muted-foreground")}>{secondary}</p>
      {tertiary ? (
        <p
          className={cn(type.caption, "font-semibold tabular-nums")}
          style={{ color: accent }}
        >
          {tertiary}
        </p>
      ) : null}
    </>
  );
  const className =
    "rounded-md frost-surface px-3 py-3 backdrop-blur-sm transition-colors frost-surface-hover";
  const style = {
    boxShadow: `inset 3px 0 0 ${accent}`,
  } as const;

  if (href) {
    return (
      <Link href={href} scroll={false} className={className} style={style}>
        {body}
      </Link>
    );
  }
  return (
    <div className={className} style={style}>
      {body}
    </div>
  );
}
