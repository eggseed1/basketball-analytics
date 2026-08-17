import type { CSSProperties, ReactNode } from "react";

import { HistoricalTeamMark } from "@/components/brand/historical-team-mark";
import { TeamLogo } from "@/components/brand/team-logo";
import { TransitionLink } from "@/components/continuity/query-nav";
import { askDrblTeamHref } from "@/components/teams/team-ask-links";
import type { StandingRow } from "@/data/types/standings";
import type { TeamSeasonStats } from "@/data/types";
import { formatNumber, formatPct } from "@/lib/format";
import type { HistoricalTeamBrand } from "@/lib/historical-team-brand";
import type { TeamBrand } from "@/lib/nba-brand";
import { seasonChipHref } from "@/lib/team-explorer";
import { teamComparePath } from "@/analytics/compare-team-seasons";

/**
 * Stable team identity frame — name, mark, season chips, jump links.
 * Stays mounted while deep Suspense islands stream below.
 */
export function TeamDestinationIdentity({
  teamId,
  team,
  season,
  seasonChips,
  standing,
  modernBrand,
  historicalBrand,
  useHistoricalMark,
  askTeamId,
  txTeamId,
  priorSeason,
  coverageSummary,
  snapshotExtra,
  boardAvailable = true,
  fromHistory = false,
  themeMode = "historical",
}: {
  teamId: string;
  team: Pick<
    TeamSeasonStats,
    "abbreviation" | "fullName" | "conference" | "ppg" | "avgDiff" | "trueShootingPct"
  >;
  season: string;
  seasonChips: string[];
  standing: StandingRow | null;
  modernBrand?: TeamBrand | null;
  historicalBrand?: HistoricalTeamBrand | null;
  /** Prefer HistoricalTeamMark / historical logoUrl (never modern OKC for Sonics). */
  useHistoricalMark: boolean;
  askTeamId: string;
  txTeamId: string;
  priorSeason: string;
  coverageSummary?: ReactNode;
  snapshotExtra?: string | null;
  /** When false, never display fabricated zero rates — show em dashes. */
  boardAvailable?: boolean;
  fromHistory?: boolean;
  themeMode?: "historical" | "modern";
}) {
  const displayName =
    useHistoricalMark && historicalBrand?.displayName
      ? historicalBrand.displayName
      : team.fullName;
  const displayAbbr =
    useHistoricalMark && historicalBrand?.abbreviation
      ? historicalBrand.abbreviation
      : team.abbreviation;

  const washPrimary =
    useHistoricalMark && historicalBrand?.palette?.primary
      ? historicalBrand.palette.primary
      : modernBrand?.primary;
  const washSecondary =
    useHistoricalMark && historicalBrand?.palette?.secondary
      ? historicalBrand.palette.secondary
      : modernBrand?.secondary;

  const snapshotBits = boardAvailable
    ? [
        standing
          ? `${standing.wins}–${standing.losses}`
          : `${formatNumber(team.ppg, 1)} PPG`,
        `${team.avgDiff >= 0 ? "+" : ""}${formatNumber(team.avgDiff, 1)} diff`,
        `${
          team.trueShootingPct != null && team.trueShootingPct > 0
            ? formatPct(team.trueShootingPct)
            : "—"
        } TS`,
        snapshotExtra,
      ].filter(Boolean)
    : [
        "Season board unavailable",
        snapshotExtra ?? "Identity from team-era map",
      ].filter(Boolean);

  return (
    <section
      id="overview"
      className="scroll-mt-16 flex flex-col gap-4"
      aria-label="Overview"
    >
      <header
        className="sports-card score-card-wash overflow-hidden px-4 py-5 sm:px-5"
        style={
          washPrimary
            ? ({
                "--away-color": washPrimary,
                "--home-color": washSecondary ?? washPrimary,
              } as CSSProperties)
            : undefined
        }
      >
        <div className="flex flex-wrap items-center gap-4">
          {useHistoricalMark && historicalBrand ? (
            <HistoricalTeamMark brand={historicalBrand} size="xl" priority />
          ) : (
            <TeamLogo
              teamKey={team.abbreviation}
              size="xl"
              priority
              logoUrl={historicalBrand?.logoUrl}
              logoSource={historicalBrand?.source}
              textAbbr={historicalBrand?.abbreviation}
              logoPalette={historicalBrand?.palette}
            />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {displayAbbr}
              {team.conference ? ` · ${team.conference}` : ""}
              {standing ? ` · #${standing.rank}` : null} · {season}
            </p>
            <h1 className="text-[28px] font-bold tracking-tight sm:text-[32px]">
              {displayName}
            </h1>
            <p className="mt-1 text-[14px] font-medium text-foreground">
              {snapshotBits.join(" · ")}
            </p>
            {standing ? (
              <p className="mt-1 text-[12px] text-muted-foreground">
                {standing.streak ? `Streak ${standing.streak}` : null}
                {standing.lastTen ? ` · L10 ${standing.lastTen}` : null}
                {" · "}
                <TransitionLink
                  href="/standings"
                  className="font-semibold underline-offset-2 hover:underline"
                >
                  Standings →
                </TransitionLink>
              </p>
            ) : (
              <p className="mt-1 text-[12px] text-muted-foreground">
                Live standings shown for the current season only when available.
              </p>
            )}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-1.5">
          {seasonChips.map((option) => (
            <TransitionLink
              key={option}
              href={seasonChipHref(teamId, option, {
                fromHistory,
                themeMode,
              })}
              scroll={false}
              className={
                option === season
                  ? "rounded-md bg-foreground px-3 py-1 text-[12px] font-semibold text-background"
                  : "rounded-md bg-white/55 px-3 py-1 text-[12px] font-semibold text-foreground"
              }
            >
              {option}
            </TransitionLink>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap gap-3 text-[13px] font-semibold">
          <a href="#performance" className="underline-offset-2 hover:underline">
            Performance →
          </a>
          <a href="#identity" className="underline-offset-2 hover:underline">
            How they win →
          </a>
          <a href="#roster" className="underline-offset-2 hover:underline">
            Roster →
          </a>
          <a href="#games" className="underline-offset-2 hover:underline">
            Games →
          </a>
          <TransitionLink
            href={askDrblTeamHref(
              `${displayName} point differential ${season}`,
              askTeamId
            )}
            className="underline-offset-2 hover:underline"
          >
            Ask DRBL →
          </TransitionLink>
          <TransitionLink
            href={teamComparePath({
              teamA: askTeamId,
              teamB: askTeamId,
              seasonA: season,
              seasonB: priorSeason,
            })}
            className="underline-offset-2 hover:underline"
          >
            Compare seasons →
          </TransitionLink>
          <TransitionLink
            href={`/compare?mode=teams&view=rank&teamId=${encodeURIComponent(askTeamId)}`}
            className="underline-offset-2 hover:underline"
          >
            Rank seasons →
          </TransitionLink>
          <TransitionLink
            href={`/offseason?team=${encodeURIComponent(txTeamId)}`}
            className="underline-offset-2 hover:underline"
          >
            Offseason →
          </TransitionLink>
        </div>

        {coverageSummary ? (
          <p className="mt-4 text-[12px] text-muted-foreground">
            {coverageSummary}
          </p>
        ) : null}
      </header>
    </section>
  );
}
