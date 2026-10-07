import type { CSSProperties } from "react";

import { TransitionLink } from "@/components/continuity/query-nav";
import type { PlayerSeason } from "@/data/types";
import { type } from "@/lib/design-system";
import { formatNumber } from "@/lib/format";
import { playerHref } from "@/lib/player-page-contract";
import { cn } from "@/lib/utils";

import { LegendSwatch, VizCard } from "./viz-kit";

const ROWS = 10;
const STEAL = "var(--viz-accent)";
const BLOCK = "var(--chart-4)";

/**
 * Defense tab hero: steals grow left and blocks grow right from each player's
 * name, so perimeter pests and rim protectors separate at a glance.
 */
export function DefenseStocksButterfly({
  players,
  season,
  teamKey,
}: {
  players: PlayerSeason[];
  season: string;
  teamKey: string;
}) {
  const rows = players
    .filter((p) => p.gamesPlayed > 0 && p.minutes > 0)
    .map((p) => ({
      p,
      stl: p.steals / p.gamesPlayed,
      blk: p.blocks / p.gamesPlayed,
    }))
    .filter((r) => r.stl + r.blk > 0)
    .sort((a, b) => b.stl + b.blk - (a.stl + a.blk))
    .slice(0, ROWS);
  if (rows.length < 3) return null;
  const max = Math.max(...rows.map((r) => Math.max(r.stl, r.blk)), 0.5);

  return (
    <VizCard
      title="Hands and rim"
      accentKey={teamKey}
      subtitle="Steals per game reach left, blocks per game reach right. Top ten by steals plus blocks."
      aside={
        <div className="flex flex-wrap gap-3">
          <LegendSwatch color={STEAL} label="Steals" />
          <LegendSwatch color={BLOCK} label="Blocks" />
        </div>
      }
    >
      <div className="flex flex-col gap-1">
        {rows.map((r, i) => (
          <div
            key={r.p.playerId}
            data-viz-row
            className="grid grid-cols-[minmax(0,1fr)_7.5rem_minmax(0,1fr)] items-center gap-2 rounded-md px-1 py-1 sm:grid-cols-[minmax(0,1fr)_10rem_minmax(0,1fr)]"
          >
            <div className="flex items-center justify-end gap-2">
              <span className={cn(type.caption, "tabular-nums text-muted-foreground")}>
                {formatNumber(r.stl, 1)}
              </span>
              <span
                data-viz-bar
                data-motion-bar="x"
                data-tip={`${r.p.playerName}: ${formatNumber(r.stl, 1)} steals per game`}
                data-tip-sub={`${r.p.steals} steals in ${r.p.gamesPlayed} games`}
                className="h-4 rounded-l-sm"
                style={
                  {
                    width: `calc((100% - 2.5rem) * ${r.stl / max})`,
                    minWidth: r.stl > 0 ? 3 : 0,
                    background: STEAL,
                    transformOrigin: "right",
                    "--i": i,
                  } as CSSProperties
                }
              />
            </div>
            <TransitionLink
              href={playerHref({ playerId: r.p.playerId, season })}
              data-viz-label
              className={cn(type.bodySm, "truncate text-center font-semibold text-muted-foreground hover:underline")}
              title={r.p.playerName}
            >
              {r.p.playerName}
            </TransitionLink>
            <div className="flex items-center gap-2">
              <span
                data-viz-bar
                data-motion-bar="x"
                data-tip={`${r.p.playerName}: ${formatNumber(r.blk, 1)} blocks per game`}
                data-tip-sub={`${r.p.blocks} blocks in ${r.p.gamesPlayed} games`}
                className="h-4 rounded-r-sm"
                style={
                  {
                    width: `calc((100% - 2.5rem) * ${r.blk / max})`,
                    minWidth: r.blk > 0 ? 3 : 0,
                    background: BLOCK,
                    "--i": i,
                  } as CSSProperties
                }
              />
              <span className={cn(type.caption, "tabular-nums text-muted-foreground")}>
                {formatNumber(r.blk, 1)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </VizCard>
  );
}
