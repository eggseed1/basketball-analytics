"use client";

import { useMemo, useState } from "react";

import { SentimentGameChartLazy as SentimentGameChart } from "@/components/charts/recharts-lazy";
import { formatSentimentDate, sentimentPct } from "@/components/sentiment/sentiment-source";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { TextLink } from "@/components/ui/text-link";
import { type } from "@/lib/design-system";
import { teamChartColor } from "@/lib/nba-brand";
import { cn } from "@/lib/utils";
import {
  GAME_REACTION_MIN_CORRELATION_GAMES,
  GAME_REACTION_MIN_ITEMS,
  pearson,
  type GameReaction,
  type SentimentGameRow,
} from "@/sentiment/game-reaction";

export type SentimentGameTrack = {
  rows: SentimentGameRow[];
  /** First day with any dated fan post or headline for this player. */
  firstDate: string | null;
  lastGameDate: string | null;
};

type StatKey = "points" | "rebounds" | "assists" | "tsPct";

const STATS: Record<
  StatKey,
  { label: string; short: string; value: (r: SentimentGameRow) => number | null; format: (v: number) => string }
> = {
  points: { label: "Points", short: "PTS", value: (r) => r.points, format: (v) => String(Math.round(v)) },
  rebounds: { label: "Rebounds", short: "REB", value: (r) => r.rebounds, format: (v) => String(Math.round(v)) },
  assists: { label: "Assists", short: "AST", value: (r) => r.assists, format: (v) => String(Math.round(v)) },
  tsPct: {
    label: "True shooting",
    short: "TS%",
    value: (r) => r.tsPct,
    format: (v) => `${(v * 100).toFixed(1)}%`,
  },
};

const STAT_OPTIONS = (Object.keys(STATS) as StatKey[]).map((id) => ({
  id,
  label: STATS[id].short,
}));

function opponentLabel(row: SentimentGameRow): string {
  return `${row.isHome ? "vs" : "@"} ${teamChartColor(row.opponentTeamId).abbr}`;
}

function ToneCell({ reaction, noun }: { reaction: GameReaction; noun: string }) {
  return (
    <td
      className={cn(
        "px-2 py-1.5 text-right tabular-nums",
        reaction.score == null
          ? "text-muted-foreground"
          : reaction.score >= 0.2
            ? "text-delta-up"
            : reaction.score <= -0.2
              ? "text-delta-down"
              : undefined
      )}
      title={`${reaction.count} ${noun}`}
    >
      {reaction.score == null ? "—" : sentimentPct(reaction.score)}
      <span className="ml-1 text-muted-foreground">({reaction.count})</span>
    </td>
  );
}

function CorrelationLine({
  lane,
  rows,
  stat,
}: {
  lane: "fan" | "media";
  rows: SentimentGameRow[];
  stat: StatKey;
}) {
  const pairs = rows.flatMap((row): Array<[number, number]> => {
    const x = STATS[stat].value(row);
    const y = row[lane].score;
    return x == null || y == null ? [] : [[x, y]];
  });
  const name = lane === "fan" ? "Fan tone" : "Media tone";
  const noun = lane === "fan" ? "posts" : "headlines";
  const r = pairs.length >= GAME_REACTION_MIN_CORRELATION_GAMES ? pearson(pairs) : null;
  return (
    <p className={cn(type.caption, "tabular-nums")}>
      <span className="font-semibold">
        {name} vs {STATS[stat].label.toLowerCase()}:
      </span>{" "}
      {r != null ? (
        <>
          r = {r.toFixed(2)} across {pairs.length} games
        </>
      ) : (
        <span className="text-muted-foreground">
          needs {GAME_REACTION_MIN_CORRELATION_GAMES} games with enough {noun} ({pairs.length} so
          far)
        </span>
      )}
    </p>
  );
}

export function PlayerSentimentGames({
  playerName,
  track,
}: {
  playerName: string;
  track: SentimentGameTrack | null;
}) {
  const [stat, setStat] = useState<StatKey>("points");
  const rows = useMemo(() => track?.rows ?? [], [track]);
  const chartRows = useMemo(
    () =>
      rows.map((row) => ({
        key: row.gameId,
        label: formatSentimentDate(row.date),
        detail: `${formatSentimentDate(row.date, true)} ${opponentLabel(row)}`,
        stat: STATS[stat].value(row),
        fan: row.fan.score,
        fanCount: row.fan.count,
        media: row.media.score,
        mediaCount: row.media.count,
      })),
    [rows, stat]
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h3 className={cn(type.bodySm, "font-bold")}>Sentiment by game</h3>
        <p className={cn(type.caption, "text-muted-foreground")}>
          Fan and media tone from game day and the day after, next to {playerName}&apos;s box
          score. A tone cell is blank, not neutral, when fewer than {GAME_REACTION_MIN_ITEMS}{" "}
          posts or headlines mention him in that window. The count is in parentheses. On
          back-to-backs the two windows share a day.
        </p>
      </div>

      {rows.length === 0 ? (
        <p className={cn(type.bodySm, "text-muted-foreground")}>
          {track?.firstDate ? (
            <>
              Sentiment tracking for {playerName} starts{" "}
              {formatSentimentDate(track.firstDate, true)}
              {track.lastGameDate && track.lastGameDate < track.firstDate
                ? `, after his last logged game on ${formatSentimentDate(track.lastGameDate, true)}`
                : ""}
              . Games appear here once he plays on or after that date.
            </>
          ) : (
            <>
              No dated fan posts or headlines name {playerName} yet, so there is nothing to line
              up with his games.
            </>
          )}
        </p>
      ) : (
        <>
          <SegmentedControl
            size="sm"
            value={stat}
            options={STAT_OPTIONS}
            onChange={setStat}
            className="self-start"
          />
          <SentimentGameChart
            rows={chartRows}
            statLabel={STATS[stat].label}
            formatStat={STATS[stat].format}
          />
          <p className={cn(type.caption, "text-muted-foreground")}>
            Bars show {STATS[stat].label.toLowerCase()} (right axis). Blue is fan tone and purple
            is media tone (left axis, 50% is neutral).
          </p>
          <div className="flex flex-col gap-0.5">
            <CorrelationLine lane="fan" rows={rows} stat={stat} />
            <CorrelationLine lane="media" rows={rows} stat={stat} />
            <p className={cn(type.caption, "text-muted-foreground")}>
              r runs from −1 to 1, and values near 0 mean tone and the stat moved independently.
              It measures correlation only. Small samples swing a lot.
            </p>
          </div>
          <div className="max-h-96 overflow-auto rounded-lg border border-border/60">
            <table className={cn(type.caption, "w-full min-w-[36rem] border-collapse")}>
              <thead className="sticky top-0 bg-background/95 text-muted-foreground backdrop-blur">
                <tr>
                  <th className="px-2 py-1.5 text-left font-semibold">Date</th>
                  <th className="px-2 py-1.5 text-left font-semibold">Opp</th>
                  <th className="px-2 py-1.5 text-right font-semibold">MIN</th>
                  <th className="px-2 py-1.5 text-right font-semibold">PTS</th>
                  <th className="px-2 py-1.5 text-right font-semibold">REB</th>
                  <th className="px-2 py-1.5 text-right font-semibold">AST</th>
                  <th className="px-2 py-1.5 text-right font-semibold">TS%</th>
                  <th className="px-2 py-1.5 text-right font-semibold">Fan</th>
                  <th className="px-2 py-1.5 text-right font-semibold">Media</th>
                </tr>
              </thead>
              <tbody>
                {[...rows].reverse().map((row) => (
                  <tr key={row.gameId} className="border-t border-border/40">
                    <td className="px-2 py-1.5 whitespace-nowrap">
                      <TextLink href={`/games/${row.gameId}`}>
                        {formatSentimentDate(row.date, true)}
                      </TextLink>
                      {row.seasonType === "playoffs" ? (
                        <span className="ml-1 text-muted-foreground">PO</span>
                      ) : null}
                    </td>
                    <td className="px-2 py-1.5 whitespace-nowrap">{opponentLabel(row)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{Math.round(row.minutes)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{row.points}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{row.rebounds}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{row.assists}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {row.tsPct == null ? "—" : STATS.tsPct.format(row.tsPct)}
                    </td>
                    <ToneCell reaction={row.fan} noun="fan posts" />
                    <ToneCell reaction={row.media} noun="headlines" />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
