import Link from "next/link";
import type { CSSProperties } from "react";

import { PlayerHeadshot } from "@/components/brand/player-headshot";
import { TeamLogo } from "@/components/brand/team-logo";
import type { CuratedSentimentLane, TrackedPlayerSentimentRow } from "@/sentiment/curated-types";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

import { clamp, lastName, ticks, VizCard } from "./viz-kit";

const MAX_PLAYERS = 12;

type Point = {
  key: string;
  label: string;
  fan: number;
  media: number;
  href: string;
  player?: TrackedPlayerSentimentRow;
};

function comparable(fan?: CuratedSentimentLane, media?: CuratedSentimentLane): boolean {
  return Boolean(fan && media && (fan.origin === "curated") === (media.origin === "curated"));
}

/** Lane score (−1 to 1) as the 0 to 100 percentage the rest of the site shows. */
function pct(score: number): number {
  return ((score + 1) / 2) * 100;
}

/**
 * Sentiment tab hero: the franchise and its tracked players placed by
 * media tone (across) and fan tone (up). Above the diagonal, fans are warmer
 * than the coverage; below it, the coverage is warmer than the fans.
 */
export function SentimentToneMap({
  teamId,
  teamProfile,
  players,
}: {
  teamId: string;
  teamProfile?: { fan?: CuratedSentimentLane; media?: CuratedSentimentLane } | null;
  players: TrackedPlayerSentimentRow[];
}) {
  const points: Point[] = [];
  if (teamProfile && comparable(teamProfile.fan, teamProfile.media)) {
    points.push({
      key: "team",
      label: "Franchise",
      fan: pct(teamProfile.fan!.score),
      media: pct(teamProfile.media!.score),
      href: "/sentiment?view=teams",
    });
  }
  const tracked = players.slice(0, MAX_PLAYERS);
  for (const row of tracked) {
    if (!comparable(row.fan, row.media)) continue;
    points.push({
      key: row.playerId,
      label: row.displayName,
      fan: pct(row.fan!.score),
      media: pct(row.media!.score),
      href: `/players/${encodeURIComponent(row.playerId)}?view=sentiment`,
      player: row,
    });
  }
  if (points.length < 2) return null;
  const left = tracked.length + (teamProfile ? 1 : 0) - points.length;
  const vals = points.flatMap((p) => [p.fan, p.media]);
  const lo = clamp(Math.floor((Math.min(...vals) - 8) / 10) * 10, 0, 100);
  const hi = clamp(Math.ceil((Math.max(...vals) + 8) / 10) * 10, 0, 100);
  const pos = (v: number) => ((v - lo) / (hi - lo)) * 100;

  return (
    <VizCard
      title="Fans vs the coverage"
      accentKey={teamId}
      subtitle="Each face sits at its media tone (across) and fan tone (up). On the dashed line the two agree. Above it fans are warmer than the coverage, below it the coverage is warmer."
      footnote={
        left > 0
          ? `${left} left off because one lane is curated and the other measured, so the two can't be compared.`
          : undefined
      }
    >
      <div className="relative mb-9 ml-9 mr-2 mt-4 h-[300px] sm:h-[360px]">
        <svg aria-hidden className="absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
          <polygon points="0,100 100,0 0,0" fill="color-mix(in oklab, var(--viz-accent) 6%, transparent)" />
          <line x1="0" y1="100" x2="100" y2="0" stroke="currentColor" strokeOpacity={0.4} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" className="text-foreground" />
        </svg>
        <span className={cn(type.micro, "absolute left-2 top-1.5 font-semibold uppercase tracking-wide text-muted-foreground")}>
          Fans warmer
        </span>
        <span className={cn(type.micro, "absolute bottom-1.5 right-2 font-semibold uppercase tracking-wide text-muted-foreground")}>
          Coverage warmer
        </span>
        {ticks(lo, hi, 4).map((t) => (
          <span key={`x${t}`} className={cn(type.micro, "absolute -bottom-5 -translate-x-1/2 tabular-nums text-muted-foreground")} style={{ left: `${pos(t)}%` }}>
            {t}%
          </span>
        ))}
        {ticks(lo, hi, 4).map((t) => (
          <span key={`y${t}`} className={cn(type.micro, "absolute -left-9 translate-y-1/2 tabular-nums text-muted-foreground")} style={{ bottom: `${pos(t)}%` }}>
            {t}%
          </span>
        ))}
        <span className={cn(type.micro, "absolute -bottom-9 left-1/2 -translate-x-1/2 font-semibold uppercase tracking-wide text-muted-foreground")}>
          Media tone →
        </span>
        <span className={cn(type.micro, "absolute -left-9 -top-5 font-semibold uppercase tracking-wide text-muted-foreground")}>
          ↑ Fan tone
        </span>
        {points.map((p, i) => {
          const gap = Math.round(p.fan - p.media);
          return (
            <Link
              key={p.key}
              href={p.href}
              data-viz-mark
              data-motion-dot
              data-tip={p.label}
              data-tip-sub={`Fans ${Math.round(p.fan)}% · media ${Math.round(p.media)}% · ${gap === 0 ? "they agree" : gap > 0 ? `fans ${gap} pts warmer` : `media ${-gap} pts warmer`}`}
              aria-label={`${p.label}: fans ${Math.round(p.fan)}%, media ${Math.round(p.media)}%`}
              className="absolute flex items-center justify-center rounded-full bg-background shadow-[0_0_0_2px_var(--viz-accent)]"
              style={
                {
                  left: `${pos(p.media)}%`,
                  bottom: `${pos(p.fan)}%`,
                  translate: "-50% 50%",
                  zIndex: 2 + i,
                  "--i": i,
                } as CSSProperties
              }
            >
              {p.player ? (
                <PlayerHeadshot playerId={p.player.playerId} name={p.player.displayName} teamKey={p.player.teamKey} size="xs" />
              ) : (
                <span className="flex h-8 w-8 items-center justify-center">
                  <TeamLogo teamKey={teamId} size="xs" />
                </span>
              )}
              <span className={cn(type.micro, "pointer-events-none absolute left-1/2 top-full mt-0.5 -translate-x-1/2 whitespace-nowrap font-semibold")}>
                {p.player ? lastName(p.label) : "Team"}
              </span>
            </Link>
          );
        })}
      </div>
    </VizCard>
  );
}
