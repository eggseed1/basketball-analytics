"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import {
  CategoryBarBoardLazy as CategoryBarBoard,
  HistogramBoardLazy as HistogramBoard,
  ScatterBoardLazy as ScatterBoard,
} from "@/components/charts/recharts-lazy";
import { AnalysisBoard } from "@/components/dashboard/analysis-board";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatTooltip } from "@/components/ui/stat-tooltip";
import type { DashboardPlayer } from "@/lib/dashboard-player";
import { BoardPlayerName } from "@/lib/board-compact-name";
import {
  DASHBOARD_METRICS,
  applyDashboardSelection,
  buildHistogram,
  buildPositionBars,
  buildTeamBars,
  buildTopScorerBars,
  emptySelection,
  selectionActive,
  toggleId,
  type DashboardSelection,
} from "@/lib/dashboard-aggregates";
import { formatNumber, formatPct } from "@/lib/format";
import { perGame } from "@/data/providers/nba/compute-advanced";
import { PlayerHeadshot } from "@/components/player/player-headshot";
import { nbaTeamAbbr } from "@/data/providers/nba/nba-team-meta";

const MIN_MINUTES = 500;

/**
 * Contour/Quiver-inspired dashboard: multi-board layout with chart-to-chart
 * filtering. Selecting bars in one board filters every other board.
 */
export function DashboardWorkspace({
  players,
  season,
}: {
  players: DashboardPlayer[];
  season: string;
}) {
  const [selection, setSelection] = useState<DashboardSelection>(emptySelection);
  const base = useMemo(
    () => players.filter((p) => p.minutes >= MIN_MINUTES),
    [players]
  );

  // Histograms always built from the unfiltered base so bins stay stable
  // Contour-style (filter selection highlights against the full distribution).
  const usgBins = useMemo(
    () => buildHistogram(base, DASHBOARD_METRICS.usagePct, 10),
    [base]
  );
  const tsBins = useMemo(
    () => buildHistogram(base, DASHBOARD_METRICS.trueShootingPct, 10),
    [base]
  );
  const perBins = useMemo(
    () => buildHistogram(base, DASHBOARD_METRICS.per, 10),
    [base]
  );

  const filtered = useMemo(
    () =>
      applyDashboardSelection(base, selection, {
        usg: usgBins,
        ts: tsBins,
        per: perBins,
      }),
    [base, selection, usgBins, tsBins, perBins]
  );

  const positionBars = useMemo(() => buildPositionBars(filtered), [filtered]);
  const teamBars = useMemo(() => buildTeamBars(filtered, 12), [filtered]);
  const scorerBars = useMemo(() => buildTopScorerBars(filtered, 12), [filtered]);

  const patch = (partial: Partial<DashboardSelection>) =>
    setSelection((prev) => ({ ...prev, ...partial }));

  const active = selectionActive(selection);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2 border border-border bg-muted/20 px-3 py-2">
        <p className="text-xs text-muted-foreground">
          {season} · {filtered.length} / {base.length} players (≥{MIN_MINUTES}{" "}
          min) · chart selections cross-filter all boards
        </p>
        <button
          type="button"
          disabled={!active}
          onClick={() => setSelection(emptySelection())}
          className="rounded border border-border px-2 py-1 text-xs disabled:opacity-40 hover:bg-muted"
        >
          Clear all filters
        </button>
      </div>

      {/* Contour-style dense board grid */}
      <div className="grid gap-3 lg:grid-cols-3">
        <HistogramBoard
          title="Usage % distribution"
          bins={usgBins}
          selectedIds={selection.usgBins}
          onToggle={(id) =>
            patch({ usgBins: toggleId(selection.usgBins, id) })
          }
        />
        <HistogramBoard
          title="True shooting % distribution"
          bins={tsBins}
          selectedIds={selection.tsBins}
          onToggle={(id) =>
            patch({ tsBins: toggleId(selection.tsBins, id) })
          }
        />
        <HistogramBoard
          title="PER distribution"
          bins={perBins}
          selectedIds={selection.perBins}
          onToggle={(id) =>
            patch({ perBins: toggleId(selection.perBins, id) })
          }
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <ScatterBoard
          title="Usage × true shooting"
          players={filtered}
        />
        <CategoryBarBoard
          title="Avg points by position"
          subtitle="Mean PTS/G in current selection · click to filter position"
          bars={positionBars}
          selectedIds={selection.positions}
          onToggle={(id) =>
            patch({ positions: toggleId(selection.positions, id) })
          }
          valueLabel="PTS/G"
          formatValue={(v) => v.toFixed(1)}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <CategoryBarBoard
          title="Team net rating (avg)"
          subtitle="Mean player NetRtg by team · click to filter team"
          bars={teamBars}
          selectedIds={selection.teams}
          onToggle={(id) => patch({ teams: toggleId(selection.teams, id) })}
          valueLabel="NRtg"
          formatValue={(v) => v.toFixed(1)}
          layout="horizontal"
        />
        <CategoryBarBoard
          title="Top scorers"
          subtitle="PTS/G leaders in selection (display only)"
          bars={scorerBars}
          selectedIds={[]}
          onToggle={() => undefined}
          valueLabel="PTS/G"
          formatValue={(v) => v.toFixed(1)}
          layout="horizontal"
        />
      </div>

      <AnalysisBoard
        title="Selection table"
        subtitle="Rows matching all active chart filters"
        footer={<span>{filtered.length} rows</span>}
      >
        <div className="max-h-[320px] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Player</TableHead>
                <TableHead>Team</TableHead>
                <TableHead className="text-right">PTS</TableHead>
                <TableHead className="text-right">
                  <StatTooltip nestable stat="USG%">
                    USG%
                  </StatTooltip>
                </TableHead>
                <TableHead className="text-right">
                  <StatTooltip nestable stat="TS%">
                    TS%
                  </StatTooltip>
                </TableHead>
                <TableHead className="text-right">
                  <StatTooltip nestable stat="PER">
                    PER
                  </StatTooltip>
                </TableHead>
                <TableHead className="text-right">
                  <StatTooltip nestable stat="NRtg">
                    NRtg
                  </StatTooltip>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...filtered]
                .sort(
                  (a, b) =>
                    perGame(b.points, b.gamesPlayed) -
                    perGame(a.points, a.gamesPlayed)
                )
                .slice(0, 40)
                .map((row) => (
                  <TableRow key={`${row.playerId}-${row.teamId}`}>
                    <TableCell className="max-w-[8rem] sm:max-w-none">
                      <Link
                        href={`/players/${row.playerId}?season=${season}`}
                        className="inline-flex min-w-0 max-w-full items-center gap-2 underline-offset-4 hover:underline"
                      >
                        <PlayerHeadshot
                          playerId={row.playerId}
                          name={row.playerName}
                          size="xs"
                          className="shrink-0"
                        />
                        <BoardPlayerName name={row.playerName} />
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono text-xs uppercase">
                      {nbaTeamAbbr(row.teamId, row.teamAbbreviation)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(perGame(row.points, row.gamesPlayed), 1)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatPct(row.usagePct)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatPct(row.trueShootingPct)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(row.per, 1)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(row.netRating, 1)}
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </div>
      </AnalysisBoard>
    </div>
  );
}
