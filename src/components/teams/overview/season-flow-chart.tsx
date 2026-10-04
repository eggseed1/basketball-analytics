"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { TransitionLink } from "@/components/continuity/query-nav";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { useChartTheme } from "@/lib/chart-theme";
import { type } from "@/lib/design-system";
import { formatNumber } from "@/lib/format";
import {
  ROLLING_WINDOW,
  type SeasonHighlight,
  type TrajectoryGame,
} from "@/lib/team-overview-types";
import { cn } from "@/lib/utils";

type Mode = "margin" | "record";

const HEIGHT = 260;
const PAD = { top: 18, right: 12, bottom: 26, left: 34 };
const WIN = "var(--accent-positive)";
const LOSS = "var(--accent-negative)";

function useElementWidth<T extends HTMLElement>(fallback: number) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setWidth(Math.max(280, Math.round(el.getBoundingClientRect().width)));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

function niceCeil(v: number, step: number) {
  return Math.max(step, Math.ceil(v / step) * step);
}

function shortDate(iso: string) {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function SeasonFlowChart({
  games,
  highlights,
  teamKey,
  season,
}: {
  games: TrajectoryGame[];
  highlights: SeasonHighlight[];
  teamKey: string;
  season: string;
}) {
  const chartTheme = useChartTheme();
  const accent = chartTheme.teamColor(teamKey).color;
  const [mode, setMode] = useState<Mode>("margin");
  const [hover, setHover] = useState<number | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);
  const [wrapRef, width] = useElementWidth<HTMLDivElement>(900);

  const innerW = width - PAD.left - PAD.right;
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const step = games.length ? innerW / games.length : innerW;
  const barW = Math.max(1.5, Math.min(14, step * 0.68));
  const xAt = (i: number) => PAD.left + step * i + step / 2;

  const marginMax = niceCeil(Math.min(45, Math.max(10, ...games.map((g) => Math.abs(g.margin)))), 10);
  const ouMax = niceCeil(Math.max(5, ...games.map((g) => Math.abs(g.overUnder))), 5);
  const yMax = mode === "margin" ? marginMax : ouMax;
  const yAt = (v: number) => PAD.top + innerH / 2 - (v / yMax) * (innerH / 2);
  const ticks = [-yMax, -yMax / 2, 0, yMax / 2, yMax];

  const monthTicks = useMemo(() => {
    const out: Array<{ i: number; label: string }> = [];
    let last = "";
    games.forEach((g, i) => {
      const key = g.date.slice(0, 7);
      if (key !== last) {
        last = key;
        const label = new Date(`${g.date}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
        out.push({ i, label });
      }
    });
    return out;
  }, [games]);

  const visibleMonthTicks = monthTicks.filter((m, k, all) => k === 0 || step * (m.i - all[k - 1]!.i) >= 28);

  const postStart = games.findIndex((g) => g.phase !== "regular");
  const postPhases = new Set(postStart >= 0 ? games.slice(postStart).map((g) => g.phase) : []);
  const postLabel = postPhases.has("playoff") ? (postPhases.has("play-in") ? "POSTSEASON" : "PLAYOFFS") : "PLAY-IN";
  const postBandW = postStart >= 0 ? innerW - step * postStart : 0;
  const rollingPath = games.map((g, i) => `${i ? "L" : "M"}${xAt(i).toFixed(1)},${yAt(g.rolling).toFixed(1)}`).join("");
  const ouLine = games.map((g, i) => `${i ? "L" : "M"}${xAt(i).toFixed(1)},${yAt(g.overUnder).toFixed(1)}`).join("");
  const ouArea = games.length
    ? `${ouLine}L${xAt(games.length - 1).toFixed(1)},${yAt(0).toFixed(1)}L${xAt(0).toFixed(1)},${yAt(0).toFixed(1)}Z`
    : "";

  const active = pinned ?? hover;
  const activeGame = active != null ? games[active] : null;

  const indexFromEvent = (clientX: number, rect: DOMRect) => {
    const x = clientX - rect.left - PAD.left;
    const i = Math.floor(x / step);
    return i >= 0 && i < games.length ? i : null;
  };

  const highlightIndex = (gameId?: string) => (gameId ? games.findIndex((g) => g.id === gameId) : -1);

  const regular = games.filter((g) => g.phase === "regular");
  const final = regular.at(-1);
  const last10 = regular.slice(-10);

  return (
    <section className="sports-card flex flex-col gap-4 p-4 sm:p-5" aria-label="Season flow">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className={type.heading}>Season flow</h2>
          <p className={cn(type.bodySm, "mt-1 max-w-2xl text-muted-foreground")}>
            Every {season} game in order.{" "}
            {mode === "margin"
              ? `Bars show the final margin; the line is the ${ROLLING_WINDOW}-game rolling average.`
              : "Games above or below .500 after each regular-season game."}{" "}
            Tap a game for the score.
          </p>
        </div>
        <SegmentedControl
          size="sm"
          value={mode}
          onChange={setMode}
          options={[
            { id: "margin", label: "Margin" },
            { id: "record", label: "Over .500" },
          ]}
        />
      </div>

      {final ? (
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Kpi label="Regular season" value={final.record} />
          <Kpi
            label="Avg margin"
            value={`${regular.reduce((a, g) => a + g.margin, 0) / regular.length > 0 ? "+" : ""}${formatNumber(
              regular.reduce((a, g) => a + g.margin, 0) / regular.length,
              1
            )}`}
          />
          <Kpi label="Peak vs .500" value={`${Math.max(...regular.map((g) => g.overUnder)) > 0 ? "+" : ""}${Math.max(...regular.map((g) => g.overUnder))}`} />
          <Kpi
            label="Last 10"
            value={`${last10.filter((g) => g.win).length}-${last10.filter((g) => !g.win).length}`}
            pills={last10.map((g) => g.win)}
          />
        </dl>
      ) : null}

      <div ref={wrapRef} className="relative w-full select-none">
        <svg
          width={width}
          height={HEIGHT}
          role="img"
          aria-label={`${season} game-by-game ${mode === "margin" ? "margins" : "games over .500"}`}
          className="block touch-pan-y"
          onPointerMove={(e) => setHover(indexFromEvent(e.clientX, e.currentTarget.getBoundingClientRect()))}
          onPointerLeave={() => setHover(null)}
          onClick={(e) => {
            const i = indexFromEvent(e.clientX, e.currentTarget.getBoundingClientRect());
            setPinned((p) => (i == null || p === i ? null : i));
          }}
        >
          {postStart > 0 ? (
            <g>
              <rect
                x={PAD.left + step * postStart}
                y={PAD.top}
                width={postBandW}
                height={innerH}
                fill="currentColor"
                opacity={0.05}
                rx={6}
              />
              <text
                x={PAD.left + innerW}
                y={PAD.top - 6}
                textAnchor="end"
                className="fill-muted-foreground"
                fontSize={9.5}
                fontWeight={700}
                letterSpacing="0.08em"
              >
                {postLabel}
              </text>
            </g>
          ) : null}

          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={PAD.left}
                x2={width - PAD.right}
                y1={yAt(t)}
                y2={yAt(t)}
                stroke="currentColor"
                strokeOpacity={t === 0 ? 0.35 : 0.08}
                strokeDasharray={t === 0 ? undefined : "3 4"}
              />
              <text x={PAD.left - 6} y={yAt(t) + 3.5} textAnchor="end" fontSize={10} className="fill-muted-foreground tabular-nums">
                {t === 0 ? (mode === "margin" ? "0" : ".500") : `${t > 0 ? "+" : ""}${t}`}
              </text>
            </g>
          ))}

          {visibleMonthTicks.map((m) => (
            <text
              key={`${m.label}-${m.i}`}
              x={PAD.left + step * m.i}
              y={HEIGHT - 8}
              fontSize={10}
              className="fill-muted-foreground"
            >
              {m.label}
            </text>
          ))}

          {mode === "margin" ? (
            <>
              {games.map((g, i) => {
                const y0 = yAt(0);
                const y1 = yAt(Math.max(-yMax, Math.min(yMax, g.margin)));
                const dim = active != null && active !== i;
                return (
                  <rect
                    key={g.id}
                    x={xAt(i) - barW / 2}
                    y={Math.min(y0, y1)}
                    width={barW}
                    height={Math.max(1.5, Math.abs(y1 - y0))}
                    rx={Math.min(3, barW / 2)}
                    fill={g.win ? WIN : LOSS}
                    opacity={dim ? 0.35 : 0.9}
                  />
                );
              })}
              <path d={rollingPath} fill="none" stroke={accent} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
            </>
          ) : (
            <>
              <path d={ouArea} fill={accent} opacity={0.14} />
              <path d={ouLine} fill="none" stroke={accent} strokeWidth={2.5} strokeLinejoin="round" />
              {games.map((g, i) => (
                <circle
                  key={g.id}
                  cx={xAt(i)}
                  cy={yAt(g.overUnder)}
                  r={active === i ? 4.5 : Math.min(2.2, barW / 2)}
                  fill={g.win ? WIN : LOSS}
                  opacity={active != null && active !== i ? 0.4 : 1}
                />
              ))}
            </>
          )}

          {activeGame && active != null ? (
            <line
              x1={xAt(active)}
              x2={xAt(active)}
              y1={PAD.top}
              y2={PAD.top + innerH}
              stroke="currentColor"
              strokeOpacity={0.35}
              strokeDasharray="2 3"
              pointerEvents="none"
            />
          ) : null}
        </svg>

        {activeGame && active != null ? (
          <div
            className={cn(
              "absolute top-2 z-10 w-56 rounded-lg border border-border bg-background/95 p-3 shadow-lg backdrop-blur",
              pinned != null ? "pointer-events-auto" : "pointer-events-none"
            )}
            style={{
              left: Math.min(Math.max(4, xAt(active) - 112), width - 228),
            }}
          >
            <p className={cn(type.micro, "font-semibold uppercase tracking-wide text-muted-foreground")}>
              {shortDate(activeGame.date)} · {activeGame.phase === "regular" ? `Game ${active + 1}` : activeGame.phase === "playoff" ? "Playoffs" : "Play-in"}
            </p>
            <p className={cn(type.body, "mt-1 font-semibold")}>
              <span style={{ color: activeGame.win ? WIN : LOSS }}>{activeGame.win ? "W" : "L"}</span>{" "}
              {activeGame.pf}-{activeGame.pa} {activeGame.home ? "vs" : "at"} {activeGame.opponentAbbr}
              {activeGame.overtime ? " (OT)" : ""}
            </p>
            <p className={cn(type.caption, "mt-0.5 text-muted-foreground tabular-nums")}>
              Margin {activeGame.margin > 0 ? "+" : ""}
              {activeGame.margin} · {ROLLING_WINDOW}-game avg {activeGame.rolling > 0 ? "+" : ""}
              {formatNumber(activeGame.rolling, 1)}
            </p>
            {activeGame.phase === "regular" ? (
              <p className={cn(type.caption, "text-muted-foreground tabular-nums")}>Record after: {activeGame.record}</p>
            ) : null}
            {pinned != null ? (
              <TransitionLink href={`/games/${activeGame.id}`} className={cn(type.caption, "mt-2 inline-block font-semibold underline")}>
                Open game →
              </TransitionLink>
            ) : null}
          </div>
        ) : null}
      </div>

      {highlights.length ? (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {highlights.map((h) => {
            const idx = highlightIndex(h.gameId);
            const content = (
              <>
                <span className={cn(type.micro, "font-semibold uppercase tracking-wide text-muted-foreground")}>{h.label}</span>
                <span className={cn(type.body, "font-bold tabular-nums")}>{h.value}</span>
                {h.detail ? <span className={cn(type.caption, "text-muted-foreground")}>{h.detail}</span> : null}
              </>
            );
            return (
              <li key={h.id}>
                {idx >= 0 ? (
                  <button
                    type="button"
                    onClick={() => setPinned((p) => (p === idx ? null : idx))}
                    className={cn(
                      "flex h-full w-full flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left transition",
                      pinned === idx ? "border-foreground/40 bg-muted" : "border-border/70 hover:bg-muted/60"
                    )}
                    aria-pressed={pinned === idx}
                  >
                    {content}
                  </button>
                ) : (
                  <div className="flex h-full flex-col items-start gap-0.5 rounded-lg border border-border/70 px-3 py-2">{content}</div>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}

function Kpi({ label, value, pills }: { label: string; value: string; pills?: boolean[] }) {
  return (
    <div className="rounded-lg border border-border/70 px-3 py-2">
      <dt className={cn(type.micro, "font-semibold uppercase tracking-wide text-muted-foreground")}>{label}</dt>
      <dd className="mt-0.5 flex items-center gap-2">
        <span className={cn(type.title3, "font-bold tabular-nums")}>{value}</span>
        {pills?.length ? (
          <span className="flex gap-[3px]" aria-hidden>
            {pills.map((w, i) => (
              <span key={i} className="h-3 w-1.5 rounded-full" style={{ background: w ? WIN : LOSS, opacity: 0.85 }} />
            ))}
          </span>
        ) : null}
      </dd>
    </div>
  );
}
