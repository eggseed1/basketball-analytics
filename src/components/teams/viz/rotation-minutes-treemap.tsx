import type { CSSProperties } from "react";

import { TransitionLink } from "@/components/continuity/query-nav";
import type { PlayerSeason } from "@/data/types";
import { type } from "@/lib/design-system";
import { formatNumber, formatPct } from "@/lib/format";
import { playerHref } from "@/lib/player-page-contract";
import type { RotationLadder } from "@/lib/team-explorer";
import { cn } from "@/lib/utils";

import { lastName, LegendSwatch, VizCard } from "./viz-kit";

type Role = "starter" | "bench" | "spot";
type Rect = { x: number; y: number; w: number; h: number };
type Item = { p: PlayerSeason; role: Role; area: number };

/** Layout box, close to the desktop container's shape. Areas stay proportional at any size. */
const W = 220;
const H = 100;

const ROLE_MIX: Record<Role, number> = { starter: 88, bench: 52, spot: 24 };
const ROLE_LABEL: Record<Role, string> = {
  starter: "Starter",
  bench: "Bench regular",
  spot: "Spot minutes",
};

function worst(row: Item[], side: number): number {
  const sum = row.reduce((s, r) => s + r.area, 0);
  const max = Math.max(...row.map((r) => r.area));
  const min = Math.min(...row.map((r) => r.area));
  return Math.max((side * side * max) / (sum * sum), (sum * sum) / (side * side * min));
}

/** Squarified treemap (Bruls, Huizing, van Wijk) over areas already in layout units. */
function squarify(items: Item[], box: Rect): Array<Item & Rect> {
  const out: Array<Item & Rect> = [];
  let { x, y, w, h } = box;
  const rest = [...items];
  while (rest.length) {
    const side = Math.min(w, h);
    let row: Item[] = [];
    let best = Infinity;
    while (rest.length) {
      const next = [...row, rest[0]!];
      const score = worst(next, side);
      if (row.length && score > best) break;
      row = next;
      best = score;
      rest.shift();
    }
    const rowArea = row.reduce((s, r) => s + r.area, 0);
    if (w >= h) {
      const cw = rowArea / h;
      let cy = y;
      for (const r of row) {
        const rh = r.area / cw;
        out.push({ ...r, x, y: cy, w: cw, h: rh });
        cy += rh;
      }
      x += cw;
      w -= cw;
    } else {
      const rh = rowArea / w;
      let cx = x;
      for (const r of row) {
        const rw = r.area / rh;
        out.push({ ...r, x: cx, y, w: rw, h: rh });
        cx += rw;
      }
      y += rh;
      h -= rh;
    }
  }
  return out;
}

/**
 * Rotation tab hero: the season's minutes as a treemap. Each tile is one
 * player sized by total minutes and shaded by role, so the core and the long
 * tail read as shapes instead of rows.
 */
export function RotationMinutesTreemap({
  players,
  ladder,
  season,
  teamKey,
}: {
  players: PlayerSeason[];
  ladder: RotationLadder;
  season: string;
  teamKey: string;
}) {
  const roleOf = new Map<string, Role>();
  for (const p of ladder.starters) roleOf.set(p.playerId, "starter");
  for (const p of ladder.bench) roleOf.set(p.playerId, "bench");
  const pool = players
    .filter((p) => p.minutes > 0 && p.gamesPlayed > 0)
    .sort((a, b) => b.minutes - a.minutes);
  const total = pool.reduce((s, p) => s + p.minutes, 0);
  if (pool.length < 3 || !(total > 0)) return null;

  const items: Item[] = pool.map((p) => ({
    p,
    role: roleOf.get(p.playerId) ?? "spot",
    area: (p.minutes / total) * W * H,
  }));
  const tiles = squarify(items, { x: 0, y: 0, w: W, h: H });

  return (
    <VizCard
      title="Where the minutes go"
      accentKey={teamKey}
      subtitle={`Every tile is one player, sized by total ${season} minutes. Starters started at least half their games.`}
      aside={
        <div className="flex flex-wrap gap-3">
          {(["starter", "bench", "spot"] as const).map((role) => (
            <LegendSwatch
              key={role}
              color={`color-mix(in oklab, var(--viz-accent) ${ROLE_MIX[role]}%, var(--muted))`}
              label={ROLE_LABEL[role]}
            />
          ))}
        </div>
      }
      footnote={`${formatNumber(total, 0)} player minutes across ${pool.length} players.`}
    >
      <div className="relative h-[340px] w-full overflow-hidden rounded-lg sm:h-[400px]">
        {tiles.map((t, i) => {
          const share = t.p.minutes / total;
          const mpg = t.p.minutes / t.p.gamesPlayed;
          const big = t.w > 26 && t.h > 14;
          const mid = !big && t.w > 13 && t.h > 9;
          const dark = ROLE_MIX[t.role] > 60;
          const usg =
            t.p.usagePct != null && Number.isFinite(t.p.usagePct) && t.p.usagePct > 0
              ? ` · ${formatPct(t.p.usagePct, 0)} usage`
              : "";
          return (
            <TransitionLink
              key={t.p.playerId}
              href={playerHref({ playerId: t.p.playerId, season })}
              data-viz-mark
              data-motion-dot
              data-tip={t.p.playerName}
              data-tip-sub={`${ROLE_LABEL[t.role]} · ${formatNumber(mpg, 1)} MPG · ${t.p.gamesStarted}/${t.p.gamesPlayed} started${usg}`}
              aria-label={`${t.p.playerName}, ${formatPct(share, 0)} of minutes`}
              className="absolute flex flex-col justify-between overflow-hidden rounded-[6px] p-1.5 sm:p-2"
              style={
                {
                  left: `calc(${(t.x / W) * 100}% + 1.5px)`,
                  top: `calc(${(t.y / H) * 100}% + 1.5px)`,
                  width: `calc(${(t.w / W) * 100}% - 3px)`,
                  height: `calc(${(t.h / H) * 100}% - 3px)`,
                  background: `color-mix(in oklab, var(--viz-accent) ${ROLE_MIX[t.role]}%, var(--muted))`,
                  color: dark ? "var(--background)" : "var(--foreground)",
                  "--viz-lift": 1.04,
                  "--i": i,
                } as CSSProperties
              }
            >
              {big || mid ? (
                <span className={cn(big ? type.bodySm : type.micro, "truncate font-bold leading-tight")}>
                  {big ? t.p.playerName : lastName(t.p.playerName)}
                </span>
              ) : null}
              {big ? (
                <span className={cn(type.caption, "tabular-nums opacity-85")}>
                  {formatPct(share, 0)} · {formatNumber(mpg, 1)} MPG
                </span>
              ) : mid ? (
                <span className={cn(type.micro, "tabular-nums opacity-85")}>{formatPct(share, 0)}</span>
              ) : null}
            </TransitionLink>
          );
        })}
      </div>
    </VizCard>
  );
}
