import Link from "next/link";

import { teamDraftPicks, type TeamDraftPick } from "@/data/queries/acquisition-paths";
import { playerPageHref } from "@/lib/player-season-resolve";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

const FIRST_YEAR = 1990;
const RECENT_YEARS = 6;

function Picks({ picks }: { picks: TeamDraftPick[] }) {
  if (!picks.length) return <span className="text-muted-foreground">—</span>;
  return (
    <ul className="flex flex-col gap-0.5">
      {picks.map((p) => (
        <li key={`${p.pick}-${p.label}`} className="flex items-baseline gap-1.5">
          <span className="w-8 shrink-0 tabular-nums text-muted-foreground">#{p.pick}</span>
          {p.playerId ? (
            <Link href={playerPageHref(p.playerId)} className="font-semibold underline-offset-2 hover:underline">
              {p.label}
            </Link>
          ) : (
            <span className="font-semibold">{p.label}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

function DraftTable({ years, byYear }: { years: number[]; byYear: Map<number, TeamDraftPick[]> }) {
  return (
    <table className={cn(type.bodySm, "w-full text-left")}>
      <thead>
        <tr className={cn(type.caption, "text-muted-foreground")}>
          <th scope="col" className="w-16 py-1.5 pr-3 font-medium">
            Draft
          </th>
          <th scope="col" className="py-1.5 pr-3 font-medium">
            First round
          </th>
          <th scope="col" className="py-1.5 font-medium">
            Second round
          </th>
        </tr>
      </thead>
      <tbody>
        {years.map((year) => {
          const picks = byYear.get(year) ?? [];
          return (
            <tr key={year} data-motion="row" className="border-t border-border/60 align-top">
              <th scope="row" className="py-2 pr-3 font-semibold tabular-nums">
                {year}
              </th>
              <td className="py-2 pr-3">
                <Picks picks={picks.filter((p) => p.round === 1)} />
              </td>
              <td className="py-2">
                <Picks picks={picks.filter((p) => p.round === 2)} />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** Every pick the franchise has made since 1990, newest class first. */
export function TeamDraftHistorySection({ teamId }: { teamId: string }) {
  const picks = teamDraftPicks(teamId).filter((p) => p.year >= FIRST_YEAR);
  if (!picks.length) return null;

  const byYear = new Map<number, TeamDraftPick[]>();
  for (const p of picks) byYear.set(p.year, [...(byYear.get(p.year) ?? []), p]);
  const latest = picks[0]!.year;
  const years = Array.from({ length: latest - FIRST_YEAR + 1 }, (_, i) => latest - i);
  const recent = years.slice(0, RECENT_YEARS);
  const earlier = years.slice(RECENT_YEARS);

  return (
    <section id="draft-history" className="scroll-mt-16 flex flex-col gap-3" aria-label="Draft history">
      <div>
        <h2 className="text-[20px] font-bold tracking-tight">Draft history</h2>
        <p className="text-[14px] text-muted-foreground">
          Every pick the franchise has made since {FIRST_YEAR}, by overall slot. A dash means it made no
          pick in that round.
        </p>
      </div>
      <div className="sports-card flex flex-col gap-3 p-4 sm:p-5">
        <DraftTable years={recent} byYear={byYear} />
        {earlier.length ? (
          <details className="group">
            <summary className={cn(type.caption, "cursor-pointer font-semibold text-muted-foreground hover:text-foreground")}>
              Earlier drafts ({earlier[earlier.length - 1]}–{earlier[0]})
            </summary>
            <div className="mt-2">
              <DraftTable years={earlier} byYear={byYear} />
            </div>
          </details>
        ) : null}
        <p className={cn(type.caption, "text-muted-foreground")}>
          Picks count for the team that made the selection, so a player traded on draft night still shows
          here. From the NBA&apos;s draft history.
        </p>
      </div>
    </section>
  );
}
