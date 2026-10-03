import { TeamLogo } from "@/components/brand/team-logo";
import type { TeamFuturePicksView } from "@/data/queries/team-contracts";
import type { FuturePick } from "@/data/runtime/future-picks-snapshot";
import { type } from "@/lib/design-system";
import { resolveTeamBrand } from "@/lib/nba-brand";
import { ESPN_TEAM_NICKNAMES } from "@/sentiment/headline-entities";
import { cn } from "@/lib/utils";

function nickname(abbr: string): string {
  const id = resolveTeamBrand(abbr)?.espnTeamId;
  return (id && ESPN_TEAM_NICKNAMES[id]?.[0]) || abbr;
}

function possessive(name: string): string {
  return name.endsWith("s") ? `${name}'` : `${name}'s`;
}

type Status = { label: string; tone: "own" | "in" | "out" | "maybe" };

function statusOf(pick: FuturePick, team: string): Status {
  if (pick.swapWith) {
    const other = pick.holder === team ? pick.swapWith : pick.holder;
    return { label: `Swap with the ${nickname(other)}`, tone: "maybe" };
  }
  if (pick.origin === team && pick.holder === team) {
    return { label: pick.terms ? "Own, with conditions" : "Own", tone: "own" };
  }
  if (pick.origin === team) return { label: `Owed to the ${nickname(pick.holder)}`, tone: "out" };
  if (pick.holder === team) return { label: `From the ${nickname(pick.origin)}`, tone: "in" };
  return { label: `May get the ${possessive(nickname(pick.origin))} pick`, tone: "maybe" };
}

const TONE: Record<Status["tone"], string> = {
  own: "text-foreground",
  in: "text-emerald-700 dark:text-emerald-400",
  out: "text-rose-700 dark:text-rose-400",
  maybe: "text-amber-700 dark:text-amber-400",
};

function PickLine({ pick, team }: { pick: FuturePick; team: string }) {
  const status = statusOf(pick, team);
  return (
    <li className="flex items-start gap-1.5">
      <TeamLogo teamKey={resolveTeamBrand(pick.origin)?.espnTeamId ?? pick.origin} size="xs" className="mt-0.5" />
      <div className="min-w-0">
        <p className={cn(type.caption, "font-semibold leading-snug", TONE[status.tone])}>
          {status.label}
          {pick.frozen ? (
            <span
              className="ml-1.5 rounded-full bg-foreground/[0.08] px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
              title="Can't be traded while the team is over the second apron"
            >
              Frozen
            </span>
          ) : null}
        </p>
        {pick.terms ? (
          <p className={cn(type.caption, "leading-snug text-muted-foreground")}>{pick.terms}</p>
        ) : null}
      </div>
    </li>
  );
}

function sortPicks(picks: FuturePick[], team: string): FuturePick[] {
  return [...picks].sort((a, b) => Number(b.origin === team) - Number(a.origin === team) || a.origin.localeCompare(b.origin));
}

/** Every future first and second the team owns, owes or may get, by draft year. */
export function TeamFuturePicksTable({ data, className }: { data: TeamFuturePicksView; className?: string }) {
  const team = data.teamAbbr;
  const years = [...new Set(data.picks.map((p) => p.year))].sort((a, b) => a - b);
  const lastListed = (round: 1 | 2) =>
    Math.max(...data.picks.filter((p) => p.round === round).map((p) => p.year));
  return (
    <div className={cn("overflow-x-auto rounded-md border border-border/80", className)}>
      <table className="w-full min-w-[560px] border-collapse">
        <thead>
          <tr className="border-b border-border bg-muted/40 text-left text-sm">
            <th className="w-16 px-2 py-1.5 font-semibold">Year</th>
            <th className="px-2 py-1.5 font-semibold">First round</th>
            <th className="px-2 py-1.5 font-semibold">Second round</th>
          </tr>
        </thead>
        <tbody>
          {years.map((year) => (
            <tr key={year} className="border-b border-border/50 align-top">
              <td className="px-2 py-2 text-sm font-semibold tabular-nums">{year}</td>
              {([1, 2] as const).map((round) => {
                const picks = sortPicks(
                  data.picks.filter((p) => p.year === year && p.round === round),
                  team
                );
                return (
                  <td key={round} className="px-2 py-2">
                    {picks.length ? (
                      <ul className="flex flex-col gap-1.5">
                        {picks.map((pick, i) => (
                          <PickLine key={`${pick.origin}-${i}`} pick={pick} team={team} />
                        ))}
                      </ul>
                    ) : year > lastListed(round) ? (
                      <span className={cn(type.caption, "text-muted-foreground")}>Not listed by Spotrac yet</span>
                    ) : (
                      <span className={cn(type.caption, "text-muted-foreground")}>—</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function FuturePicksSourceNote({ data }: { data: TeamFuturePicksView }) {
  const asOf = data.retrievedAt
    ? new Date(`${data.retrievedAt}T12:00:00Z`).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      })
    : null;
  return (
    <p className={cn(type.caption, "text-muted-foreground")}>
      Terms are in Spotrac&apos;s words{asOf ? `, as of ${asOf}` : ""}. Ranges like 1-8 are pick numbers; &quot;via&quot;
      lists the teams a pick passed through. Logos show whose pick it originally was.{" "}
      {data.sourceUrl ? (
        <a href={data.sourceUrl} className="font-semibold underline-offset-2 hover:underline" rel="noreferrer" target="_blank">
          Source: Spotrac
        </a>
      ) : null}
    </p>
  );
}
