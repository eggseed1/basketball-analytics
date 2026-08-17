import type { CSSProperties, ReactNode } from "react";

import { HistoricalTeamMark } from "@/components/brand/historical-team-mark";
import { PlayerHeadshot } from "@/components/brand/player-headshot";
import { TeamLogo } from "@/components/brand/team-logo";
import { TransitionLink } from "@/components/continuity/query-nav";
import {
  resolveHistoricalTeamBrand,
  type HistoricalTeamBrand,
} from "@/lib/historical-team-brand";
import { resolveTeamBrand, teamChartColor } from "@/lib/nba-brand";
import { playerSeasonChipHref } from "@/lib/player-destination";
import type { ThemeMode } from "@/themes/era-theme";

export type PlayerDestinationIdentityProps = {
  playerId: string;
  displayName: string;
  season: string;
  teamKey?: string | null;
  teamName?: string | null;
  position?: string | null;
  jersey?: string | null;
  /** When set, prefer historical mark / logo over modern franchise branding. */
  historicalBrand?: HistoricalTeamBrand | null;
  /** Resolve chip / row marks via era brands (no modern OKC for Seattle). */
  useHistoricalBranding?: boolean;
  bioBits: string[];
  detailBits: string[];
  seasonOptions: string[];
  seasonTeams: Record<string, string>;
  fromHistory?: boolean;
  themeMode?: ThemeMode;
  backHref: string;
  backLabel?: string;
  children?: ReactNode;
};

/**
 * Layer 1 identity — headshot, name, team, season chips.
 * Stays mounted outside Suspense while core / games stream in.
 */
export function PlayerDestinationIdentity({
  playerId,
  displayName,
  season,
  teamKey,
  teamName,
  historicalBrand,
  useHistoricalBranding = false,
  bioBits,
  detailBits,
  seasonOptions,
  seasonTeams,
  fromHistory = false,
  themeMode = "historical",
  backHref,
  backLabel,
  children,
}: PlayerDestinationIdentityProps) {
  const modernBrand = resolveTeamBrand(teamKey);
  const washPrimary =
    historicalBrand?.palette?.primary ?? modernBrand?.primary;
  const washSecondary =
    historicalBrand?.palette?.secondary ?? modernBrand?.secondary;

  const chipColor = (option: string) => {
    const teamId = seasonTeams[option];
    if (useHistoricalBranding && teamId) {
      const era = resolveHistoricalTeamBrand(teamId, option, "era");
      if (era?.palette?.primary) return era.palette.primary;
    }
    return teamChartColor(teamId).color;
  };

  return (
    <>
      <p>
        <TransitionLink
          href={backHref}
          className="text-[13px] font-semibold text-muted-foreground"
        >
          ←{" "}
          {backLabel ??
            (fromHistory ? "Back to Time Machine" : "Leaderboard")}
        </TransitionLink>
      </p>

      {children}

      <section
        id="overview"
        className="scroll-mt-16 flex flex-col gap-3"
        aria-label="Overview"
      >
        <header
          className="sports-card score-card-wash overflow-hidden px-4 py-5"
          style={
            washPrimary
              ? ({
                  "--away-color": washPrimary,
                  "--home-color": washSecondary ?? washPrimary,
                } as CSSProperties)
              : undefined
          }
        >
          <div className="flex flex-col items-center gap-3 text-center sm:flex-row sm:items-start sm:text-left">
            <PlayerHeadshot
              playerId={playerId}
              name={displayName}
              teamKey={teamKey}
              size="xl"
              priority
            />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Selected season · {season}
              </p>
              <h1 className="text-[26px] font-bold tracking-tight sm:text-[30px]">
                {displayName}
              </h1>
              <p className="flex flex-wrap items-center justify-center gap-2 text-[14px] text-muted-foreground sm:justify-start">
                {historicalBrand ? (
                  <HistoricalTeamMark brand={historicalBrand} size="sm" />
                ) : teamKey ? (
                  <TransitionLink
                    href={`/teams/${encodeURIComponent(teamKey)}`}
                    aria-label={teamName ?? modernBrand?.abbr ?? "Team"}
                    className="inline-flex shrink-0"
                  >
                    <TeamLogo teamKey={teamKey} size="sm" />
                  </TransitionLink>
                ) : null}
                <span>{bioBits.join(" · ") || "Player profile"}</span>
              </p>
              {detailBits.length ? (
                <p className="mt-2 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[12px] text-muted-foreground sm:justify-start">
                  {detailBits.map((line, i) => (
                    <span
                      key={line}
                      className="inline-flex items-center gap-2"
                    >
                      {i > 0 ? (
                        <span className="text-border" aria-hidden>
                          ·
                        </span>
                      ) : null}
                      <span>{line}</span>
                    </span>
                  ))}
                </p>
              ) : (
                <p className="mt-2 text-[12px] text-muted-foreground">
                  Bio details unavailable for this id.
                </p>
              )}
            </div>
          </div>

          {seasonOptions.length > 0 ? (
            <div className="mt-5 border-t border-border pt-4">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Seasons
              </p>
              <div className="flex max-w-full flex-wrap gap-1.5 overflow-x-auto">
                {seasonOptions.map((option) => {
                  const optColor = chipColor(option);
                  const active = option === season;
                  return (
                    <TransitionLink
                      key={option}
                      href={playerSeasonChipHref(playerId, option, {
                        fromHistory,
                        themeMode,
                      })}
                      scroll={false}
                      className={
                        active
                          ? "rounded-md px-3 py-1 text-[12px] font-semibold text-white"
                          : "rounded-md bg-white/55 px-3 py-1 text-[12px] font-semibold text-foreground"
                      }
                      style={
                        active ? { backgroundColor: optColor } : undefined
                      }
                    >
                      {option}
                    </TransitionLink>
                  );
                })}
              </div>
            </div>
          ) : null}
        </header>
      </section>
    </>
  );
}
