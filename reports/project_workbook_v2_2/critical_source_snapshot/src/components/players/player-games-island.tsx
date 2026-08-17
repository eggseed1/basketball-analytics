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
 * Layer 3 — game log Suspense island (notable games + table).
 * Season mini-stats merge from career (peers live in core island).
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
  // P17.3: Layer-1 selected-season identity wins over board stint row.
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
            <MiniStat
              label="USG"
              value={
                seasonStats.usagePct != null && seasonStats.usagePct > 0
                  ? formatPct(seasonStats.usagePct)
                  : "—"
              }
            />
            {seasonStats.darkoDpm != null ? (
              <MiniStat
                label="DARKO"
                value={formatNumber(seasonStats.darkoDpm, 2)}
              />
            ) : null}
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
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[800px] text-left text-[13px]">
              <thead className="border-b border-border bg-secondary/50 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-2 py-2 text-right">MIN</th>
                  <th className="px-2 py-2 text-right">PTS</th>
                  <th className="px-2 py-2 text-right">AST</th>
                  <th className="px-2 py-2 text-right">REB</th>
                  <th className="px-2 py-2 text-right">STL</th>
                  <th className="px-2 py-2 text-right">BLK</th>
                  <th className="px-2 py-2 text-right">FG</th>
                  <th className="px-2 py-2 text-right">3P</th>
                  <th className="px-2 py-2 text-right">+/-</th>
                  <th className="px-3 py-2 text-right">TS%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {gameLog.map((g) => (
                  <tr key={g.id} className="hover:bg-secondary/40">
                    <td className="px-3 py-2">
                      <TransitionLink
                        href={`/games/${g.gameId}`}
                        className="font-semibold hover:underline"
                      >
                        {g.gameDate}
                      </TransitionLink>
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {formatNumber(g.minutes, 1)}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {g.points}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {g.assists}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {g.rebounds}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {g.steals}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {g.blocks}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {g.fieldGoalsMade}-{g.fieldGoalsAttempted}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {g.threePointersMade}-{g.threePointersAttempted}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {g.plusMinus}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {g.trueShootingPct != null
                        ? formatPct(g.trueShootingPct)
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </TeamWashCard>
    </section>
  );
}
