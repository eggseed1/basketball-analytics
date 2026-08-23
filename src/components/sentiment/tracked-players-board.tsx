"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { TeamLogo } from "@/components/brand/team-logo";
import type {
  SentimentProfileProvenance,
  TrackedPlayerSentimentRow,
} from "@/sentiment/curated-types";
import { type, textLinkClassName } from "@/lib/design-system";
import { cn } from "@/lib/utils";

function scoreLabel(score: number) {
  const pct = Math.round(((score + 1) / 2) * 100);
  return `${pct}%`;
}

function WindowChip({
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
        active
          ? "glass-pill-active"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

type RosterFilter = "all" | "coverage" | "observation";

function provenanceBadge(provenance?: SentimentProfileProvenance): string | null {
  switch (provenance) {
    case "observation":
      return "Obs";
    case "hand_crafted":
      return "Curated";
    case "generated":
      return "Pilot";
    default:
      return null;
  }
}

export function TrackedPlayersBoard({
  rows,
  season,
}: {
  rows: TrackedPlayerSentimentRow[];
  season: string;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<RosterFilter>("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (filter === "coverage" && !row.hasProfile) return false;
      if (filter === "observation" && row.provenance !== "observation") {
        return false;
      }
      if (!q) return true;
      return row.displayName.toLowerCase().includes(q);
    });
  }, [filter, query, rows]);

  const coveredCount = rows.filter((row) => row.hasProfile).length;
  const observationCount = rows.filter(
    (row) => row.provenance === "observation"
  ).length;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className={cn(type.bodySm, "font-bold")}>Tracked players</h2>
        <p className={cn(type.caption, "text-muted-foreground")}>
          {season} roster ({rows.length.toLocaleString()} players) —{" "}
          {coveredCount.toLocaleString()} with prototype coverage ·{" "}
          {observationCount.toLocaleString()} observation-backed.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search players…"
          aria-label="Search tracked players"
          className={cn(
            type.bodySm,
            "min-w-[12rem] flex-1 rounded-md border border-border/70 bg-white/40 px-3 py-1.5"
          )}
        />
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Roster filter">
          <WindowChip active={filter === "all"} onClick={() => setFilter("all")}>
            All roster
          </WindowChip>
          <WindowChip
            active={filter === "coverage"}
            onClick={() => setFilter("coverage")}
          >
            With coverage
          </WindowChip>
          <WindowChip
            active={filter === "observation"}
            onClick={() => setFilter("observation")}
          >
            Observation-backed
          </WindowChip>
        </div>
      </div>

      <div className="sports-card max-h-[28rem] overflow-auto">
        <table className="w-full text-left text-[12px]">
          <thead className="sticky top-0 z-10 border-b border-border bg-secondary/90 text-muted-foreground backdrop-blur-sm">
            <tr>
              <th className="px-3 py-2 font-semibold">Player</th>
              <th className="px-3 py-2 font-semibold">Source</th>
              <th className="px-3 py-2 text-right font-semibold">Fan</th>
              <th className="px-3 py-2 text-right font-semibold">Media</th>
              <th className="px-3 py-2 text-right font-semibold">Volume</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-muted-foreground">
                  No players match this filter.
                </td>
              </tr>
            ) : (
              filtered.map((row) => (
                <tr
                  key={row.playerId}
                  className="border-b border-border/60 last:border-0"
                >
                  <td className="px-3 py-2">
                    <Link
                      href={`/players/${encodeURIComponent(row.playerId)}?view=sentiment`}
                      className={cn("inline-flex items-center gap-2", textLinkClassName)}
                    >
                      {row.teamKey ? (
                        <TeamLogo teamKey={row.teamKey} size="xs" />
                      ) : null}
                      <span className="font-semibold">{row.displayName}</span>
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    {provenanceBadge(row.provenance) ? (
                      <span
                        className={cn(
                          type.caption,
                          "inline-flex rounded-full border border-border/60 bg-white/40 px-1.5 py-0.5 font-semibold text-muted-foreground"
                        )}
                      >
                        {provenanceBadge(row.provenance)}
                      </span>
                    ) : (
                      <span className={cn(type.caption, "text-muted-foreground")}>
                        —
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {row.fan ? scoreLabel(row.fan.score) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {row.media ? scoreLabel(row.media.score) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                    {row.fan
                      ? row.fan.mentionVolume.toLocaleString()
                      : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <p className={cn(type.caption, "text-muted-foreground")}>
        Showing {filtered.length.toLocaleString()} of {rows.length.toLocaleString()}{" "}
        players
      </p>
    </section>
  );
}
