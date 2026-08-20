import { GlassSurface } from "@/components/brand/glass-surface";
import { HistoricalTeamMark } from "@/components/brand/historical-team-mark";
import { TeamLogo } from "@/components/brand/team-logo";
import { TransitionLink } from "@/components/continuity/query-nav";
import type { StandingRow } from "@/data/types/standings";
import type { TeamSeasonStats } from "@/data/types";
import { formatNumber, formatPct } from "@/lib/format";
import type { HistoricalTeamBrand } from "@/lib/historical-team-brand";
import { brandAtmosphereColors } from "@/lib/game-matchup-theme";
import type { TeamBrand } from "@/lib/nba-brand";
import { seasonChipHref } from "@/lib/team-explorer";
import {
  teamPageHref,
  type TeamPageHrefOpts,
} from "@/lib/team-destination";

/**
 * Stable team identity frame - name, mark, season chips.
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
  snapshotExtra,
  boardAvailable = true,
  fromHistory = false,
  themeMode = "historical",
  hrefOpts,
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
  snapshotExtra?: string | null;
  /** When false, never display fabricated zero rates - show "-" placeholders. */
  boardAvailable?: boolean;
  fromHistory?: boolean;
  themeMode?: "historical" | "modern";
  hrefOpts?: TeamPageHrefOpts;
}) {
  const displayName =
    useHistoricalMark && historicalBrand?.displayName
      ? historicalBrand.displayName
      : team.fullName;
  const displayAbbr =
    useHistoricalMark && historicalBrand?.abbreviation
      ? historicalBrand.abbreviation
      : team.abbreviation;

  const wash = brandAtmosphereColors(
    useHistoricalMark && historicalBrand?.palette?.primary
      ? historicalBrand.palette.primary
      : modernBrand?.primary,
    useHistoricalMark && historicalBrand?.palette?.secondary
      ? historicalBrand.palette.secondary
      : modernBrand?.secondary
  );

  const snapshotBits = boardAvailable
    ? [
        standing
          ? `${standing.wins}-${standing.losses}`
          : `${formatNumber(team.ppg, 1)} PPG`,
        `${team.avgDiff >= 0 ? "+" : ""}${formatNumber(team.avgDiff, 1)} diff`,
        `${
          team.trueShootingPct != null && team.trueShootingPct > 0
            ? formatPct(team.trueShootingPct)
            : "-"
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
      <GlassSurface
        as="header"
        accentColor={wash?.colorA}
        accentColorB={wash?.colorB}
        className="px-4 py-5 sm:px-5"
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
            <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
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
              href={
                hrefOpts
                  ? teamPageHref(teamId, { ...hrefOpts, season: option })
                  : seasonChipHref(teamId, option, {
                      fromHistory,
                      themeMode,
                    })
              }
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
      </GlassSurface>
    </section>
  );
}
