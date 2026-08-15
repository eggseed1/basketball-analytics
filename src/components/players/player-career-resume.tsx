"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";

import type { CareerResume } from "@/analytics";
import { formatCpi, formatOfPeak, formatTsContext } from "@/analytics";
import { TeamWashCard } from "@/components/brand/team-wash-card";
import { MetricHelp } from "@/components/learn/metric-help";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Compact Career Resume — Peak / Prime / Longevity with progressive disclosure.
 */
export function PlayerCareerResume({
  resume,
  teamKey,
  careerStartTeamKey,
  evolutionAnchorId = "player-evolution",
  seasonsAnchorId = "seasons",
}: {
  resume: CareerResume;
  /** Current / viewing season team. */
  teamKey?: string | null;
  /** Earliest career team — pairs with teamKey for the wash. */
  careerStartTeamKey?: string | null;
  /** In-page anchor for the evolution panel. */
  evolutionAnchorId?: string;
  /** In-page anchor for the season explorer. */
  seasonsAnchorId?: string;
}) {
  const [showWhy, setShowWhy] = useState(false);
  const [showMethod, setShowMethod] = useState(false);
  const m = resume.methodology;
  const peak = resume.peak;

  return (
    <TeamWashCard
      teamKey={careerStartTeamKey ?? teamKey}
      secondaryTeamKey={teamKey}
      className="flex flex-col gap-4 p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-[17px] font-bold tracking-tight">
            <MetricHelp
              conceptId="career_resume"
              labelClassName="font-bold tracking-tight"
            >
              Career resume
            </MetricHelp>
          </h2>
          <p className="text-[13px] text-muted-foreground">
            <MetricHelp conceptId="career_peak">Peak</MetricHelp>
            {" · "}
            <MetricHelp conceptId="career_prime">Prime</MetricHelp>
            {" · "}
            <MetricHelp conceptId="career_longevity">Longevity</MetricHelp>
            {" — "}
            <MetricHelp conceptId="career_self_comparison">
              relative to this player&apos;s own peak
            </MetricHelp>
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowMethod((v) => !v)}
          className="text-[12px] font-semibold text-muted-foreground underline-offset-2 hover:underline"
          aria-expanded={showMethod}
        >
          How is this calculated?
        </button>
      </div>

      {showMethod ? (
        <div
          className="rounded-md border border-border bg-secondary/40 px-3 py-3 text-[12px] leading-relaxed text-muted-foreground"
          role="region"
          aria-label="Career resume methodology"
        >
          <p>
            <span className="font-semibold text-foreground">
              {m.primaryMetric}
            </span>{" "}
            (v{m.version}): {m.cpiFormula}
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-4">
            <li>{m.peakDefinition}</li>
            <li>{m.primeDefinition}</li>
            <li>{m.longevityDefinition}</li>
            <li>{m.qualifyingRule}</li>
          </ul>
          <p className="mt-2">{m.populationNote}</p>
          <p className="mt-1">{m.impactCaveat}</p>
          <p className="mt-2">
            Bands overlap: Peak ⊂ Prime ⊂ Longevity.{" "}
            <Link
              href="/learn/peak-prime-longevity"
              className="font-semibold text-foreground underline-offset-2 hover:underline"
            >
              Learn Peak, Prime &amp; Longevity →
            </Link>
          </p>
        </div>
      ) : null}

      {resume.limitedReason && !peak ? (
        <p className="text-[13px] text-muted-foreground">{resume.limitedReason}</p>
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
            secondary={`CPI ${formatCpi(peak.cpi)}`}
            tertiary={
              formatTsContext(peak.breakdown.ts)
                ? `TS% ${formatTsContext(peak.breakdown.ts)}`
                : `${formatNumber(peak.breakdown.ppg, 1)} PPG`
            }
            href={peak.seasonHref}
            hrefLabel="View season →"
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
              resume.prime
                ? resume.prime.contiguousFrom && resume.prime.contiguousTo
                  ? `${resume.prime.contiguousFrom} → ${resume.prime.contiguousTo}`
                  : `${resume.prime.seasonCount} season${resume.prime.seasonCount === 1 ? "" : "s"}`
                : "—"
            }
            secondary={
              resume.prime
                ? `${resume.prime.contiguousCount} contiguous · ${resume.prime.seasonCount} ≥90% of peak`
                : resume.limitedReason
                  ? "Need 2+ seasons"
                  : "—"
            }
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
                ? `${resume.longevity.seasonCount} season${resume.longevity.seasonCount === 1 ? "" : "s"}`
                : "—"
            }
            secondary={
              resume.longevity
                ? `≥70% of peak CPI`
                : resume.limitedReason
                  ? "Need 2+ seasons"
                  : "—"
            }
          />
        </div>
      ) : null}

      {resume.incompleteCurrent ? (
        <p className="text-[12px] text-muted-foreground">
          {resume.incompleteCurrent.season} is underway (
          {resume.incompleteCurrent.gamesPlayed} GP) and is not counted in Peak /
          Prime / Longevity yet.
        </p>
      ) : null}

      {resume.trajectory.phases.length ? (
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            <MetricHelp
              conceptId="career_arc"
              labelClassName="font-bold uppercase tracking-wide"
            >
              Career arc
            </MetricHelp>
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-foreground">
            {resume.trajectory.phases
              .filter((p) => p.id !== "current")
              .map((p) => p.label)
              .join(" → ")}
            {resume.trajectory.phases.some((p) => p.id === "current")
              ? ` → Current (${resume.trajectory.phases.find((p) => p.id === "current")!.seasonFrom})`
              : null}
          </p>
          <p className="mt-1 text-[12px] text-muted-foreground">
            {resume.trajectory.summary} Trajectory phases describe arc shape —
            not separate scoring thresholds.{" "}
            <MetricHelp conceptId="career_development">Development</MetricHelp>{" "}
            is descriptive in Career Resume v1.
          </p>
        </div>
      ) : null}

      {resume.transitions.length ? (
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            Biggest career changes
          </p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {resume.transitions.map((t) => (
              <li
                key={`${t.fromSeason}-${t.toSeason}-${t.label}`}
                className="flex flex-wrap items-baseline justify-between gap-2 text-[13px]"
              >
                <span>
                  <Link
                    href={t.href}
                    scroll={false}
                    className="font-semibold underline-offset-2 hover:underline"
                  >
                    {t.fromSeason} → {t.toSeason}
                  </Link>
                  <span className="text-muted-foreground"> · {t.label}</span>
                </span>
                <span className="font-bold tabular-nums">{t.deltaDisplay}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setShowWhy((v) => !v)}
          className="rounded-md bg-secondary px-3 py-1.5 text-[13px] font-semibold"
          aria-expanded={showWhy}
        >
          {showWhy ? "Hide qualifying seasons" : "Show qualifying seasons"}
        </button>
        <button
          type="button"
          onClick={() => {
            document
              .getElementById(seasonsAnchorId)
              ?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
          className="text-[12px] font-semibold underline-offset-2 hover:underline"
        >
          Explore career →
        </button>
        <button
          type="button"
          onClick={() => {
            document
              .getElementById(evolutionAnchorId)
              ?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
          className="text-[12px] font-semibold underline-offset-2 hover:underline"
        >
          Explore evolution →
        </button>
        <Link
          href={`/compare?a=${resume.playerId}`}
          className="text-[12px] font-semibold underline-offset-2 hover:underline"
        >
          Compare players →
        </Link>
        {peak ? (
          <>
            <Link
              href={peak.seasonHref}
              scroll={false}
              className="text-[12px] font-semibold text-muted-foreground underline-offset-2 hover:underline"
            >
              Open peak season →
            </Link>
            {(() => {
              const alts = [...resume.qualifyingSeasons]
                .filter((s) => s.season !== peak.season)
                .sort((a, b) => b.cpi - a.cpi)
                .slice(0, 3)
                .map((s) => s.season);
              const rankSeasons = [peak.season, ...alts];
              return (
                <>
                  <Link
                    href={`/players/${resume.playerId}/season-compare?a=${encodeURIComponent(peak.season)}${
                      alts[0]
                        ? `&b=${encodeURIComponent(alts[0])}`
                        : ""
                    }`}
                    className="text-[12px] font-semibold underline-offset-2 hover:underline"
                  >
                    Compare this season →
                  </Link>
                  {rankSeasons.length >= 2 ? (
                    <Link
                      href={`/players/${resume.playerId}/season-rank?seasons=${rankSeasons
                        .map(encodeURIComponent)
                        .join(",")}`}
                      className="text-[12px] font-semibold underline-offset-2 hover:underline"
                    >
                      Rank my seasons →
                    </Link>
                  ) : null}
                </>
              );
            })()}
          </>
        ) : null}
      </div>

      {showWhy ? (
        <div
          className="overflow-x-auto rounded-md border border-border"
          role="region"
          aria-label="Qualifying seasons"
        >
          <table className="w-full min-w-[520px] text-left text-[12px]">
            <thead className="border-b border-border bg-secondary/50 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Season</th>
                <th className="px-2 py-2 text-right">GP</th>
                <th className="px-2 py-2 text-right">CPI</th>
                <th className="px-2 py-2 text-right">vs peak</th>
                <th className="px-2 py-2 text-right">TS%</th>
                <th className="px-3 py-2">Band</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {[...resume.qualifyingSeasons]
                .sort((a, b) => b.season.localeCompare(a.season))
                .map((s) => (
                  <tr key={s.season} className="hover:bg-secondary/30">
                    <td className="px-3 py-2 font-semibold">
                      <Link
                        href={s.seasonHref}
                        scroll={false}
                        className="underline-offset-2 hover:underline"
                      >
                        {s.season}
                      </Link>
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {s.gamesPlayed}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {formatCpi(s.cpi)}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {formatOfPeak(s.ofPeak)}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {formatTsContext(s.breakdown.ts) ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={cn(
                          "text-[11px] font-semibold",
                          s.season === peak?.season && "text-foreground",
                          s.inPrimeBand &&
                            s.season !== peak?.season &&
                            "text-foreground",
                          !s.inLongevityBand && "text-muted-foreground"
                        )}
                      >
                        {bandLabel(s, peak?.season)}
                      </span>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          <p className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
            Bands overlap (Peak ⊂ Prime ⊂ Longevity).{" "}
            <MetricHelp conceptId="longevity_only">Longevity-only</MetricHelp>{" "}
            means 70–89% of peak.
          </p>
        </div>
      ) : null}
    </TeamWashCard>
  );
}

function bandLabel(
  s: CareerResume["qualifyingSeasons"][number],
  peakSeason?: string
): string {
  if (peakSeason && s.season === peakSeason) {
    return "Peak · Prime · Longevity";
  }
  if (s.inPrimeBand) return "Prime · Longevity";
  if (s.inLongevityBand) return "Longevity-only";
  return "Below longevity";
}

function ResumeStat({
  label,
  primary,
  secondary,
  tertiary,
  href,
  hrefLabel,
}: {
  label: ReactNode;
  primary: string;
  secondary: string;
  tertiary?: string;
  href?: string;
  hrefLabel?: string;
}) {
  return (
    <div className="rounded-md bg-secondary/50 px-3 py-3">
      <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-[16px] font-bold tracking-tight">{primary}</p>
      <p className="text-[12px] text-muted-foreground">{secondary}</p>
      {tertiary ? (
        <p className="text-[11px] text-muted-foreground">{tertiary}</p>
      ) : null}
      {href && hrefLabel ? (
        <Link
          href={href}
          scroll={false}
          className="mt-2 inline-block text-[12px] font-semibold underline-offset-2 hover:underline"
        >
          {hrefLabel}
        </Link>
      ) : null}
    </div>
  );
}
