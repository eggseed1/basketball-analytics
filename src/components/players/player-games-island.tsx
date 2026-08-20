import { MiniStat } from "@/components/players/player-destination-stats";
import { PlayerNotableGames } from "@/components/players/player-notable-games";
import { TransitionLink } from "@/components/continuity/query-nav";
import { TeamWashCard } from "@/components/brand/team-wash-card";
import {
  getPlayerGameLogCached,
  getPlayerSeasonCached,
} from "@/data/queries/request-cache";
import type { PlayerSeason } from "@/data/types";
import { formatMinutes, formatNumber, formatPct } from "@/lib/format";
import {
  mergePlayerSeasonStats,
  playerSeasonChipHref,
} from "@/lib/player-destination";
import { playerHref } from "@/lib/player-page-contract";
import { brandableTeamKey } from "@/lib/player-team-context";
import { teamChartColor } from "@/lib/nba-brand";
import { resolveHistoricalTeamBrand } from "@/lib/historical-team-brand";
import type { ThemeMode } from "@/themes/era-theme";

export type PlayerGamesIslandProps = {
  playerId: string;
  season: string;
  career: PlayerSeason[];
  seasonOptions: string[];
  seasonTeams: Record<string, string>;
  identityTeamKey?: string | null;
  useHistoricalBranding?: boolean;
  fromHistory?: boolean;
  themeMode?: ThemeMode;
};

/**
 * Overview games island — notables + last-5 preview only.
 * Full season log lives at ?view=games (paginated).
 */
export async function PlayerGamesIsland({
  playerId,
  season,
  career,
  seasonOptions,
  seasonTeams,
  identityTeamKey,
  useHistoricalBranding = false,
  fromHistory = false,
  themeMode = "historical",
}: PlayerGamesIslandProps) {
  const [seasonRaw, gameLog] = await Promise.all([
    getPlayerSeasonCached(playerId, season),
    getPlayerGameLogCached(playerId, season),
  ]);

  const careerSeason = career.find((row) => row.season === season);
  const seasonStats = mergePlayerSeasonStats(seasonRaw, careerSeason, null);
  const teamKey =
    brandableTeamKey(identityTeamKey) ??
    brandableTeamKey(seasonStats?.teamId) ??
    undefined;
  const seasonPpg = seasonStats
    ? seasonStats.points / Math.max(1, seasonStats.gamesPlayed)
    : null;

  const chipColor = (option: string) => {
    const teamId = seasonTeams[option];
    if (!teamId || teamId === "TOT") return "var(--muted-foreground)";
    if (useHistoricalBranding) {
      const era = resolveHistoricalTeamBrand(teamId, option, "era");
      if (era?.palette?.primary) return era.palette.primary;
    }
    return teamChartColor(teamId).color;
  };

  const recent = [...gameLog]
    .sort((a, b) =>
      a.gameDate === b.gameDate
        ? b.id.localeCompare(a.id)
        : b.gameDate.localeCompare(a.gameDate)
    )
    .slice(0, 5);

  return (
    <section id="games" className="scroll-mt-16" aria-label="Games">
      <TeamWashCard
        teamKey={teamKey}
        className="flex flex-col gap-3 p-4 sm:p-5"
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-[17px] font-bold tracking-tight">Games</h2>
            <p className="text-[13px] text-muted-foreground">
              Evidence for the selected season · {season} · opens Game Lab
            </p>
          </div>
          {seasonOptions.length > 0 ? (
            <div className="flex max-w-full flex-wrap gap-1.5 overflow-x-auto">
              {seasonOptions.map((option) => {
                const optColor = chipColor(option);
                return (
                  <TransitionLink
                    key={option}
                    href={playerSeasonChipHref(playerId, option, {
                      fromHistory,
                      themeMode,
                    })}
                    scroll={false}
                    prefetch={false}
                    className={
                      option === season
                        ? "rounded-md px-3 py-1 text-[12px] font-semibold text-white"
                        : "rounded-md bg-white/55 px-3 py-1 text-[12px] font-semibold text-foreground"
                    }
                    style={
                      option === season
                        ? { backgroundColor: optColor }
                        : undefined
                    }
                  >
                    {option}
                  </TransitionLink>
                );
              })}
            </div>
          ) : null}
        </div>

        {seasonStats ? (
          <dl className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-white/50 p-3 sm:grid-cols-4 lg:grid-cols-6">
            <MiniStat
              label="GP"
              value={formatNumber(seasonStats.gamesPlayed)}
            />
            <MiniStat
              label="MIN"
              value={formatMinutes(seasonStats.minutes)}
            />
            <MiniStat label="PTS" value={formatNumber(seasonStats.points)} />
            <MiniStat
              label="AST"
              value={formatNumber(seasonStats.assists)}
            />
            <MiniStat
              label="REB"
              value={formatNumber(seasonStats.rebounds)}
            />
            <MiniStat
              label="TS%"
              value={
                seasonStats.trueShootingPct != null &&
                seasonStats.trueShootingPct > 0
                  ? formatPct(seasonStats.trueShootingPct)
                  : "—"
              }
            />
          </dl>
        ) : null}

        {gameLog.length > 0 ? (
          <PlayerNotableGames games={gameLog} seasonAvgPoints={seasonPpg} />
        ) : null}

        {gameLog.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">
            No game log for {season}.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            <h3 className="text-[14px] font-bold tracking-tight">
              Last {recent.length} games
            </h3>
            <ul className="divide-y divide-border rounded-xl border border-border">
              {recent.map((g) => (
                <li key={g.id}>
                  <TransitionLink
                    href={`/games/${g.gameId}?from=history&season=${encodeURIComponent(season)}`}
                    prefetch={false}
                    className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2.5 text-[13px] hover:bg-secondary/40"
                  >
                    <span className="font-semibold">{g.gameDate}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {g.points} PTS · {g.rebounds} REB · {g.assists} AST
                    </span>
                  </TransitionLink>
                </li>
              ))}
            </ul>
            <p className="text-[13px]">
              <TransitionLink
                href={playerHref({
                  playerId,
                  season,
                  view: "games",
                  fromHistory,
                  themeMode:
                    themeMode === "modern" ? "modern" : "historical",
                })}
                scroll={false}
                prefetch={false}
                className="font-semibold underline-offset-2 hover:underline"
              >
                View full game log ({gameLog.length}) →
              </TransitionLink>
            </p>
          </div>
        )}
      </TeamWashCard>
    </section>
  );
}
