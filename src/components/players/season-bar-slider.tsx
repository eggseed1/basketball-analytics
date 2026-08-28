"use client";

import { useCallback, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { FrostFloatingSurface } from "@/components/brand/frost-floating-surface";
import { TeamLogo } from "@/components/brand/team-logo";
import { TeamSeasonSwatch } from "@/components/brand/team-season-swatch";
import { useChartTheme } from "@/lib/chart-theme";
import { type } from "@/lib/design-system";
import {
  normalizeSeasonTeamKeys,
  seasonTrackGradientStyle,
  teamSeasonFillStyle,
  teamSeasonLabel,
} from "@/lib/team-season-colors";
import { cn } from "@/lib/utils";

function shortSeason(season: string) {
  const m = /^(\d{4})-(\d{2})$/.exec(season);
  if (!m) return season;
  return `${m[1].slice(2)}-${m[2]}`;
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function indexFromClientX(
  clientX: number,
  rect: DOMRect,
  count: number
): number {
  if (count <= 1) return 0;
  const t = (clientX - rect.left) / Math.max(1, rect.width);
  return Math.round(clamp(t, 0, 1) * (count - 1));
}

function ratioFromClientX(clientX: number, rect: DOMRect): number {
  return clamp((clientX - rect.left) / Math.max(1, rect.width), 0, 1);
}

function resolveSeasonKeys(
  season: string,
  seasonTeamKeys?: Record<string, string[]>,
  seasonTeams?: Record<string, string>
): string[] {
  return normalizeSeasonTeamKeys(
    seasonTeamKeys?.[season],
    seasonTeams?.[season]
  );
}

function TickHoverTip({
  season,
  teamKeys,
  align,
}: {
  season: string;
  teamKeys: string[];
  align: "left" | "right" | "center";
}) {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) {
      setPos(null);
      return;
    }
    const rect = triggerRef.current.getBoundingClientRect();
    const width = 180;
    let left = rect.left + rect.width / 2 - width / 2;
    if (align === "left") left = rect.left;
    if (align === "right") left = rect.right - width;
    setPos({
      top: Math.max(8, rect.top - 8 - 40),
      left: Math.min(Math.max(8, left), window.innerWidth - width - 8),
    });
  }, [open, align, teamKeys.length]);

  return (
    <span
      ref={triggerRef}
      className="absolute inset-0"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      {open && pos
        ? createPortal(
            <FrostFloatingSurface
              role="tooltip"
              className="pointer-events-none z-[80] w-max max-w-[14rem] px-2 py-1.5"
              style={{ position: "fixed", top: pos.top, left: pos.left }}
            >
              <span className="flex items-center gap-1.5">
                {teamKeys.length > 0 ? (
                  <span className="flex items-center -space-x-1">
                    {teamKeys.slice(0, 3).map((teamKey) => (
                      <TeamLogo key={teamKey} teamKey={teamKey} size="2xs" />
                    ))}
                  </span>
                ) : null}
                <span className={cn(type.caption, "font-semibold tabular-nums")}>
                  {season}
                </span>
                <span className={cn(type.caption, "text-muted-foreground")}>
                  {teamSeasonLabel(teamKeys)}
                </span>
              </span>
            </FrostFloatingSurface>,
            document.body
          )
        : null}
    </span>
  );
}

export function SeasonBarSlider({
  seasons,
  value,
  seasonTeams,
  seasonTeamKeys,
  accentColor,
  onCommit,
}: {
  seasons: string[];
  value: string;
  seasonTeams?: Record<string, string>;
  seasonTeamKeys?: Record<string, string[]>;
  accentColor?: string;
  onCommit: (season: string) => void;
}) {
  const { surface, isDark } = useChartTheme();
  const labelId = useId();
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const index = Math.max(0, seasons.indexOf(value));
  const last = Math.max(0, seasons.length - 1);
  const snappedRatio = last === 0 ? 0 : index / last;
  const [dragRatio, setDragRatio] = useState<number | null>(null);
  const dragging = dragRatio != null;
  const ratio = dragRatio ?? snappedRatio;
  const previewIndex = Math.round(ratio * last);
  const preview = seasons[previewIndex] ?? value;
  const previewKeys = resolveSeasonKeys(
    preview,
    seasonTeamKeys,
    seasonTeams
  );
  const thumbStyle = teamSeasonFillStyle(previewKeys);
  const thumbFallback =
    !previewKeys.length && accentColor
      ? { backgroundColor: accentColor }
      : thumbStyle;

  const moveTo = useCallback(
    (clientX: number, snap: boolean) => {
      const el = trackRef.current;
      if (!el || seasons.length === 0) return;
      const rect = el.getBoundingClientRect();
      if (snap) {
        const next = indexFromClientX(clientX, rect, seasons.length);
        setDragRatio(null);
        const season = seasons[next];
        if (season) onCommit(season);
        return;
      }
      setDragRatio(ratioFromClientX(clientX, rect));
    },
    [onCommit, seasons]
  );

  if (seasons.length === 0) return null;

  if (seasons.length === 1) {
    return (
      <p className={cn(type.caption, "font-semibold tabular-nums")}>
        {shortSeason(seasons[0])}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-0.5">
      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-labelledby={labelId}
        aria-label="Season timeline"
        aria-valuemin={0}
        aria-valuemax={last}
        aria-valuenow={previewIndex}
        aria-valuetext={preview}
        className="relative h-7 cursor-pointer touch-none select-none"
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          draggingRef.current = true;
          event.currentTarget.setPointerCapture(event.pointerId);
          moveTo(event.clientX, false);
        }}
        onPointerMove={(event) => {
          if (!draggingRef.current) return;
          moveTo(event.clientX, false);
        }}
        onPointerUp={(event) => {
          if (!draggingRef.current) return;
          draggingRef.current = false;
          moveTo(event.clientX, true);
        }}
        onPointerCancel={() => {
          draggingRef.current = false;
          setDragRatio(null);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
            event.preventDefault();
            const next = seasons[Math.max(0, index - 1)];
            if (next) onCommit(next);
          }
          if (event.key === "ArrowRight" || event.key === "ArrowUp") {
            event.preventDefault();
            const next = seasons[Math.min(last, index + 1)];
            if (next) onCommit(next);
          }
          if (event.key === "Home") {
            event.preventDefault();
            onCommit(seasons[0]);
          }
          if (event.key === "End") {
            event.preventDefault();
            onCommit(seasons[last]);
          }
        }}
      >
        <div
          className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-foreground/10"
          aria-hidden
        />
        <div
          className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full"
          style={{
            ...seasonTrackGradientStyle(
              seasons,
              (season) =>
                resolveSeasonKeys(season, seasonTeamKeys, seasonTeams),
              surface
            ),
            // Dim the trailing (future-of-thumb) portion via a soft mask overlay.
            opacity: isDark ? 0.72 : 0.85,
            transition: dragging ? undefined : "opacity 160ms ease-out",
            WebkitMaskImage: `linear-gradient(90deg, #000 0%, #000 ${ratio * 100}%, rgba(0,0,0,${isDark ? 0.45 : 0.35}) ${ratio * 100}%, rgba(0,0,0,${isDark ? 0.45 : 0.35}) 100%)`,
            maskImage: `linear-gradient(90deg, #000 0%, #000 ${ratio * 100}%, rgba(0,0,0,${isDark ? 0.45 : 0.35}) ${ratio * 100}%, rgba(0,0,0,${isDark ? 0.45 : 0.35}) 100%)`,
          }}
          aria-hidden
        />
        {seasons.map((season, i) => {
          const left = last === 0 ? 0 : (i / last) * 100;
          const teamKeys = resolveSeasonKeys(
            season,
            seasonTeamKeys,
            seasonTeams
          );
          const align =
            i === 0 ? "left" : i === last ? "right" : "center";
          return (
            <span
              key={season}
              className="group/tick absolute top-1/2 z-[3] flex size-4 -translate-x-1/2 -translate-y-1/2 items-center justify-center"
              style={{ left: `${left}%` }}
              onPointerDown={(event) => {
                event.stopPropagation();
                event.preventDefault();
                onCommit(season);
              }}
            >
              <TeamSeasonSwatch teamKeys={teamKeys} size="xs" />
              {!dragging ? (
                <TickHoverTip
                  season={season}
                  teamKeys={teamKeys}
                  align={align}
                />
              ) : null}
            </span>
          );
        })}
        <span
          className="pointer-events-none absolute top-1/2 z-[1] size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background shadow-sm"
          style={{
            left: `${ratio * 100}%`,
            ...thumbFallback,
            transition: dragging ? undefined : "left 160ms ease-out",
          }}
          aria-hidden
        />
      </div>

      <div
        id={labelId}
        className={cn(
          type.caption,
          "flex justify-between tabular-nums text-muted-foreground"
        )}
      >
        <span>{shortSeason(seasons[0])}</span>
        <span>{shortSeason(seasons[last])}</span>
      </div>
    </div>
  );
}
