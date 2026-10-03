"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { TeamLogo } from "@/components/brand/team-logo";
import { LaneOriginTag, sentimentPct } from "@/components/sentiment/sentiment-source";
import { MoreInfo } from "@/components/ui/more-info";
import type {
  CuratedSentimentLane,
  SentimentSeriesPoint,
  TrackedPlayerSentimentRow,
} from "@/sentiment/curated-types";
import { playerMatchesSentimentTopic } from "@/sentiment/topic-filter";
import { resolveTeamBrand } from "@/lib/nba-brand";
import { type, textLinkClassName } from "@/lib/design-system";
import { cn } from "@/lib/utils";

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        type.caption,
        "glass-pill rounded-md px-2.5 py-1 font-semibold transition-colors",
        active ? "glass-pill-active" : "text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

type RosterFilter = "all" | "measured" | "curated";
type SortKey = "name" | "team" | "fan" | "media" | "trend" | "headlines" | "drbl";

const isMeasured = (lane?: CuratedSentimentLane) => Boolean(lane?.origin && lane.origin !== "curated");

function trendDelta(lane?: CuratedSentimentLane): number | null {
  if (!lane || lane.priorScore == null) return null;
  return Math.round((lane.score - lane.priorScore) * 100) / 100;
}

function Sparkline({ points, color }: { points: SentimentSeriesPoint[]; color: string }) {
  if (points.length < 2) {
    return <span className="text-muted-foreground">—</span>;
  }
  const w = 72;
  const h = 20;
  const scores = points.map((p) => p.score);
  const lo = Math.min(0, ...scores);
  const hi = Math.max(0, ...scores);
  const span = hi - lo || 1;
  const x = (i: number) => (i / (points.length - 1)) * w;
  const y = (v: number) => h - ((v - lo) / span) * h;
  const d = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.score).toFixed(1)}`).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden className="overflow-visible">
      <line x1={0} x2={w} y1={y(0)} y2={y(0)} stroke="currentColor" strokeOpacity={0.25} strokeDasharray="2 2" />
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} />
      <circle cx={x(points.length - 1)} cy={y(scores[scores.length - 1]!)} r={2} fill={color} />
    </svg>
  );
}

function LaneCell({ lane }: { lane?: CuratedSentimentLane }) {
  if (!lane) {
    return <span className="text-muted-foreground" title="No source cleared the coverage floor">—</span>;
  }
  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      <span className="font-semibold tabular-nums">{sentimentPct(lane.score)}</span>
      <LaneOriginTag lane={{ origin: lane.origin, mentionVolume: lane.mentionVolume }} />
    </span>
  );
}

export function TrackedPlayersBoard({
  rows,
  season,
  topicFilter,
}: {
  rows: TrackedPlayerSentimentRow[];
  season: string;
  topicFilter?: string;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<RosterFilter>("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "headlines", dir: -1 });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = rows.filter((row) => {
      if (topicFilter && !playerMatchesSentimentTopic(row, topicFilter)) return false;
      const measured = isMeasured(row.fan) || isMeasured(row.media);
      if (filter === "measured" && !measured) return false;
      if (filter === "curated" && measured) return false;
      if (!q) return true;
      return (
        row.displayName.toLowerCase().includes(q) ||
        (resolveTeamBrand(row.teamKey)?.abbr ?? "").toLowerCase() === q
      );
    });
    const value = (row: TrackedPlayerSentimentRow): number | string | null => {
      switch (sort.key) {
        case "name":
          return row.displayName;
        case "team":
          return resolveTeamBrand(row.teamKey)?.abbr ?? null;
        case "fan":
          return row.fan?.score ?? null;
        case "media":
          return row.media?.score ?? null;
        case "trend":
          return trendDelta(row.media);
        case "headlines":
          return row.headlineCount ?? null;
        case "drbl":
          return row.performance?.drbl100 ?? null;
      }
    };
    return [...list].sort((a, b) => {
      const va = value(a);
      const vb = value(b);
      // Blanks sort last in both directions.
      if (va == null && vb == null) return a.displayName.localeCompare(b.displayName);
      if (va == null) return 1;
      if (vb == null) return -1;
      const cmp = typeof va === "string" ? va.localeCompare(String(vb)) : va - (vb as number);
      return cmp * sort.dir || a.displayName.localeCompare(b.displayName);
    });
  }, [filter, query, rows, sort, topicFilter]);

  const measuredCount = rows.filter((row) => isMeasured(row.fan) || isMeasured(row.media)).length;

  const header = (key: SortKey, label: string, align: "left" | "right" = "right") => (
    <th
      className={cn("px-3 py-2 font-semibold", align === "right" && "text-right")}
      aria-sort={sort.key === key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() =>
          setSort((prev) =>
            prev.key === key
              ? { key, dir: prev.dir === 1 ? -1 : 1 }
              : { key, dir: key === "name" || key === "team" ? 1 : -1 }
          )
        }
        className="inline-flex items-center gap-1 hover:text-foreground"
      >
        {label}
        {sort.key === key ? <span aria-hidden>{sort.dir === 1 ? "↑" : "↓"}</span> : null}
      </button>
    </th>
  );

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className={cn(type.bodySm, "font-bold")}>Players</h2>
        <p className={cn(type.caption, "text-muted-foreground")}>
          {rows.length.toLocaleString()} players for {season}.{" "}
          {measuredCount.toLocaleString()} have at least one measured lane.
          {topicFilter ? (
            <>
              {" "}
              Filtering topic{" "}
              <span className="font-semibold text-foreground">{topicFilter.replace(/_/g, " ")}</span>.
            </>
          ) : null}
        </p>
        <MoreInfo>
          <p>
            Trend compares the last 7 days of headline tone with the 7 days before. It stays blank
            until both weeks have enough headlines. DRBL/100 is last season&apos;s.
          </p>
        </MoreInfo>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search players or a team abbreviation…"
          aria-label="Search players"
          className={cn(
            type.bodySm,
            "min-w-[12rem] flex-1 rounded-md border border-border/70 frost-surface px-3 py-1.5"
          )}
        />
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Source filter">
          <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
            All
          </FilterChip>
          <FilterChip active={filter === "measured"} onClick={() => setFilter("measured")}>
            Measured
          </FilterChip>
          <FilterChip active={filter === "curated"} onClick={() => setFilter("curated")}>
            Curated only
          </FilterChip>
        </div>
      </div>

      <div className="sports-card max-h-[34rem] overflow-auto">
        <table className="w-full text-left text-[12px]">
          <thead className="sticky top-0 z-10 border-b border-border bg-secondary/90 text-muted-foreground backdrop-blur-sm">
            <tr>
              {header("name", "Player", "left")}
              {header("team", "Team", "left")}
              {header("fan", "Fan")}
              {header("media", "Media")}
              {header("trend", "Media trend")}
              {header("headlines", "Headlines")}
              {header("drbl", "DRBL/100")}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-4 text-muted-foreground">
                  No players match this filter.
                </td>
              </tr>
            ) : (
              filtered.map((row) => {
                const delta = trendDelta(row.media);
                const abbr = resolveTeamBrand(row.teamKey)?.abbr;
                return (
                  <tr key={row.playerId} className="border-b border-border/60 last:border-0">
                    <td className="px-3 py-2">
                      <Link
                        href={`/players/${encodeURIComponent(row.playerId)}?view=sentiment`}
                        className={cn("font-semibold", textLinkClassName)}
                      >
                        {row.displayName}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      {row.teamKey ? (
                        <Link
                          href={`/teams/${encodeURIComponent(row.teamKey)}?tab=organization`}
                          className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
                        >
                          <TeamLogo teamKey={row.teamKey} size="xs" />
                          {abbr ?? row.teamKey}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <LaneCell lane={row.fan} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <LaneCell lane={row.media} />
                    </td>
                    <td className="px-3 py-2">
                      <span className="flex items-center justify-end gap-2">
                        <Sparkline
                          points={isMeasured(row.media) ? (row.series?.media ?? []) : []}
                          color="rgb(168 85 247)"
                        />
                        <span
                          className={cn(
                            "w-10 text-right tabular-nums",
                            delta == null
                              ? "text-muted-foreground"
                              : delta > 0
                                ? "text-delta-up"
                                : delta < 0
                                  ? "text-delta-down"
                                  : ""
                          )}
                          title={delta == null ? "Not enough earlier headlines to compare" : undefined}
                        >
                          {delta == null
                            ? "—"
                            : `${delta > 0 ? "+" : delta < 0 ? "−" : ""}${Math.round(Math.abs(delta) * 50)}`}
                        </span>
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                      {row.headlineCount != null ? row.headlineCount.toLocaleString() : "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {row.performance ? (
                        <span title={`${row.performance.season}, ${row.performance.possessions.toLocaleString()} possessions`}>
                          {row.performance.drbl100 > 0 ? "+" : ""}
                          {row.performance.drbl100.toFixed(1)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <p className={cn(type.caption, "text-muted-foreground")}>
        Showing {filtered.length.toLocaleString()} of {rows.length.toLocaleString()} players. Trend is
        in percentage points on the 0–100% scale.
      </p>
    </section>
  );
}
