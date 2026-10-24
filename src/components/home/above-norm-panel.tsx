"use client";

import Link from "next/link";

import { PlayerHeadshot } from "@/components/brand/player-headshot";
import { TeamLogo } from "@/components/brand/team-logo";
import { teamColor } from "@/components/home/insight-visuals";
import { AppLink } from "@/components/ui/app-link";
import { cssPct } from "@/lib/format";
import type { RecentInsight } from "@/lib/recent-insights";
import { surpriseRule } from "@/lib/recent-insights";

function Row({ insight }: { insight: RecentInsight }) {
  const line = insight.line;
  const stat = line?.surpriseStat;
  const base = line?.baseline;
  if (!line || !stat || !base || !insight.playerId) return null;
  const rule = surpriseRule(stat);
  const value = line[stat];
  const avg = base[stat];
  const scale = Math.max(value, avg, 1) * 1.08;
  const color = teamColor(insight.teamId);
  return (
    <li data-motion="row" className="flex items-center gap-3 py-2.5">
      <PlayerHeadshot
        playerId={insight.playerId}
        name={line.playerName}
        teamKey={insight.teamId}
        size="sm"
        className="shrink-0"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-baseline justify-between gap-2">
          <Link
            href={`/players/${encodeURIComponent(insight.playerId)}`}
            className="type-body-sm truncate font-semibold leading-tight hover:underline"
          >
            {line.playerName}
          </Link>
          <span className="type-body-sm shrink-0 font-semibold tabular-nums" style={{ color }}>
            +{Math.round(value - avg)} {rule.label}
          </span>
        </div>
        <span className="relative h-1.5 rounded-full bg-secondary" title={`${value} vs ${avg.toFixed(1)} a game`}>
          <span
            className="absolute inset-y-0 left-0 rounded-full"
            style={{ width: cssPct(value / scale), background: color }}
          />
          <span
            aria-hidden
            className="absolute -inset-y-px w-px rounded-full bg-foreground/70"
            style={{ left: cssPct(avg / scale) }}
          />
        </span>
        <div className="type-caption flex items-center justify-between gap-2 text-muted-foreground">
          <span className="flex min-w-0 items-center gap-1.5">
            {insight.teamId ? <TeamLogo teamKey={insight.teamId} size="2xs" /> : null}
            {insight.gameId ? (
              <AppLink
                href={`/games/${encodeURIComponent(insight.gameId)}`}
                className="truncate hover:text-foreground hover:underline"
              >
                vs {line.opponentAbbr}
                {line.result ? ` · ${line.result}` : ""}
              </AppLink>
            ) : (
              <span className="truncate">vs {line.opponentAbbr}</span>
            )}
          </span>
          <span className="shrink-0 tabular-nums">
            {value} vs {avg.toFixed(1)} avg
          </span>
        </div>
      </div>
    </li>
  );
}

/** Sidebar list of nights far above a player's own per-game averages. */
export function AboveNormPanel({ nights }: { nights: RecentInsight[] }) {
  const rows = nights.filter((n) => n.focus === "surprise" && n.line?.baseline);
  if (!rows.length) return null;
  const seasons = [...new Set(rows.map((r) => r.line!.baseline!.season))].join(" and ");
  return (
    <section aria-labelledby="above-norm-title" className="sports-card flex flex-col gap-2 p-4">
      <h2 id="above-norm-title" className="type-heading">Above their norm</h2>
      <ul className="flex flex-col divide-y divide-border/40">
        {rows.map((r) => (
          <Row key={r.id} insight={r} />
        ))}
      </ul>
      <p className="type-caption text-muted-foreground">
        Bars are the game, ticks are his per-game average for {seasons}. Players without a full
        season of games are left out.
      </p>
    </section>
  );
}
