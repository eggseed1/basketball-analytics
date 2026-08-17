"use client";

import { useRouter } from "next/navigation";
import {
  useCallback,
  useId,
  useMemo,
  useState,
  type ReactNode,
} from "react";
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

import type { PlayerSeason, Position } from "@/data/types";
import { formatMinutes, formatPct } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface PlayerUsageTsScatterProps {
  players: PlayerSeason[];
}

type ChartPoint = PlayerSeason & {
  usagePctDisplay: number;
  trueShootingPctDisplay: number;
};

type ScatterShapeProps = {
  cx?: number;
  cy?: number;
  payload?: ChartPoint;
};

const POSITION_SHAPE: Record<
  Position | "UNK",
  "circle" | "square" | "triangle" | "diamond" | "cross" | "star"
> = {
  PG: "circle",
  SG: "square",
  SF: "triangle",
  PF: "diamond",
  C: "cross",
  UNK: "star",
};

function positionKey(position?: Position): Position | "UNK" {
  return position ?? "UNK";
}

function AccessibleTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: ChartPoint }>;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;

  const summary = `${p.playerName}, ${p.teamName}. Usage ${formatPct(p.usagePct)}, true shooting ${formatPct(p.trueShootingPct)}, ${formatMinutes(p.minutes)} minutes, ${p.gamesPlayed} games.`;

  return (
    <div
      role="tooltip"
      className="max-w-xs rounded-lg border border-border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md"
    >
      <p className="font-semibold">{p.playerName}</p>
      <p className="text-muted-foreground">{p.teamName}</p>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 tabular-nums">
        <dt className="text-muted-foreground">Usage %</dt>
        <dd className="text-right">{formatPct(p.usagePct)}</dd>
        <dt className="text-muted-foreground">TS %</dt>
        <dd className="text-right">{formatPct(p.trueShootingPct)}</dd>
        <dt className="text-muted-foreground">Minutes</dt>
        <dd className="text-right">{formatMinutes(p.minutes)}</dd>
        <dt className="text-muted-foreground">Games</dt>
        <dd className="text-right">{p.gamesPlayed}</dd>
      </dl>
      <p className="sr-only">{summary}</p>
    </div>
  );
}

function ShapeMarker(
  props: ScatterShapeProps & {
    focusedId: string | null;
    onFocusPlayer: (id: string) => void;
    onActivatePlayer: (id: string) => void;
  }
) {
  const { cx, cy, payload, focusedId, onFocusPlayer, onActivatePlayer } =
    props;
  if (cx == null || cy == null || !payload) return null;

  const point = payload;
  const shape = POSITION_SHAPE[positionKey(point.position)];
  const focused = focusedId === point.playerId;
  const size = focused ? 8 : 6;

  const common = {
    className: cn(
      "stroke-foreground fill-foreground/80 transition-opacity",
      focused ? "opacity-100" : "opacity-80"
    ),
    strokeWidth: focused ? 2 : 1.25,
  };

  let geometry: ReactNode;
  switch (shape) {
    case "square":
      geometry = (
        <rect
          x={cx - size}
          y={cy - size}
          width={size * 2}
          height={size * 2}
          {...common}
        />
      );
      break;
    case "triangle":
      geometry = (
        <polygon
          points={`${cx},${cy - size} ${cx + size},${cy + size} ${cx - size},${cy + size}`}
          {...common}
        />
      );
      break;
    case "diamond":
      geometry = (
        <polygon
          points={`${cx},${cy - size} ${cx + size},${cy} ${cx},${cy + size} ${cx - size},${cy}`}
          {...common}
        />
      );
      break;
    case "cross":
      geometry = (
        <g className={common.className} strokeWidth={common.strokeWidth}>
          <line
            x1={cx - size}
            y1={cy}
            x2={cx + size}
            y2={cy}
            stroke="currentColor"
          />
          <line
            x1={cx}
            y1={cy - size}
            x2={cx}
            y2={cy + size}
            stroke="currentColor"
          />
        </g>
      );
      break;
    case "star":
      geometry = <circle cx={cx} cy={cy} r={size} {...common} fill="none" />;
      break;
    default:
      geometry = <circle cx={cx} cy={cy} r={size} {...common} />;
  }

  return (
    <g
      tabIndex={0}
      role="link"
      aria-label={`${point.playerName}, ${point.teamName}, usage ${formatPct(point.usagePct)}, true shooting ${formatPct(point.trueShootingPct)}, ${formatMinutes(point.minutes)} minutes, ${point.gamesPlayed} games. Activate to open player page.`}
      onFocus={() => onFocusPlayer(point.playerId)}
      onClick={(event) => {
        event.stopPropagation();
        onActivatePlayer(point.playerId);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onActivatePlayer(point.playerId);
        }
      }}
      style={{ outline: "none", cursor: "pointer" }}
    >
      {geometry}
      {focused ? (
        <circle
          cx={cx}
          cy={cy}
          r={size + 4}
          fill="none"
          stroke="var(--ring)"
          strokeWidth={2}
          aria-hidden
        />
      ) : null}
      <title>{point.playerName}</title>
    </g>
  );
}

export function PlayerUsageTsScatter({ players }: PlayerUsageTsScatterProps) {
  const router = useRouter();
  const chartId = useId();
  const [focusedId, setFocusedId] = useState<string | null>(null);

  const data: ChartPoint[] = useMemo(
    () =>
      players.map((p) => ({
        ...p,
        usagePctDisplay: p.usagePct * 100,
        trueShootingPctDisplay: p.trueShootingPct * 100,
      })),
    [players]
  );

  const navigateToPlayer = useCallback(
    (playerId: string) => {
      router.push(`/players/${playerId}`);
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
          Usage % vs True Shooting %
        </h2>
        <p id={`${chartId}-desc`} className="text-sm text-muted-foreground">
          Each marker is a player. Shape encodes position (see legend). Hover or
          focus a marker for details; activate to open the player page.
        </p>
      </div>

      <ul
        className="flex flex-wrap gap-3 text-xs text-muted-foreground"
        aria-label="Position marker legend"
      >
        {(
          [
            ["PG", "circle"],
            ["SG", "square"],
            ["SF", "triangle"],
            ["PF", "diamond"],
            ["C", "cross"],
          ] as const
        ).map(([pos, shape]) => (
          <li key={pos} className="inline-flex items-center gap-1.5">
            <LegendGlyph shape={shape} />
            <span>
              {pos}
              <span className="sr-only"> uses {shape} markers</span>
            </span>
          </li>
        ))}
      </ul>

      <div className="h-[320px] w-full sm:h-[400px] lg:h-[460px]">
        {data.length === 0 ? (
          <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No players match the current filters.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart
              margin={{ top: 12, right: 16, bottom: 28, left: 8 }}
              role="img"
              aria-label="Scatter plot of usage percent versus true shooting percent"
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis
                type="number"
                dataKey="usagePctDisplay"
                name="Usage %"
                unit="%"
                domain={["auto", "auto"]}
                tickFormatter={(v) => `${v}`}
                label={{
                  value: "Usage %",
                  position: "insideBottom",
                  offset: -16,
                }}
              />
              <YAxis
                type="number"
                dataKey="trueShootingPctDisplay"
                name="True Shooting %"
                unit="%"
                domain={["auto", "auto"]}
                tickFormatter={(v) => `${v}`}
                label={{
                  value: "True Shooting %",
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
                name="Players"
                data={data}
                fill="currentColor"
                shape={(shapeProps) => {
                  const raw = shapeProps as ScatterShapeProps;
                  return (
                    <ShapeMarker
                      cx={raw.cx}
                      cy={raw.cy}
                      payload={raw.payload}
                      focusedId={focusedId}
                      onFocusPlayer={setFocusedId}
                      onActivatePlayer={navigateToPlayer}
                    />
                  );
                }}
              />
            </ScatterChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Keyboard-friendly companion list — Recharts dots alone are not enough. */}
      <div className="border-t border-border pt-3">
        <h3 className="mb-2 text-sm font-medium">Keyboard player list</h3>
        <ul className="grid max-h-40 gap-1 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
          {data.map((p) => (
            <li key={p.playerId}>
              <button
                type="button"
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  focusedId === p.playerId && "bg-muted"
                )}
                onFocus={() => setFocusedId(p.playerId)}
                onClick={() => navigateToPlayer(p.playerId)}
              >
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-medium">{p.playerName}</span>
                  {p.position ? (
                    <span className="text-muted-foreground"> {p.position}</span>
                  ) : null}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  USG {formatPct(p.usagePct)} · TS {formatPct(p.trueShootingPct)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </figure>
  );
}

function LegendGlyph({
  shape,
}: {
  shape: "circle" | "square" | "triangle" | "diamond" | "cross";
}) {
  return (
    <svg width={16} height={16} aria-hidden className="text-foreground">
      {shape === "circle" && (
        <circle cx={8} cy={8} r={4} fill="currentColor" />
      )}
      {shape === "square" && (
        <rect x={4} y={4} width={8} height={8} fill="currentColor" />
      )}
      {shape === "triangle" && (
        <polygon points="8,3 13,13 3,13" fill="currentColor" />
      )}
      {shape === "diamond" && (
        <polygon points="8,2 14,8 8,14 2,8" fill="currentColor" />
      )}
      {shape === "cross" && (
        <g stroke="currentColor" strokeWidth={2}>
          <line x1={3} y1={8} x2={13} y2={8} />
          <line x1={8} y1={3} x2={8} y2={13} />
        </g>
      )}
      <title>{shape}</title>
    </svg>
  );
}
