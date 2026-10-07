import type { CSSProperties } from "react";

import { TransitionLink } from "@/components/continuity/query-nav";
import type { PlayerSeason } from "@/data/types";
import { type } from "@/lib/design-system";
import { formatNumber, formatPct } from "@/lib/format";
import { playerHref } from "@/lib/player-page-contract";
import { cn } from "@/lib/utils";

import { clamp, lastName, LegendSwatch, ticks, VizCard } from "./viz-kit";

const MIN_MINUTES = 100;
const SHARE_SLOTS = 7;

type Dot = {
  p: PlayerSeason;
  usg: number;
  ts: number;
  ppg: number;
};

function finitePositive(n: number | null | undefined): n is number {
  return n != null && Number.isFinite(n) && n > 0;
}

/**
 * Offense tab hero: every rotation player placed by how much of the offense
 * runs through him (usage) and how well he scores (true shooting), sized by
 * points per game. A stacked bar under it splits the roster's points.
 */
export function OffenseUsageMap({
  players,
  season,
  teamKey,
  teamTs,
  leagueTs,
}: {
  players: PlayerSeason[];
  season: string;
  teamKey: string;
  teamTs: number | null;
  leagueTs: number | null;
}) {
  const dots: Dot[] = players
    .filter(
      (p) =>
        p.minutes >= MIN_MINUTES &&
        p.gamesPlayed > 0 &&
        finitePositive(p.usagePct) &&
        finitePositive(p.trueShootingPct)
    )
    .map((p) => ({
      p,
      usg: p.usagePct as number,
      ts: p.trueShootingPct as number,
      ppg: p.points / p.gamesPlayed,
    }));
  if (dots.length < 3) return null;

  const usgVals = dots.map((d) => d.usg);
  const tsVals = dots.map((d) => d.ts);
  const xLo = Math.max(0, Math.floor((Math.min(...usgVals) - 0.02) * 50) / 50);
  const xHi = Math.ceil((Math.max(...usgVals) + 0.02) * 50) / 50;
  const refs = [teamTs, leagueTs].filter(finitePositive);
  const yLo = Math.floor((Math.min(...tsVals, ...refs) - 0.02) * 50) / 50;
  const yHi = Math.ceil((Math.max(...tsVals, ...refs) + 0.02) * 50) / 50;
  const x = (v: number) => ((v - xLo) / (xHi - xLo)) * 100;
  const y = (v: number) => ((v - yLo) / (yHi - yLo)) * 100;
  const maxPpg = Math.max(...dots.map((d) => d.ppg), 1);
  const size = (ppg: number) => 12 + 26 * Math.sqrt(Math.max(0, ppg) / maxPpg);
  const labelled = new Set(
    [...dots].sort((a, b) => b.ppg - a.ppg).slice(0, 6).map((d) => d.p.playerId)
  );
  const medianUsg = [...usgVals].sort((a, b) => a - b)[Math.floor(usgVals.length / 2)]!;
  const midY = finitePositive(leagueTs) ? leagueTs : teamTs;

  const scorers = players
    .filter((p) => p.points > 0)
    .sort((a, b) => b.points - a.points);
  const totalPts = scorers.reduce((sum, p) => sum + p.points, 0);
  const top = scorers.slice(0, SHARE_SLOTS);
  const restPts = totalPts - top.reduce((sum, p) => sum + p.points, 0);

  return (
    <VizCard
      title="Who carries the offense"
      accentKey={teamKey}
      subtitle={
        <>
          Each player is placed by usage (share of team plays he finishes) and true shooting.
          Bigger circles score more per game. Players with {MIN_MINUTES}+ minutes.
        </>
      }
      aside={
        <div className="flex flex-wrap gap-3">
          {finitePositive(teamTs) ? (
            <>
              <LegendSwatch color="var(--viz-accent)" shape="line" label={`Team TS ${formatPct(teamTs, 1)}`} />
              <LegendSwatch color="var(--viz-accent)" shape="dot" label="At or above team TS" />
              <LegendSwatch color="var(--viz-accent)" shape="dot" outline label="Below" />
            </>
          ) : null}
          {finitePositive(leagueTs) ? (
            <LegendSwatch color="var(--muted-foreground)" shape="line" label={`League avg ${formatPct(leagueTs, 1)}`} />
          ) : null}
        </div>
      }
    >
      <div className="relative ml-9 mr-2 mb-9 mt-4 h-[300px] sm:h-[360px]">
        {/* quadrant wash */}
        {midY != null ? (
          <>
            <div
              aria-hidden
              className="absolute right-0 top-0 bg-[color-mix(in_oklab,var(--data-positive)_7%,transparent)]"
              style={{ left: `${x(medianUsg)}%`, bottom: `${y(midY)}%` }}
            />
            <div
              aria-hidden
              className="absolute bottom-0 right-0 bg-[color-mix(in_oklab,var(--data-negative)_6%,transparent)]"
              style={{ left: `${x(medianUsg)}%`, top: `${100 - y(midY)}%` }}
            />
            <span className={cn(type.micro, "absolute right-1.5 top-1 font-semibold uppercase tracking-wide text-muted-foreground")}>
              Big load, efficient
            </span>
            <span className={cn(type.micro, "absolute bottom-1 right-1.5 font-semibold uppercase tracking-wide text-muted-foreground")}>
              Big load, inefficient
            </span>
            <span className={cn(type.micro, "absolute left-1.5 top-1 font-semibold uppercase tracking-wide text-muted-foreground")}>
              Finishers
            </span>
          </>
        ) : null}

        {ticks(yLo, yHi, 4).map((t) => (
          <div key={`y${t}`} aria-hidden className="absolute inset-x-0 border-t border-dashed border-border/70" style={{ bottom: `${y(t)}%` }}>
            <span className={cn(type.micro, "absolute -left-9 -translate-y-1/2 tabular-nums text-muted-foreground")}>
              {formatPct(t, 0)}
            </span>
          </div>
        ))}
        {ticks(xLo, xHi, 5).map((t) => (
          <span
            key={`x${t}`}
            aria-hidden
            className={cn(type.micro, "absolute -bottom-5 -translate-x-1/2 tabular-nums text-muted-foreground")}
            style={{ left: `${x(t)}%` }}
          >
            {formatPct(t, 0)}
          </span>
        ))}
        <span className={cn(type.micro, "absolute -bottom-9 left-1/2 -translate-x-1/2 font-semibold uppercase tracking-wide text-muted-foreground")}>
          Usage →
        </span>
        <span className={cn(type.micro, "absolute -left-9 -top-5 font-semibold uppercase tracking-wide text-muted-foreground")}>
          TS%
        </span>

        {finitePositive(leagueTs) ? (
          <div aria-hidden className="absolute inset-x-0 border-t-[1.5px] border-dashed border-muted-foreground/70" style={{ bottom: `${y(leagueTs)}%` }} />
        ) : null}
        {finitePositive(teamTs) ? (
          <div
            data-motion-bar="x"
            aria-hidden
            className="absolute inset-x-0 h-0 border-t-2 border-[var(--viz-accent)]"
            style={{ bottom: `${y(teamTs)}%` }}
          />
        ) : null}

        {[...dots]
          .sort((a, b) => b.ppg - a.ppg)
          .map((d, i) => {
            const s = size(d.ppg);
            const left = clamp(x(d.usg), 0, 100);
            const bottom = clamp(y(d.ts), 0, 100);
            const above = finitePositive(teamTs) ? d.ts >= teamTs : true;
            return (
              <TransitionLink
                key={d.p.playerId}
                href={playerHref({ playerId: d.p.playerId, season })}
                data-viz-mark
                data-motion-dot
                data-tip={d.p.playerName}
                data-tip-sub={`${formatNumber(d.ppg, 1)} PPG · ${formatPct(d.usg, 1)} usage · ${formatPct(d.ts, 1)} TS`}
                aria-label={`${d.p.playerName}: ${formatPct(d.usg, 1)} usage, ${formatPct(d.ts, 1)} true shooting`}
                className="absolute rounded-full border-2 border-background"
                style={
                  {
                    left: `${left}%`,
                    bottom: `${bottom}%`,
                    width: s,
                    height: s,
                    translate: "-50% 50%",
                    background: above
                      ? "color-mix(in oklab, var(--viz-accent) 85%, transparent)"
                      : "color-mix(in oklab, var(--viz-accent) 16%, var(--background))",
                    boxShadow: above ? undefined : "inset 0 0 0 2px var(--viz-accent)",
                    zIndex: 2 + i,
                    "--i": i,
                  } as CSSProperties
                }
              />
            );
          })}
        {dots
          .filter((d) => labelled.has(d.p.playerId))
          .map((d) => (
            <span
              key={`label-${d.p.playerId}`}
              aria-hidden
              data-motion-item
              className={cn(
                type.micro,
                "pointer-events-none absolute z-40 -translate-y-1/2 whitespace-nowrap font-semibold text-foreground [text-shadow:0_0_3px_var(--background),0_0_3px_var(--background),0_0_2px_var(--background)]"
              )}
              style={{
                left: `calc(${clamp(x(d.usg), 0, 100)}% + ${size(d.ppg) / 2 + 3}px)`,
                bottom: `${clamp(y(d.ts), 0, 100)}%`,
                translate: "0 50%",
              }}
            >
              {lastName(d.p.playerName)}
            </span>
          ))}
      </div>

      {totalPts > 0 ? (
        <div className="flex flex-col gap-2 border-t border-border/60 pt-4">
          <div className="flex items-baseline justify-between gap-2">
            <h4 className={cn(type.bodySm, "font-semibold")}>Share of the points</h4>
            <span className={cn(type.caption, "text-muted-foreground")}>
              Season totals for this roster list
            </span>
          </div>
          <div className="flex h-9 w-full overflow-hidden rounded-md bg-muted" role="img" aria-label="Share of roster points by player">
            {top.map((p, i) => {
              const share = p.points / totalPts;
              return (
                <span
                  key={p.playerId}
                  data-viz-bar
                  data-motion-bar="x"
                  data-tip={p.playerName}
                  data-tip-sub={`${formatPct(share, 1)} of the points · ${formatNumber(p.points, 0)} total`}
                  className="relative flex h-full items-center overflow-hidden border-r-2 border-background px-1.5"
                  style={
                    {
                      width: `${share * 100}%`,
                      background: `color-mix(in oklab, var(--viz-accent) ${Math.max(22, 92 - i * 11)}%, var(--muted))`,
                      color: i < 3 ? "var(--background)" : "var(--foreground)",
                      "--i": i * 2,
                    } as CSSProperties
                  }
                >
                  {share >= 0.08 ? (
                    <span className={cn(type.micro, "truncate font-bold")}>
                      {lastName(p.playerName)} {formatPct(share, 0)}
                    </span>
                  ) : null}
                </span>
              );
            })}
            {restPts > 0 ? (
              <span
                data-viz-bar
                data-motion-bar="x"
                data-tip="Everyone else"
                data-tip-sub={`${formatPct(restPts / totalPts, 1)} of the points · ${scorers.length - top.length} players`}
                className="h-full"
                style={{ width: `${(restPts / totalPts) * 100}%`, "--i": SHARE_SLOTS * 2 } as CSSProperties}
              />
            ) : null}
          </div>
        </div>
      ) : null}
    </VizCard>
  );
}
