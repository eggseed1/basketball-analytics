import type { CSSProperties } from "react";

import type { FranchiseHistory } from "@/data/franchises/history";
import { currentNbaStartYear } from "@/data/providers/historical/season-range";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

import { VizCard } from "./viz-kit";

function startYear(season: string): number {
  return Number(season.slice(0, 4));
}

function seasonOf(titleYear: number): string {
  return `${titleYear - 1}-${String(titleYear).slice(-2)}`;
}

/**
 * History tab hero: championship banners hung in order, grouped by decade,
 * over a strip of the franchise's whole run with each title marked on it.
 */
export function FranchiseRafters({
  franchise,
  teamKey,
}: {
  franchise: FranchiseHistory;
  teamKey: string;
}) {
  const first = startYear(franchise.firstSeason);
  const now = currentNbaStartYear();
  if (!Number.isFinite(first) || now < first) return null;
  const seasons = now - first + 1;
  const titles = [...franchise.championships].sort((a, b) => a - b);
  const decades = new Map<number, number[]>();
  for (const year of titles) {
    const decade = Math.floor(year / 10) * 10;
    decades.set(decade, [...(decades.get(decade) ?? []), year]);
  }
  const lastTitle = titles[titles.length - 1];
  const sinceLast = lastTitle != null ? now + 1 - lastTitle : null;
  const pos = (titleYear: number) => ((titleYear - 1 - first + 0.5) / seasons) * 100;

  return (
    <VizCard
      title="Banners in the rafters"
      accentKey={teamKey}
      subtitle={
        titles.length
          ? `${titles.length} championship${titles.length === 1 ? "" : "s"} in ${seasons} seasons since ${franchise.firstSeason}. ${
              sinceLast != null && sinceLast > 0
                ? `The last one was ${sinceLast} season${sinceLast === 1 ? "" : "s"} ago.`
                : ""
            }`
          : `No championships yet in ${seasons} seasons since ${franchise.firstSeason}.`
      }
    >
      {titles.length ? (
        <div className="flex flex-wrap items-start gap-x-5 gap-y-4 border-t-4 border-foreground/15 pt-0">
          {[...decades.entries()].map(([decade, years]) => (
            <div key={decade} className="flex flex-col gap-1.5">
              <div className="flex gap-1.5">
                {years.map((year) => {
                  const i = titles.indexOf(year);
                  return (
                    <span
                      key={year}
                      tabIndex={0}
                      data-viz-mark
                      data-motion-bar="y"
                      data-tip={`${year} champions`}
                      data-tip-sub={`${seasonOf(year)} season`}
                      className="flex h-[4.5rem] w-10 flex-col items-center justify-start pt-2 sm:h-20 sm:w-11"
                      style={
                        {
                          background: "var(--viz-accent)",
                          color: "var(--background)",
                          clipPath: "polygon(0 0, 100% 0, 100% 82%, 50% 100%, 0 82%)",
                          transformOrigin: "top",
                          "--viz-lift": 1.08,
                          "--i": i,
                        } as CSSProperties
                      }
                    >
                      <span className="text-[8px] font-bold uppercase tracking-wider opacity-80">Champs</span>
                      <span className="text-[13px] font-black tabular-nums leading-tight">{String(year).slice(-2)}</span>
                    </span>
                  );
                })}
              </div>
              <span className={cn(type.micro, "font-semibold uppercase tracking-wide text-muted-foreground")}>
                {decade}s
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="border-t-4 border-foreground/15 pt-3">
          <p className={cn(type.bodySm, "text-muted-foreground")}>
            {franchise.finalsAppearances > 0
              ? `${franchise.finalsAppearances} Finals trip${franchise.finalsAppearances === 1 ? "" : "s"} without a title so far.`
              : "The rafters are still waiting for a first banner."}
          </p>
        </div>
      )}

      <div className="flex flex-col gap-1.5 pt-2">
        <div className="relative h-7">
          <div aria-hidden className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-foreground/10" />
          <div
            aria-hidden
            data-motion-bar="x"
            className="absolute left-0 top-1/2 h-1.5 w-full -translate-y-1/2 rounded-full"
            style={{ background: "color-mix(in oklab, var(--viz-accent) 35%, transparent)" }}
          />
          {titles.map((year, i) => (
            <span
              key={year}
              data-viz-mark
              data-motion-dot
              data-tip={`${year} champions`}
              data-tip-sub={`Season ${year - first} of ${seasons}`}
              className="absolute top-1/2 h-3.5 w-3.5 rounded-full border-2 border-background"
              style={{ left: `${pos(year)}%`, translate: "-50% -50%", background: "var(--viz-accent)", "--i": i } as CSSProperties}
            />
          ))}
        </div>
        <div className={cn(type.micro, "flex justify-between tabular-nums text-muted-foreground")}>
          <span>{franchise.firstSeason}</span>
          <span>{seasons} seasons</span>
          <span>{`${now}-${String(now + 1).slice(-2)}`}</span>
        </div>
      </div>

    </VizCard>
  );
}
