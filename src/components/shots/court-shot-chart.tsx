"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import {
  SHOT_ZONE_LABELS,
  type ShotZoneId,
} from "@/lib/shots/court-geometry";
import {
  buildShotInsights,
  filterShots,
  shotCoverage,
  zoneSummaries,
  type GameShotEvent,
} from "@/lib/shots/shot-events";
import { cn } from "@/lib/utils";

export type CourtShotChartMode = "SHOTS" | "ZONES";

export interface CourtShotChartProps {
  shots: GameShotEvent[];
  homeTeamId: string;
  awayTeamId: string;
  homeLabel?: string;
  awayLabel?: string;
  selectedTeamId?: string | null;
  selectedPlayerId?: string | null;
  periodFilter?: number | "OT" | "ALL";
  timeCutoff?: number | null;
  selectedRunEventIds?: string[] | null;
  mode?: CourtShotChartMode;
  availability?: "SUPPORTED" | "PARTIAL" | "UNAVAILABLE";
  onSelectShot?: (shot: GameShotEvent | null) => void;
  /** Explicit "VIEW PLAY" — parent may scroll to PBP. */
  onViewPlay?: (shot: GameShotEvent) => void;
  selectedEventId?: string | null;
}

/** Reusable appendable court shot chart — game / live / replay ready. */
export function CourtShotChart({
  shots,
  homeTeamId,
  awayTeamId,
  homeLabel = "Home",
  awayLabel = "Away",
  selectedTeamId = null,
  selectedPlayerId = null,
  periodFilter = "ALL",
  timeCutoff = null,
  selectedRunEventIds = null,
  mode: modeProp,
  availability: availabilityProp,
  onSelectShot,
  onViewPlay,
  selectedEventId = null,
}: CourtShotChartProps) {
  const [mode, setMode] = useState<CourtShotChartMode>(modeProp ?? "SHOTS");
  const [teamId, setTeamId] = useState<string | null>(selectedTeamId);
  const [playerId, setPlayerId] = useState<string | null>(selectedPlayerId);
  const [period, setPeriod] = useState<number | "OT" | "ALL">(periodFilter);
  const [active, setActive] = useState<GameShotEvent | null>(null);

  const coverage = useMemo(() => shotCoverage(shots), [shots]);
  const availability = availabilityProp ?? coverage.completeness;

  const playersWithAttempts = useMemo(() => {
    const map = new Map<
      string,
      { name: string; fgm: number; fga: number; pts: number; teamId: string }
    >();
    for (const s of shots) {
      if (!s.playerId) continue;
      const row = map.get(s.playerId) ?? {
        name: s.playerName ?? s.playerId,
        fgm: 0,
        fga: 0,
        pts: 0,
        teamId: s.teamId ?? "",
      };
      row.fga += 1;
      if (s.made) {
        row.fgm += 1;
        row.pts += s.points;
      }
      map.set(s.playerId, row);
    }
    return [...map.entries()]
      .map(([id, r]) => ({ id, ...r }))
      .sort((a, b) => b.fga - a.fga);
  }, [shots]);

  const filtered = useMemo(
    () =>
      filterShots(shots, {
        teamId,
        playerId,
        period,
        timeCutoff,
        eventIds: selectedRunEventIds,
      }),
    [shots, teamId, playerId, period, timeCutoff, selectedRunEventIds]
  );

  const zones = useMemo(() => zoneSummaries(filtered), [filtered]);
  const insights = useMemo(() => {
    const p = playerId
      ? playersWithAttempts.find((x) => x.id === playerId)
      : null;
    return buildShotInsights(filtered, {
      teamName: teamId === homeTeamId ? homeLabel : teamId === awayTeamId ? awayLabel : undefined,
      playerName: p?.name,
    });
  }, [
    filtered,
    playerId,
    playersWithAttempts,
    teamId,
    homeTeamId,
    awayTeamId,
    homeLabel,
    awayLabel,
  ]);

  if (availability === "UNAVAILABLE" || coverage.withCoords === 0) {
    return (
      <section className="sports-card p-4">
        <h2 className="text-[15px] font-semibold tracking-tight">Shot chart</h2>
        <p className="mt-2 text-[13px] text-muted-foreground">
          Floor coordinates are unavailable for this game. Shot log:
        </p>
        <ul className="mt-3 max-h-48 overflow-y-auto text-[13px]">
          {filtered.slice(0, 40).map((s) => (
            <li key={s.eventId} className="py-1 text-muted-foreground">
              {s.clock} · {s.playerName} · {s.made ? "Make" : "Miss"} ·{" "}
              {s.shotType ?? "FG"}
            </li>
          ))}
        </ul>
      </section>
    );
  }

  const w = 400;
  const h = 380;
  // Map feet → SVG: basket near bottom, half-court up
  const toSvg = (x: number, y: number) => {
    const sx = w / 2 + x * 8;
    const sy = h - 40 - y * 8;
    return { cx: sx, cy: sy };
  };

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold tracking-tight">Shot chart</h2>
          <p className="mt-1 text-[12px] text-muted-foreground">
            {availability === "PARTIAL"
              ? `Partial coordinates (${coverage.withCoords}/${coverage.total})`
              : `${coverage.withCoords} attempts with locations`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(["SHOTS", "ZONES"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn(
                "rounded-md border px-2.5 py-1 text-[12px]",
                mode === m
                  ? "border-foreground bg-foreground text-background"
                  : "border-border text-muted-foreground"
              )}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Chip
          active={teamId == null && playerId == null}
          onClick={() => {
            setTeamId(null);
            setPlayerId(null);
          }}
          label="All"
        />
        <Chip
          active={teamId === awayTeamId && !playerId}
          onClick={() => {
            setTeamId(awayTeamId);
            setPlayerId(null);
          }}
          label={awayLabel}
        />
        <Chip
          active={teamId === homeTeamId && !playerId}
          onClick={() => {
            setTeamId(homeTeamId);
            setPlayerId(null);
          }}
          label={homeLabel}
        />
        {(["ALL", 1, 2, 3, 4, "OT"] as const).map((p) => (
          <Chip
            key={String(p)}
            active={period === p}
            onClick={() => setPeriod(p)}
            label={p === "ALL" ? "All periods" : p === "OT" ? "OT" : `Q${p}`}
          />
        ))}
      </div>

      {playersWithAttempts.length ? (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {playersWithAttempts.slice(0, 12).map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                setPlayerId(p.id);
                setTeamId(p.teamId || null);
              }}
              className={cn(
                "shrink-0 rounded-md border px-3 py-2 text-left text-[12px]",
                playerId === p.id
                  ? "border-foreground"
                  : "border-border text-muted-foreground"
              )}
            >
              <span className="block font-semibold text-foreground">
                {p.name}
              </span>
              <span className="tabular-nums">
                {p.fgm}/{p.fga} FG · {p.pts} PTS
              </span>
            </button>
          ))}
        </div>
      ) : null}

      {insights.map((t) => (
        <p key={t} className="text-[13px] text-muted-foreground">
          {t}
        </p>
      ))}

      <div className="sports-card overflow-hidden p-3">
        <svg
          viewBox={`0 0 ${w} ${h}`}
          className="mx-auto h-auto w-full max-w-md"
          role="img"
          aria-label="Half-court shot chart"
        >
          <rect width={w} height={h} fill="transparent" />
          {/* Simple court lines */}
          <rect
            x={w / 2 - 64}
            y={h - 40 - 152}
            width={128}
            height={152}
            fill="none"
            stroke="currentColor"
            strokeOpacity={0.25}
          />
          <circle
            cx={w / 2}
            cy={h - 40}
            r={12}
            fill="none"
            stroke="currentColor"
            strokeOpacity={0.35}
          />
          <path
            d={`M ${w / 2 - 176} ${h - 40} Q ${w / 2} ${h - 40 - 190} ${w / 2 + 176} ${h - 40}`}
            fill="none"
            stroke="currentColor"
            strokeOpacity={0.2}
          />

          {mode === "SHOTS"
            ? filtered
                .filter((s) => s.coordinateAvailable && s.x != null && s.y != null)
                .map((s) => {
                  const { cx, cy } = toSvg(s.x!, s.y!);
                  const selected =
                    selectedEventId === s.eventId || active?.eventId === s.eventId;
                  const isThree = s.shotType === "3PT";
                  return (
                    <g
                      key={s.eventId}
                      className="cursor-pointer"
                      onClick={() => {
                        setActive(s);
                        onSelectShot?.(s);
                      }}
                    >
                      {s.made ? (
                        isThree ? (
                          <polygon
                            points={`${cx},${cy - 5} ${cx + 5},${cy + 4} ${cx - 5},${cy + 4}`}
                            className={
                              selected ? "fill-foreground" : "fill-foreground/70"
                            }
                          />
                        ) : (
                          <circle
                            cx={cx}
                            cy={cy}
                            r={selected ? 5 : 3.5}
                            className="fill-foreground"
                          />
                        )
                      ) : isThree ? (
                        <rect
                          x={cx - 4}
                          y={cy - 4}
                          width={8}
                          height={8}
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={1.5}
                          className="opacity-60"
                        />
                      ) : (
                        <circle
                          cx={cx}
                          cy={cy}
                          r={selected ? 5 : 3.5}
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={1.5}
                          className="opacity-60"
                        />
                      )}
                    </g>
                  );
                })
            : null}
        </svg>
        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          ● make · ○ miss · △/□ three · size does not encode hot/cold
        </p>
      </div>

      {mode === "ZONES" ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {zones.map((z) => (
            <div key={z.zoneId} className="sports-card p-3 text-[13px]">
              <p className="font-semibold">
                {SHOT_ZONE_LABELS[z.zoneId as ShotZoneId] ?? z.zoneId}
              </p>
              <p className="mt-1 tabular-nums text-muted-foreground">
                {z.fgm}/{z.fga}
                {z.fgPct == null
                  ? ""
                  : z.smallSample
                    ? ` · ${Math.round(z.fgPct * 100)}% (small sample)`
                    : ` · ${Math.round(z.fgPct * 100)}%`}
                {" · "}
                {z.pts} PTS
              </p>
            </div>
          ))}
        </div>
      ) : null}

      {active ? (
        <div className="sports-card p-4 text-[13px]">
          <p className="font-semibold">
            {active.playerName} · {active.made ? "Made" : "Missed"}{" "}
            {active.shotType}
            {active.shotDistance != null ? ` · ${active.shotDistance} ft` : ""}
          </p>
          <p className="mt-1 text-muted-foreground">
            Q{active.period} {active.clock} · {active.scoreAfter.away}–
            {active.scoreAfter.home}
            {active.assistPlayerId ? " · assisted" : ""}
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            <button
              type="button"
              className="font-semibold underline-offset-4 hover:underline"
              onClick={() => {
                onSelectShot?.(active);
                onViewPlay?.(active);
              }}
            >
              VIEW PLAY
            </button>
            {active.playerId ? (
              <Link
                href={`/players/${active.playerId}`}
                className="underline-offset-4 hover:underline"
              >
                View player shots
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Chip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md border px-2.5 py-1 text-[12px]",
        active
          ? "border-foreground bg-foreground text-background"
          : "border-border text-muted-foreground"
      )}
    >
      {label}
    </button>
  );
}
