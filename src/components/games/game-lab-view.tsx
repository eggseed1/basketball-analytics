"use client";

import { useState } from "react";

import type { GameAnalysisSummary } from "@/analytics/game-lab";
import { MatchupWashCard } from "@/components/brand/team-wash-card";
import {
  GameMarginFlowChart,
  GameWinProbabilityChart,
} from "@/components/games/game-flow-charts";
import { GameRosterBoard } from "@/components/games/game-roster-board";
import { GamePlayByPlayPanel } from "@/components/game/game-play-by-play";
import type { PlayByPlayEvent, PlayerGame } from "@/data/types";
import { type } from "@/lib/design-system";
import { useChartTheme } from "@/lib/chart-theme";
import { buildGameMatchupTheme } from "@/lib/game-matchup-theme";
import { cn } from "@/lib/utils";

type FlowTab = "margin" | "winprob";

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
  omitHero = false,
}: {
  analysis: GameAnalysisSummary;
  players: PlayerGame[];
  events?: PlayByPlayEvent[];
  pbpSource?: string;
  /** Parent renders GameIdentityShell — lab must not remount a second hero. */
  omitHero?: boolean;
}) {
  const chartTheme = useChartTheme();
  const { outcome, flow } = analysis;
  const awayKey = outcome.awayTeamId;
  const homeKey = outcome.homeTeamId;
  const matchup = buildGameMatchupTheme(awayKey, homeKey);
  const awayColor = chartTheme.teamBarColor(awayKey) || matchup.awayWash;
  const homeColor = chartTheme.teamBarColor(homeKey) || matchup.homeWash;
  const [flowTab, setFlowTab] = useState<FlowTab>("margin");

  const homePlayers = players
    .filter((p) => p.teamId === homeKey || p.isHome)
    .sort((a, b) => (b.minutes || 0) - (a.minutes || 0));
  const awayPlayers = players
    .filter((p) => p.teamId === awayKey || (!p.isHome && p.teamId !== homeKey))
    .sort((a, b) => (b.minutes || 0) - (a.minutes || 0));

  // Dedupe if filters overlap oddly.
  const awayIds = new Set(awayPlayers.map((p) => p.playerId));
  const homeOnly = homePlayers.filter((p) => !awayIds.has(p.playerId));

  return (
    <div className="flex flex-col gap-5">
      {!omitHero ? null : null}
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
              ? "Score margin by game time — dots use team colors; hover for the correlated play."
              : "Approximate win probability over the game — hover for the correlated play."}
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
              />
            )}

            {flow.periods.length > 0 ? (
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

      <MatchupWashCard
        awayTeamKey={awayKey}
        homeTeamKey={homeKey}
        intensity="subtle"
        className="flex flex-col gap-4 p-4 sm:p-5"
      >
        <div>
          <h2 className={type.heading}>Rosters</h2>
          <p className={cn(type.bodySm, "mt-1 text-muted-foreground")}>
            Spreadsheet box lines. Injured / inactive players are marked OUT.
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
            awayPlayers={awayPlayers}
            homePlayers={homeOnly.length ? homeOnly : homePlayers}
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
        />
      </MatchupWashCard>
    </div>
  );
}
