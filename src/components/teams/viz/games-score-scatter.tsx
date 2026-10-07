import type { CSSProperties } from "react";

import { TransitionLink } from "@/components/continuity/query-nav";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

import { LegendSwatch, LOSS, signed, ticks, VizCard, WIN } from "./viz-kit";

export type ScoreGame = {
  id: string;
  href: string;
  dateLabel: string;
  home: boolean;
  oppAbbr: string;
  teamScore: number;
  oppScore: number;
  overtime: boolean;
  postseason: boolean;
};

/**
 * Games tab hero: every final as a dot, points scored up and points allowed
 * across. Wins land above the tie line, and how far above shows the margin.
 */
export function GamesScoreScatter({
  games,
  season,
  teamKey,
}: {
  games: ScoreGame[];
  season: string;
  teamKey: string;
}) {
  if (games.length < 3) return null;
  const all = games.flatMap((g) => [g.teamScore, g.oppScore]);
  const lo = Math.floor((Math.min(...all) - 4) / 10) * 10;
  const hi = Math.ceil((Math.max(...all) + 4) / 10) * 10;
  const pos = (v: number) => ((v - lo) / (hi - lo)) * 100;
  const wins = games.filter((g) => g.teamScore > g.oppScore);
  const close = games.filter((g) => Math.abs(g.teamScore - g.oppScore) <= 5);
  const closeWins = close.filter((g) => g.teamScore > g.oppScore).length;
  const best = [...games].sort((a, b) => b.teamScore - b.oppScore - (a.teamScore - a.oppScore))[0]!;
  const worst = [...games].sort((a, b) => a.teamScore - a.oppScore - (b.teamScore - b.oppScore))[0]!;
  const hasPost = games.some((g) => g.postseason);

  return (
    <VizCard
      title="Every game, scored"
      accentKey={teamKey}
      subtitle={`Points scored (up) against points allowed (across) in each ${season} final. Above the diagonal is a win, and the farther from it, the bigger the margin.`}
      aside={
        <div className="flex flex-wrap gap-3">
          <LegendSwatch color={WIN} shape="dot" label={`Win (${wins.length})`} />
          <LegendSwatch color={LOSS} shape="dot" label={`Loss (${games.length - wins.length})`} />
          {hasPost ? <LegendSwatch color="var(--foreground)" shape="dot" outline label="Postseason" /> : null}
        </div>
      }
      footnote={
        close.length
          ? `${closeWins}-${close.length - closeWins} in games decided by 5 or fewer. Biggest win ${signed(best.teamScore - best.oppScore, 0)} vs ${best.oppAbbr}, worst loss ${signed(worst.teamScore - worst.oppScore, 0)} vs ${worst.oppAbbr}.`
          : undefined
      }
    >
      <div className="relative mb-9 ml-9 mr-2 mt-4 h-[320px] sm:h-[380px]">
        <svg aria-hidden className="absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
          <polygon points="0,100 100,0 0,0" fill="color-mix(in oklab, var(--data-positive) 7%, transparent)" />
          <polygon points="0,100 100,0 100,100" fill="color-mix(in oklab, var(--data-negative) 6%, transparent)" />
          <line
            x1="0"
            y1="100"
            x2="100"
            y2="0"
            stroke="currentColor"
            strokeOpacity={0.45}
            strokeDasharray="3 3"
            vectorEffect="non-scaling-stroke"
            className="text-foreground"
          />
        </svg>
        <span className={cn(type.micro, "absolute left-2 top-1.5 font-semibold uppercase tracking-wide text-[var(--data-positive)]")}>
          Wins
        </span>
        <span className={cn(type.micro, "absolute bottom-1.5 right-2 font-semibold uppercase tracking-wide text-[var(--data-negative)]")}>
          Losses
        </span>
        {ticks(lo, hi, 5).map((t) => (
          <span key={`x${t}`} className={cn(type.micro, "absolute -bottom-5 -translate-x-1/2 tabular-nums text-muted-foreground")} style={{ left: `${pos(t)}%` }}>
            {t}
          </span>
        ))}
        {ticks(lo, hi, 5).map((t) => (
          <span key={`y${t}`} className={cn(type.micro, "absolute -left-8 translate-y-1/2 tabular-nums text-muted-foreground")} style={{ bottom: `${pos(t)}%` }}>
            {t}
          </span>
        ))}
        <span className={cn(type.micro, "absolute -bottom-9 left-1/2 -translate-x-1/2 font-semibold uppercase tracking-wide text-muted-foreground")}>
          Points allowed →
        </span>
        <span className={cn(type.micro, "absolute -left-9 -top-5 font-semibold uppercase tracking-wide text-muted-foreground")}>
          ↑ Points scored
        </span>
        {games.map((g, i) => {
          const win = g.teamScore > g.oppScore;
          return (
            <TransitionLink
              key={g.id}
              href={g.href}
              data-viz-mark
              data-motion-dot
              data-tip={`${g.dateLabel} · ${win ? "W" : "L"} ${g.teamScore}-${g.oppScore}${g.overtime ? " (OT)" : ""}`}
              data-tip-sub={`${g.home ? "vs" : "at"} ${g.oppAbbr} · margin ${signed(g.teamScore - g.oppScore, 0)}${g.postseason ? " · postseason" : ""}`}
              aria-label={`${g.dateLabel}, ${win ? "won" : "lost"} ${g.teamScore} to ${g.oppScore} ${g.home ? "versus" : "at"} ${g.oppAbbr}`}
              className="absolute h-2.5 w-2.5 rounded-full sm:h-3 sm:w-3"
              style={
                {
                  left: `${pos(g.oppScore)}%`,
                  bottom: `${pos(g.teamScore)}%`,
                  translate: "-50% 50%",
                  background: `color-mix(in oklab, ${win ? WIN : LOSS} 78%, transparent)`,
                  boxShadow: g.postseason ? "0 0 0 2px var(--background), 0 0 0 3.5px var(--foreground)" : "0 0 0 1px var(--background)",
                  "--viz-lift": 1.7,
                  "--i": i,
                } as CSSProperties
              }
            />
          );
        })}
      </div>
    </VizCard>
  );
}
