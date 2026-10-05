import { TransitionLink } from "@/components/continuity/query-nav";
import {
  fmtCount,
  fmtSigned,
  percentileLabel,
  toneClass,
} from "@/components/on-off/on-off-parts";
import type { OnOffSeasonRow } from "@/lib/on-off/derive";
import type { OnOffView } from "@/lib/on-off/metrics";
import type { OnOffPhase } from "@/lib/on-off/types";
import { type } from "@/lib/design-system";
import { playerHref } from "@/lib/player-page-contract";
import { cn } from "@/lib/utils";

const th = "px-2 py-1.5 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground";
const td = "px-2 py-1.5 text-right tabular-nums whitespace-nowrap";

export type OnOffSeasonTableRow = OnOffSeasonRow & { teamAbbr: string };

/** A player's swing in every built season and playoff run, for one view. */
export function OnOffSeasonTable({
  rows,
  view,
  playerId,
  season,
  phase,
}: {
  rows: OnOffSeasonTableRow[];
  view: OnOffView;
  playerId: string;
  season: string;
  phase: OnOffPhase;
}) {
  const shown = rows.filter((r) => r.views[view].poss > 0);
  if (!shown.length) {
    return (
      <p className={cn(type.bodySm, "text-muted-foreground")}>
        No {view === "clutch" ? "clutch " : ""}possessions in any season with possession data.
      </p>
    );
  }
  const anySmall = shown.some((r) => r.views[view].smallSample);
  return (
    <div className="flex flex-col gap-2">
      <div className="touch-scroll-x overflow-x-auto">
        <table className="w-full min-w-[38rem] text-[13px]">
          <thead>
            <tr className="border-b border-border">
              <th className={cn(th, "text-left")}>Season</th>
              <th className={cn(th, "text-left")}>Team</th>
              <th className={th}>GP</th>
              <th className={th} title="Possessions on the floor, offense plus defense">
                Poss
              </th>
              <th className={th}>Swing</th>
              <th className={th}>95% range</th>
              <th className={th} title="Swing with opponent 3P% and FT% at league average">
                Luck adj.
              </th>
              <th className={th} title="Regular seasons with 2,000 or more possessions only">
                League pct
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const v = r.views[view];
              const current = r.season === season && r.phase === phase;
              return (
                <tr
                  key={`${r.season}-${r.phase}-${r.teamId}`}
                  aria-current={current ? "true" : undefined}
                  className={cn(
                    "border-b border-border/60 last:border-0",
                    current && "bg-foreground/[0.05]"
                  )}
                >
                  <td className={cn(td, "text-left")}>
                    <TransitionLink
                      href={playerHref({ playerId, season: r.season, view: "onoff" })}
                      className={cn("font-medium", current && "font-semibold")}
                    >
                      {r.season}
                    </TransitionLink>
                    {r.phase === "playoffs" ? (
                      <span className="ml-1.5 text-muted-foreground">playoffs</span>
                    ) : null}
                  </td>
                  <td className={cn(td, "text-left")}>{r.teamAbbr || "—"}</td>
                  <td className={td}>{r.gp}</td>
                  <td className={cn(td, "text-muted-foreground")}>{fmtCount(v.poss)}</td>
                  <td
                    className={cn(
                      td,
                      "font-semibold",
                      v.smallSample ? "text-muted-foreground" : toneClass(v.swing)
                    )}
                    title={v.smallSample ? "Small sample: under 1,000 possessions on or off" : undefined}
                  >
                    {fmtSigned(v.swing)}
                    {v.smallSample ? "*" : ""}
                  </td>
                  <td className={cn(td, "text-muted-foreground")}>
                    {v.range ? `${fmtSigned(v.range[0])} to ${fmtSigned(v.range[1])}` : "—"}
                  </td>
                  <td className={td}>{fmtSigned(v.luckAdj)}</td>
                  <td className={td}>{percentileLabel(v.percentile)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className={cn(type.caption, "text-muted-foreground")}>
        {anySmall ? "* Small sample, under 1,000 possessions on or off. " : ""}
        When two seasons&apos; ranges overlap, the change between them may be noise.
      </p>
    </div>
  );
}
