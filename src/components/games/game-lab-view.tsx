"use client";

import { useState } from "react";

import type { GameAnalysisSummary } from "@/analytics/game-lab";
import { MatchupWashCard } from "@/components/brand/team-wash-card";
import {
  GameMarginFlowChart,
  GameWinProbabilityChart,
} from "@/components/games/game-flow-charts";
import { GameLiveInsights } from "@/components/games/game-live-insights";
import { GameRosterBoard } from "@/components/games/game-roster-board";
import { GameShotChart, type ShotChartPlayer } from "@/components/games/game-shot-chart";
import { GameStoryStrip, GameTeamComparison } from "@/components/games/game-story";
import { GameTopPerformers } from "@/components/games/game-top-performers";
import { GamePlayByPlayPanel } from "@/components/game/game-play-by-play";
import type { PlayByPlayEvent, PlayerGame } from "@/data/types";
import { type } from "@/lib/design-system";
import type { OfficialTeamStats } from "@/lib/games/official-team-stats";
import { useChartTheme } from "@/lib/chart-theme";
import {
  elapsedFromDisplayClock,
  elapsedGameSeconds,
  isLiveLikeStatus,
  type GameStatusKind,
} from "@/lib/game-status";
import { buildGameMatchupTheme } from "@/lib/game-matchup-theme";
import { distinctTeamColors } from "@/lib/nba-brand";
import { cn } from "@/lib/utils";

type FlowTab = "margin" | "winprob";

/** Live play-by-play this far behind the game clock gets called out. */
const PBP_LAG_NOTE_SECONDS = 180;

function periodLabel(period: number): string {
  return period <= 4 ? `Q${period}` : `OT${period - 4}`;
}

function playByPlayLagNote(
  analysis: GameAnalysisSummary,
  events: PlayByPlayEvent[]
): string | null {
  if (!events.length || !isLiveLikeStatus(analysis.status as GameStatusKind)) return null;
  const live = elapsedFromDisplayClock(analysis.period, analysis.displayClock);
  if (live == null) return null;
  let last = events[0]!;
  for (const e of events) {
    if (elapsedGameSeconds(e.period, e.clockSeconds) > elapsedGameSeconds(last.period, last.clockSeconds)) {
      last = e;
    }
  }
  if (live - elapsedGameSeconds(last.period, last.clockSeconds) < PBP_LAG_NOTE_SECONDS) return null;
  return `Play-by-play for this game stops at ${periodLabel(last.period)} ${last.clock} while the game is at ${periodLabel(analysis.period!)} ${analysis.displayClock}. Leads, runs, possessions, game flow and shots below only cover plays up to that point.`;
}

const STATS_PENDING_NOTE =
  "Player stats for this game aren't in the live feed yet. This section updates on its own once they arrive.";

function FlowTabChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        type.caption,
        "glass-pill rounded-md px-2.5 py-1 font-semibold transition-colors",
        active
          ? "glass-pill-active"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

export function GameLabView({
  analysis,
  players,
  events = [],
  pbpSource,
  officialTeamStats = null,
  hidePeriodTable = false,
}: {
  analysis: GameAnalysisSummary;
  players: PlayerGame[];
  events?: PlayByPlayEvent[];
  pbpSource?: string;
  officialTeamStats?: { home: OfficialTeamStats; away: OfficialTeamStats } | null;
  /** Parent renders GameIdentityShell, so the lab never renders a hero. */
  omitHero?: boolean;
  /** The hero already shows the line score. */
  hidePeriodTable?: boolean;
}) {
  const chartTheme = useChartTheme();
  const { outcome, flow } = analysis;
  const awayKey = outcome.awayTeamId;
  const homeKey = outcome.homeTeamId;
  const matchup = buildGameMatchupTheme(awayKey, homeKey);
  const palette = distinctTeamColors([homeKey, awayKey], chartTheme.surface);
  const awayColor =
    palette.get(awayKey) || chartTheme.teamBarColor(awayKey) || matchup.awayWash;
  const homeColor =
    palette.get(homeKey) || chartTheme.teamBarColor(homeKey) || matchup.homeWash;
  const [flowTab, setFlowTab] = useState<FlowTab>("margin");
  const final = analysis.status === "final";

  const homePlayers = players
    .filter((p) => p.teamId === homeKey || p.isHome)
    .sort((a, b) => (b.minutes || 0) - (a.minutes || 0));
  const awayPlayers = players
    .filter((p) => p.teamId === awayKey || (!p.isHome && p.teamId !== homeKey))
    .sort((a, b) => (b.minutes || 0) - (a.minutes || 0));

  // Dedupe if filters overlap oddly.
  const awayIds = new Set(awayPlayers.map((p) => p.playerId));
  const homeOnly = homePlayers.filter((p) => !awayIds.has(p.playerId));

  const colors = { away: awayColor, home: homeColor };
  const rosterHome = homeOnly.length ? homeOnly : homePlayers;
  // The live feed sometimes lists players with minutes but no counting stats
  // while the score keeps moving. Those zeros are missing data, not real lines.
  const statsPending =
    !final &&
    outcome.homeScore + outcome.awayScore > 0 &&
    players.length > 0 &&
    players.every(
      (p) =>
        !p.points &&
        !p.fieldGoalsAttempted &&
        !p.freeThrowsAttempted &&
        !p.rebounds &&
        !p.assists
    );
  const pbpLagNote = playByPlayLagNote(analysis, events);
  const shotChartPlayers: ShotChartPlayer[] = [
    ...awayPlayers.map((p) => ({ playerId: p.playerId, name: p.playerName ?? null, side: "away" as const })),
    ...rosterHome.map((p) => ({ playerId: p.playerId, name: p.playerName ?? null, side: "home" as const })),
  ];

  return (
    <div className="flex flex-col gap-5">
      {pbpLagNote ? (
        <p
          role="status"
          className={cn(type.bodySm, "sports-card px-4 py-3 text-muted-foreground")}
        >
          {pbpLagNote}
        </p>
      ) : null}
      <GameStoryStrip analysis={analysis} colors={colors} />
      {statsPending ? (
        <MatchupWashCard
          awayTeamKey={awayKey}
          homeTeamKey={homeKey}
          intensity="subtle"
          className="flex flex-col gap-1 p-4 sm:p-5"
        >
          <h2 className={type.heading}>Team comparison and top performers</h2>
          <p className={cn(type.bodySm, "text-muted-foreground")}>{STATS_PENDING_NOTE}</p>
        </MatchupWashCard>
      ) : (
        <div className="grid gap-5 lg:grid-cols-5">
          <div className={players.length ? "lg:col-span-3" : "lg:col-span-5"}>
            <GameTeamComparison analysis={analysis} colors={colors} />
          </div>
          {players.length ? (
            <div className="lg:col-span-2">
              <GameTopPerformers
                awayLabel={outcome.awayLabel}
                homeLabel={outcome.homeLabel}
                awayTeamKey={awayKey}
                homeTeamKey={homeKey}
                awayPlayers={awayPlayers}
                homePlayers={rosterHome}
                colors={colors}
              />
            </div>
          ) : null}
        </div>
      )}
      <GameLiveInsights
        events={events}
        players={players}
        labels={{ away: outcome.awayLabel, home: outcome.homeLabel }}
        colors={colors}
        teamKeys={{ away: awayKey, home: homeKey }}
        season={analysis.season}
        status={analysis.status}
        official={officialTeamStats}
      />
      <MatchupWashCard
        awayTeamKey={awayKey}
        homeTeamKey={homeKey}
        intensity="subtle"
        className="flex flex-col gap-4 p-4 sm:p-5"
      >
        <div>
          <h2 className={type.heading}>Game flow</h2>
          <p className={cn(type.bodySm, "mt-1 text-muted-foreground")}>
            {flowTab === "margin"
              ? "Who led and by how much. Hover or drag across the chart to see each scoring play."
              : "Approximate win probability over the game. Hover for the matching play."}
          </p>
        </div>

        {flow.timeline.length > 0 ? (
          <div className="flex flex-col gap-4">
            <div
              role="tablist"
              aria-label="Game flow charts"
              className="flex flex-wrap gap-1.5"
            >
              <FlowTabChip
                active={flowTab === "margin"}
                onClick={() => setFlowTab("margin")}
              >
                Score margin
              </FlowTabChip>
              <FlowTabChip
                active={flowTab === "winprob"}
                onClick={() => setFlowTab("winprob")}
              >
                Win probability
              </FlowTabChip>
            </div>

            {flowTab === "margin" ? (
              <GameMarginFlowChart
                timeline={flow.timeline}
                homeLabel={outcome.homeLabel}
                awayLabel={outcome.awayLabel}
                homeTeamKey={homeKey}
                awayTeamKey={awayKey}
                homeColor={homeColor}
                awayColor={awayColor}
                events={events}
                live={!final}
              />
            ) : (
              <GameWinProbabilityChart
                timeline={flow.timeline}
                homeLabel={outcome.homeLabel}
                awayLabel={outcome.awayLabel}
                homeTeamKey={homeKey}
                awayTeamKey={awayKey}
                homeColor={homeColor}
                awayColor={awayColor}
                finalHomeScore={outcome.homeScore}
                finalAwayScore={outcome.awayScore}
                events={events}
                final={final}
              />
            )}

            {flow.periods.length > 0 && !hidePeriodTable ? (
              <div className="board-scroll-host overflow-x-auto rounded-md">
                <table className="w-full min-w-[20rem] text-left">
                  <thead
                    className={cn(
                      type.caption,
                      "uppercase tracking-wide text-muted-foreground"
                    )}
                  >
                    <tr className="border-b border-border/60">
                      <th className="py-1.5 pr-2 font-semibold">Period</th>
                      <th className="px-2 py-1.5 text-right font-semibold">
                        {outcome.awayLabel}
                      </th>
                      <th className="px-2 py-1.5 text-right font-semibold">
                        {outcome.homeLabel}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {flow.periods.map((row) => (
                      <tr
                        key={row.periodIndex}
                        className="border-b border-border/40"
                      >
                        <td className={cn(type.caption, "py-1.5 pr-2")}>
                          {row.label}
                        </td>
                        <td
                          className={cn(
                            type.caption,
                            "px-2 py-1.5 text-right tabular-nums"
                          )}
                        >
                          {row.awayPoints}
                        </td>
                        <td
                          className={cn(
                            type.caption,
                            "px-2 py-1.5 text-right tabular-nums"
                          )}
                        >
                          {row.homePoints}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        ) : (
          <p className={cn(type.bodySm, "text-muted-foreground")}>
            Score timeline unavailable for this game.
          </p>
        )}
      </MatchupWashCard>

      {events.some((e) => e.isFieldGoal) ? (
        <MatchupWashCard
          awayTeamKey={awayKey}
          homeTeamKey={homeKey}
          intensity="subtle"
          className="flex flex-col gap-4 p-4 sm:p-5"
        >
          <div>
            <h2 className={type.heading}>Shot chart</h2>
            <p className={cn(type.bodySm, "mt-1 text-muted-foreground")}>
              Every field goal attempt, filling in as the game goes. Switch to Game chart to add
              steals, blocks, turnovers, fouls and rebounds, and filter by quarter or player.{" "}
              {outcome.awayLabel} attacks the left basket and {outcome.homeLabel} the right.
            </p>
          </div>
          <GameShotChart
            gameId={analysis.gameId}
            status={analysis.status}
            events={events}
            homeLabel={outcome.homeLabel}
            awayLabel={outcome.awayLabel}
            homeColor={homeColor}
            awayColor={awayColor}
            homeTeamKey={homeKey}
            awayTeamKey={awayKey}
            players={shotChartPlayers}
          />
        </MatchupWashCard>
      ) : null}

      <MatchupWashCard
        awayTeamKey={awayKey}
        homeTeamKey={homeKey}
        intensity="subtle"
        className="flex flex-col gap-4 p-4 sm:p-5"
      >
        <div>
          <h2 className={type.heading}>Box score</h2>
          <p className={cn(type.bodySm, "mt-1 text-muted-foreground")}>
            Injured or inactive players are marked OUT.
            {final ? "" : " Bench players who haven't checked in yet are marked Not in yet."}
          </p>
        </div>
        {players.length === 0 ? (
          <p className={cn(type.bodySm, "text-muted-foreground")}>
            Box score roster lines are not available for this game.
          </p>
        ) : (
          <GameRosterBoard
            awayLabel={outcome.awayLabel}
            homeLabel={outcome.homeLabel}
            awayPlayers={statsPending ? [] : awayPlayers}
            homePlayers={statsPending ? [] : rosterHome}
            live={!final}
            emptyText={statsPending ? STATS_PENDING_NOTE : undefined}
          />
        )}
      </MatchupWashCard>

      <MatchupWashCard
        awayTeamKey={awayKey}
        homeTeamKey={homeKey}
        intensity="subtle"
        className="flex flex-col gap-3 p-4 sm:p-5"
      >
        <GamePlayByPlayPanel
          events={events}
          awayTricode={outcome.awayLabel}
          homeTricode={outcome.homeLabel}
          source={pbpSource}
          gameId={analysis.gameId}
          status={analysis.status}
        />
      </MatchupWashCard>
    </div>
  );
}
