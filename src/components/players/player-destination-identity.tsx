import { Suspense, type ReactNode } from "react";

import {
  GlassSurface,
  type GlassSurfaceHonor,
} from "@/components/brand/glass-surface";
import { HistoricalTeamMark } from "@/components/brand/historical-team-mark";
import { PlayerHeadshot } from "@/components/brand/player-headshot";
import { TextLink } from "@/components/ui/text-link";
import { TeamLogo } from "@/components/brand/team-logo";
import { PlayerDepthNav } from "@/components/players/player-depth-nav";
import { PlayerDraftLine } from "@/components/players/player-draft-line";
import { PlayerIdentityVitals } from "@/components/players/player-identity-vitals";
import { PlayerTeamPositionLine } from "@/components/players/player-team-position-line";
import { PlayerUpcomingGamesFromSnapshot } from "@/components/players/player-upcoming-games-island";
import { PlayerViewSeasonProvider } from "@/components/players/player-view-season";
import { TeamIdentity } from "@/components/teams/team-identity";
import type { PlayerSeason } from "@/data/types";
import type { PlayerCardStint } from "@/lib/player-team-context";
import { formatNumber, formatPct } from "@/lib/format";
import { type HistoricalTeamBrand } from "@/lib/historical-team-brand";
import { brandAtmosphereColors } from "@/lib/game-matchup-theme";
import { getCanonicalTeamOrUndefined } from "@/lib/team-identity";
import { type, textLinkClassName } from "@/lib/design-system";
import { resolveTeamBrand } from "@/lib/nba-brand";
import {
  playerSeasonChipHref,
  type PlayerSeasonKind,
} from "@/lib/player-destination";
import {
  type PlayerPageCapabilities,
  type PlayerPageView,
} from "@/lib/player-page-contract";
import type { ThemeMode } from "@/themes/era-theme";
import { cn } from "@/lib/utils";

function formatPerGame(total: number, games: number) {
  if (!Number.isFinite(total) || games <= 0) return "-";
  return formatNumber(total / games, 1);
}

export type PlayerDestinationIdentityProps = {
  playerId: string;
  espnId?: string | null;
  nbaId?: string | null;
  displayName: string;
  season: string;
  teamKey?: string | null;
  teamName?: string | null;
  position?: string | null;
  seasonStints?: PlayerCardStint[];
  showCareerTeams?: boolean;
  careerTeamStints?: PlayerCardStint[];
  heightLabel?: string | null;
  weightLabel?: string | null;
  birthDate?: string | null;
  draftInfo?: string | null;
  college?: string | null;
  portraitUrl?: string | null;
  historicalBrand?: HistoricalTeamBrand | null;
  useHistoricalBranding?: boolean;
  seasonOptions: string[];
  recentSeasons?: PlayerSeason[];
  fromHistory?: boolean;
  themeMode?: ThemeMode;
  view?: PlayerPageView;
  caps: PlayerPageCapabilities;
  seasonType?: PlayerSeasonKind;
  accolades?: ReactNode;
  upcomingSchedule?: ReactNode;
  frontOffice?: ReactNode;
  honor?: GlassSurfaceHonor;
  children?: ReactNode;
  hero?: ReactNode;
};

export function PlayerDestinationIdentity({
  playerId,
  espnId,
  nbaId,
  displayName,
  season,
  teamKey,
  teamName,
  position,
  seasonStints = [],
  showCareerTeams = false,
  careerTeamStints = [],
  heightLabel,
  weightLabel,
  birthDate,
  draftInfo,
  college,
  portraitUrl = null,
  historicalBrand,
  useHistoricalBranding = false,
  seasonOptions,
  recentSeasons = [],
  fromHistory = false,
  themeMode = "historical",
  view = "overview",
  caps,
  seasonType = "regular",
  accolades = null,
  upcomingSchedule = null,
  frontOffice = null,
  honor,
  children,
  hero,
}: PlayerDestinationIdentityProps) {
  const modernBrand = resolveTeamBrand(teamKey);
  const wash = brandAtmosphereColors(
    historicalBrand?.palette?.primary ?? modernBrand?.primary,
    historicalBrand?.palette?.secondary ?? modernBrand?.secondary
  );
  const clubName =
    historicalBrand?.displayName ??
    getCanonicalTeamOrUndefined(teamKey ?? undefined)?.displayName ??
    teamName ??
    modernBrand?.abbr;

  const useTwoColumnLayout = Boolean(hero);

  // The parent used to omit this island entirely when a bounded career fetch
  // had not yet produced the current-season row. For active players, mount the
  // island anyway and let its own identity/team fallbacks resolve the schedule.
  const upcomingNode =
    upcomingSchedule ??
    (!showCareerTeams && teamKey ? (
      <Suspense fallback={null}>
        <PlayerUpcomingGamesFromSnapshot scheduleTeamKey={teamKey} />
      </Suspense>
    ) : null);

  return (
    <PlayerViewSeasonProvider
      initialSeason={season}
      seasonOptions={seasonOptions}
    >
      {children ? <div className="min-w-0">{children}</div> : null}

      <section
        id="overview"
        className="scroll-mt-16 flex flex-col gap-4"
        aria-label="Overview"
      >
        <div
          className={cn(
            "grid items-start gap-4",
            useTwoColumnLayout &&
              "min-[800px]:grid-cols-[minmax(16rem,20rem)_minmax(0,1fr)]"
          )}
        >
          <div className="flex w-full min-w-0 flex-col gap-3">
            <GlassSurface
              as="header"
              accentColor={wash?.colorA}
              accentColorB={wash?.colorB}
              className="relative flex w-full min-w-0 flex-col p-0"
              effect="css"
              backdropBlur={16}
              honor={honor}
            >
              <div
                className={cn(
                  "relative z-[1] flex w-full min-w-0 flex-col gap-2 px-3 py-3",
                  // Sidebar identity stays stacked; only full-width heroes go row.
                  !useTwoColumnLayout &&
                    "sm:flex-row sm:items-start sm:gap-3 sm:text-left"
                )}
              >
                <PlayerHeadshot
                  playerId={playerId}
                  espnId={espnId}
                  nbaId={nbaId}
                  name={displayName}
                  teamKey={teamKey}
                  portraitUrl={portraitUrl}
                  // Only lock to registry when we actually have a verified URL.
                  // On Cloudflare, a null portrait + registryOnly rendered initials.
                  registryOnly={Boolean(portraitUrl)}
                  size="md"
                  priority
                  className={cn(
                    "mx-auto shrink-0",
                    !useTwoColumnLayout && "sm:mx-0"
                  )}
                />
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <div
                    className={cn(
                      "min-w-0 text-center",
                      !useTwoColumnLayout && "sm:text-left"
                    )}
                  >
                    <h1 className={cn(type.heading, "wrap-break-word")}>
                      {displayName}
                    </h1>
                    {showCareerTeams && careerTeamStints.length > 0 ? (
                      <PlayerTeamPositionLine
                        stints={careerTeamStints}
                        season={null}
                        useHistoricalBranding={false}
                        className={cn(
                          "mt-0.5 justify-center",
                          !useTwoColumnLayout && "sm:justify-start"
                        )}
                        aria-label="Career teams"
                      />
                    ) : seasonStints.length > 1 ? (
                      <PlayerTeamPositionLine
                        stints={seasonStints}
                        season={season}
                        fallbackPosition={position}
                        useHistoricalBranding={useHistoricalBranding}
                        className={cn(
                          "mt-0.5 justify-center",
                          !useTwoColumnLayout && "sm:justify-start"
                        )}
                      />
                    ) : (
                      <p
                        className={cn(
                          type.bodySm,
                          "mt-0.5 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-muted-foreground",
                          !useTwoColumnLayout && "sm:justify-start"
                        )}
                      >
                        {teamKey ? (
                          <TeamIdentity
                            teamKey={teamKey}
                            label={
                              clubName ?? teamName ?? modernBrand?.abbr ?? "Team"
                            }
                            className="inline-flex min-w-0"
                            nameClassName={cn(type.bodySm, "gap-2")}
                          >
                            {historicalBrand ? (
                              <HistoricalTeamMark
                                brand={historicalBrand}
                                size="sm"
                              />
                            ) : (
                              <TeamLogo teamKey={teamKey} size="sm" />
                            )}
                            {clubName ? (
                              <span className={textLinkClassName}>
                                {clubName}
                              </span>
                            ) : null}
                          </TeamIdentity>
                        ) : historicalBrand ? (
                          <HistoricalTeamMark brand={historicalBrand} size="sm" />
                        ) : null}
                        {position ? <span>· {position}</span> : null}
                      </p>
                    )}
                    <PlayerIdentityVitals
                      heightLabel={heightLabel}
                      weightLabel={weightLabel}
                      birthDate={birthDate}
                      season={season}
                      college={college}
                      className={cn(
                        "items-center",
                        !useTwoColumnLayout && "sm:items-start"
                      )}
                    />
                    <PlayerDraftLine
                      draftInfo={draftInfo}
                      className={cn(
                        "mt-0.5 justify-center",
                        !useTwoColumnLayout && "sm:justify-start"
                      )}
                    />
                  </div>
                  {accolades ? (
                    <div className="flex min-w-0 w-full justify-center">
                      {accolades}
                    </div>
                  ) : null}
                </div>
              </div>
            </GlassSurface>

            {recentSeasons.length > 0 ? (
              <GlassSurface
                accentColor={wash?.colorA}
                accentColorB={wash?.colorB}
                className="relative w-full min-w-0 p-0"
                effect="css"
                honor={honor}
              >
                <div className="relative z-[1] w-full px-3 py-2.5">
                  <p
                    className={cn(
                      type.caption,
                      "mb-2 font-semibold uppercase tracking-wide text-muted-foreground"
                    )}
                  >
                    Per game average
                  </p>
                  <table className="w-full text-left">
                    <thead className={cn(type.caption, "uppercase tracking-wide text-muted-foreground")}>
                      <tr>
                        <th className="pb-1 pr-2 font-semibold">Season</th>
                        <th className="px-1.5 pb-1 text-right font-semibold">PPG</th>
                        <th className="px-1.5 pb-1 text-right font-semibold">APG</th>
                        <th className="px-1.5 pb-1 text-right font-semibold">RPG</th>
                        <th className="pb-1 pl-1.5 text-right font-semibold">TS%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentSeasons.map((row) => (
                        <tr key={`${row.season}-${row.teamId}`}>
                          <td className="py-1 pr-2">
                            <TextLink
                              href={playerSeasonChipHref(playerId, row.season, {
                                fromHistory,
                                themeMode,
                                view,
                                seasonType,
                              })}
                              scroll={false}
                              className={type.caption}
                            >
                              {row.season}
                            </TextLink>
                          </td>
                          <td className={cn(type.caption, "px-1.5 py-1 text-right tabular-nums")}>
                            {formatPerGame(row.points, row.gamesPlayed)}
                          </td>
                          <td className={cn(type.caption, "px-1.5 py-1 text-right tabular-nums")}>
                            {formatPerGame(row.assists, row.gamesPlayed)}
                          </td>
                          <td className={cn(type.caption, "px-1.5 py-1 text-right tabular-nums")}>
                            {formatPerGame(row.rebounds, row.gamesPlayed)}
                          </td>
                          <td className={cn(type.caption, "py-1 pl-1.5 text-right tabular-nums")}>
                            {row.trueShootingPct != null && row.trueShootingPct > 0
                              ? formatPct(row.trueShootingPct)
                              : "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {upcomingNode ? (
                    <>
                      <div className="my-3 h-px bg-border/70" aria-hidden />
                      {upcomingNode}
                    </>
                  ) : null}
                </div>
              </GlassSurface>
            ) : upcomingNode ? (
              <GlassSurface
                accentColor={wash?.colorA}
                accentColorB={wash?.colorB}
                className="relative w-full min-w-0 p-0"
                effect="css"
                honor={honor}
              >
                <div className="relative z-[1] w-full px-3 py-2.5">
                  {upcomingNode}
                </div>
              </GlassSurface>
            ) : null}

            {frontOffice}
          </div>

          {hero ? <div className="min-h-0 min-w-0">{hero}</div> : null}
        </div>

        <PlayerDepthNav
          playerId={playerId}
          season={season}
          view={view}
          caps={caps}
          seasonType={seasonType}
          fromHistory={fromHistory}
          themeMode={themeMode}
        />
      </section>
    </PlayerViewSeasonProvider>
  );
}
