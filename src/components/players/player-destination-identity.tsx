import type { ReactNode } from "react";

import { GlassSurface } from "@/components/brand/glass-surface";
import { HistoricalTeamMark } from "@/components/brand/historical-team-mark";
import { PlayerHeadshot } from "@/components/brand/player-headshot";
import { TextLink } from "@/components/ui/text-link";
import { TeamLogo } from "@/components/brand/team-logo";
import { PlayerDepthNav } from "@/components/players/player-depth-nav";
import { PlayerDraftLine } from "@/components/players/player-draft-line";
import { PlayerIdentityVitals } from "@/components/players/player-identity-vitals";
import { PlayerTeamPositionLine } from "@/components/players/player-team-position-line";
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
  /** Franchise stops this season; last item brands the card. */
  seasonStints?: PlayerCardStint[];
  heightLabel?: string | null;
  weightLabel?: string | null;
  birthDate?: string | null;
  draftInfo?: string | null;
  college?: string | null;
  /** Precomputed verified portrait from media registry. */
  portraitUrl?: string | null;
  /** When set, prefer historical mark / logo over modern franchise branding. */
  historicalBrand?: HistoricalTeamBrand | null;
  /** Resolve chip / row marks via era brands (no modern OKC for Seattle). */
  useHistoricalBranding?: boolean;
  seasonOptions: string[];
  recentSeasons?: PlayerSeason[];
  fromHistory?: boolean;
  themeMode?: ThemeMode;
  view?: PlayerPageView;
  caps: PlayerPageCapabilities;
  seasonType?: PlayerSeasonKind;
  children?: ReactNode;
  /** Percentile ranking + compare graph - sits beside identity, not inside it. */
  hero?: ReactNode;
};

/**
 * Layer 1 identity - headshot, name, team. Career / Game logs /
 * Visualizations sit below the identity + ranking row.
 */
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
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(16rem,20rem)_minmax(0,1fr)]">
          <GlassSurface
            as="header"
            accentColor={wash?.colorA}
            accentColorB={wash?.colorB}
            className="relative flex min-w-0 flex-col self-start p-0"
            effect="css"
          >
            <div className="relative z-[1] flex flex-col items-center px-4 pt-5 pb-4 text-center">
              <PlayerHeadshot
                playerId={playerId}
                espnId={espnId}
                nbaId={nbaId}
                name={displayName}
                teamKey={teamKey}
                portraitUrl={portraitUrl}
                registryOnly
                size="lg"
                priority
              />
              <h1 className={cn(type.display, "mt-5")}>{displayName}</h1>
              {seasonStints.length > 1 ? (
                <PlayerTeamPositionLine
                  stints={seasonStints}
                  season={season}
                  fallbackPosition={position}
                  useHistoricalBranding={useHistoricalBranding}
                  className="mt-1"
                />
              ) : (
                <p
                  className={cn(
                    type.bodySm,
                    "mt-1 flex flex-wrap items-center justify-center gap-2 text-muted-foreground"
                  )}
                >
                  {teamKey ? (
                    <TeamIdentity
                      teamKey={teamKey}
                      label={clubName ?? teamName ?? modernBrand?.abbr ?? "Team"}
                      className="inline-flex min-w-0"
                      nameClassName={cn(type.bodySm, "gap-2")}
                    >
                      {historicalBrand ? (
                        <HistoricalTeamMark brand={historicalBrand} size="sm" />
                      ) : (
                        <TeamLogo teamKey={teamKey} size="sm" />
                      )}
                      {clubName ? (
                        <span className={textLinkClassName}>{clubName}</span>
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
              />
              <PlayerDraftLine draftInfo={draftInfo} college={college} />
            </div>

            {recentSeasons.length > 0 ? (
              <div className="relative z-[1] mt-auto w-full border-t border-white/45 bg-white/25 px-3 py-3 backdrop-blur-md">
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
                      <th className="px-1.5 pb-1 text-right font-semibold">
                        PPG
                      </th>
                      <th className="px-1.5 pb-1 text-right font-semibold">
                        APG
                      </th>
                      <th className="px-1.5 pb-1 text-right font-semibold">
                        RPG
                      </th>
                      <th className="pb-1 pl-1.5 text-right font-semibold">
                        TS%
                      </th>
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
                        <td
                          className={cn(
                            type.caption,
                            "px-1.5 py-1 text-right tabular-nums"
                          )}
                        >
                          {formatPerGame(row.points, row.gamesPlayed)}
                        </td>
                        <td
                          className={cn(
                            type.caption,
                            "px-1.5 py-1 text-right tabular-nums"
                          )}
                        >
                          {formatPerGame(row.assists, row.gamesPlayed)}
                        </td>
                        <td
                          className={cn(
                            type.caption,
                            "px-1.5 py-1 text-right tabular-nums"
                          )}
                        >
                          {formatPerGame(row.rebounds, row.gamesPlayed)}
                        </td>
                        <td
                          className={cn(
                            type.caption,
                            "py-1 pl-1.5 text-right tabular-nums"
                          )}
                        >
                          {row.trueShootingPct != null &&
                          row.trueShootingPct > 0
                            ? formatPct(row.trueShootingPct)
                            : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </GlassSurface>

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
