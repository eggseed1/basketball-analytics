"use client";

import { useRouter } from "next/navigation";
import { useCallback, useId, useMemo, useState } from "react";
import {
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";

import type { GameSummary } from "@/data/types";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface GameScoringScatterProps {
  games: GameSummary[];
}

type ChartPoint = GameSummary & {
  label: string;
};

function matchupLabel(game: GameSummary): string {
  const away = game.awayTeamAbbr ?? game.awayTeamId;
  const home = game.homeTeamAbbr ?? game.homeTeamId;
  return `${away} @ ${home}`;
}

function AccessibleTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: ChartPoint }>;
}) {
  if (!active || !payload?.length) return null;
  const g = payload[0].payload;
  const summary = `${matchupLabel(g)} on ${g.gameDate}. Final ${g.awayScore}-${g.homeScore}. Total points ${g.totalPoints}. Margin ${g.margin}.`;

  return (
    <div
      role="tooltip"
      className="max-w-xs rounded-lg border border-border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md"
    >
      <p className="font-semibold">{matchupLabel(g)}</p>
      <p className="text-muted-foreground">{g.gameDate}</p>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 tabular-nums">
        <dt className="text-muted-foreground">Score</dt>
        <dd className="text-right">
          {g.awayScore}–{g.homeScore}
        </dd>
        <dt className="text-muted-foreground">Total points</dt>
        <dd className="text-right">{formatNumber(g.totalPoints)}</dd>
        <dt className="text-muted-foreground">Margin</dt>
        <dd className="text-right">
          {g.margin > 0 ? "+" : ""}
          {formatNumber(g.margin)}
        </dd>
      </dl>
      <p className="sr-only">{summary}</p>
    </div>
  );
}

export function GameScoringScatter({ games }: GameScoringScatterProps) {
  const router = useRouter();
  const chartId = useId();
  const [focusedId, setFocusedId] = useState<string | null>(null);

  const data: ChartPoint[] = useMemo(
    () =>
      games.map((g) => ({
        ...g,
        label: matchupLabel(g),
      })),
    [games]
  );

  const navigateToGame = useCallback(
    (gameId: string) => {
      router.push(`/games/${gameId}`);
    },
    [router]
  );

  return (
    <figure
      aria-labelledby={`${chartId}-title`}
      aria-describedby={`${chartId}-desc`}
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4"
    >
      <div>
        <h2 id={`${chartId}-title`} className="text-lg font-semibold">
          Total points vs margin
        </h2>
        <p id={`${chartId}-desc`} className="text-sm text-muted-foreground">
          Each marker is a completed game. X is combined scoring; Y is home
          margin (positive = home win). Shape encodes blowouts vs one-possession
          games — color is not required.
        </p>
      </div>

      <ul
        className="flex flex-wrap gap-3 text-xs text-muted-foreground"
        aria-label="Margin marker legend"
      >
        <li className="inline-flex items-center gap-1.5">
          <svg width="14" height="14" aria-hidden>
            <circle cx="7" cy="7" r="4" fill="currentColor" />
          </svg>
          One-possession (≤3)
        </li>
        <li className="inline-flex items-center gap-1.5">
          <svg width="14" height="14" aria-hidden>
            <rect x="3" y="3" width="8" height="8" fill="currentColor" />
          </svg>
          Competitive (4–10)
        </li>
        <li className="inline-flex items-center gap-1.5">
          <svg width="14" height="14" aria-hidden>
            <polygon points="7,2 12,12 2,12" fill="currentColor" />
          </svg>
          Blowout (11+)
        </li>
      </ul>

      <div className="h-[320px] w-full sm:h-[400px] lg:h-[460px]">
        {data.length === 0 ? (
          <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No games match the current filters.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart
              margin={{ top: 12, right: 16, bottom: 28, left: 8 }}
              role="img"
              aria-label="Scatter plot of total points versus home scoring margin"
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis
                type="number"
                dataKey="totalPoints"
                name="Total points"
                domain={["auto", "auto"]}
                label={{
                  value: "Total points",
                  position: "insideBottom",
                  offset: -16,
                }}
              />
              <YAxis
                type="number"
                dataKey="margin"
                name="Home margin"
                domain={["auto", "auto"]}
                label={{
                  value: "Home margin",
                  angle: -90,
                  position: "insideLeft",
                  offset: 10,
                  style: { textAnchor: "middle" },
                }}
              />
              <ZAxis range={[60, 60]} />
              <Tooltip
                content={<AccessibleTooltip />}
                cursor={{ strokeDasharray: "4 4" }}
              />
              <Scatter
                name="Games"
                data={data}
                fill="currentColor"
                shape={(shapeProps) => {
                  const raw = shapeProps as {
                    cx?: number;
                    cy?: number;
                    payload?: ChartPoint;
                  };
                  const point = raw.payload;
                  if (raw.cx == null || raw.cy == null || !point) return null;
                  const focused = focusedId === point.id;
                  const size = focused ? 8 : 6;
                  const abs = point.absMargin;
                  const common = {
                    className: cn(
                      "stroke-foreground fill-foreground/80",
                      focused ? "opacity-100" : "opacity-80"
                    ),
                    strokeWidth: focused ? 2 : 1.25,
                  };

                  let geometry;
                  if (abs <= 3) {
                    geometry = (
                      <circle cx={raw.cx} cy={raw.cy} r={size} {...common} />
                    );
                  } else if (abs <= 10) {
                    geometry = (
                      <rect
                        x={raw.cx - size}
                        y={raw.cy - size}
                        width={size * 2}
                        height={size * 2}
                        {...common}
                      />
                    );
                  } else {
                    geometry = (
                      <polygon
                        points={`${raw.cx},${raw.cy - size} ${raw.cx + size},${raw.cy + size} ${raw.cx - size},${raw.cy + size}`}
                        {...common}
                      />
                    );
                  }

                  return (
                    <g
                      tabIndex={0}
                      role="link"
                      aria-label={`${matchupLabel(point)}, ${point.gameDate}, ${point.awayScore}-${point.homeScore}, total ${point.totalPoints}, margin ${point.margin}. Activate to open box score.`}
                      onFocus={() => setFocusedId(point.id)}
                      onClick={(event) => {
                        event.stopPropagation();
                        navigateToGame(point.id);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          navigateToGame(point.id);
                        }
                      }}
                      style={{ cursor: "pointer", outline: "none" }}
                    >
                      {geometry}
                      <title>{matchupLabel(point)}</title>
                    </g>
                  );
                }}
              />
            </ScatterChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="border-t border-border pt-3">
        <h3 className="mb-2 text-sm font-medium">Keyboard game list</h3>
        <ul className="grid max-h-40 gap-1 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
          {data.map((g) => (
            <li key={g.id}>
              <button
                type="button"
                className={cn(
                  "w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  focusedId === g.id && "bg-muted"
                )}
                onFocus={() => setFocusedId(g.id)}
                onClick={() => navigateToGame(g.id)}
              >
                <span className="font-medium">{matchupLabel(g)}</span>
                <span className="block text-xs text-muted-foreground tabular-nums">
                  {g.gameDate} · {g.awayScore}-{g.homeScore} · tot{" "}
                  {g.totalPoints}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </figure>
  );
}
