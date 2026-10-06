import Link from "next/link";

import { PlayerHeadshot } from "@/components/brand/player-headshot";
import { TeamLogo } from "@/components/brand/team-logo";
import type { InjuryEntry, InjuryStatus } from "@/lib/injury-report";
import { resolveTeamBrand } from "@/lib/nba-brand";
import { cn } from "@/lib/utils";

const TOP = 6;

const STATUS_STYLE: Record<InjuryStatus, string> = {
  out: "bg-[color-mix(in_oklab,#d93f3f_14%,transparent)] text-[#b42828] dark:text-[#ff8a8a]",
  "day-to-day": "bg-[color-mix(in_oklab,#e3a008_16%,transparent)] text-[#8a5a00] dark:text-[#f5c451]",
  other: "bg-secondary text-muted-foreground",
};

function StatusPill({ entry }: { entry: InjuryEntry }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold leading-none",
        STATUS_STYLE[entry.status]
      )}
    >
      {entry.status === "day-to-day" ? "Day-to-day" : entry.statusLabel}
    </span>
  );
}

function shortDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function teamOf(entry: InjuryEntry): string | null {
  return resolveTeamBrand(entry.teamAbbr)?.abbr ?? entry.teamAbbr;
}

function Row({ entry, today }: { entry: InjuryEntry; today: string }) {
  const team = teamOf(entry);
  const back = entry.returnDate && entry.returnDate >= today ? shortDate(entry.returnDate) : null;
  return (
    <li className="flex items-center gap-3 py-2.5">
      <PlayerHeadshot
        playerId={entry.athleteId}
        name={entry.name}
        teamKey={team ?? undefined}
        size="sm"
        className="shrink-0"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <Link
            href={`/players/${encodeURIComponent(entry.athleteId)}`}
            className="truncate text-[14px] font-semibold leading-tight hover:underline"
          >
            {entry.name}
          </Link>
          <StatusPill entry={entry} />
        </div>
        <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span className="flex min-w-0 items-center gap-1.5">
            {team ? <TeamLogo teamKey={team} size="2xs" /> : null}
            <span className="truncate">
              {[team, entry.injury].filter(Boolean).join(" · ")}
            </span>
          </span>
          {back ? <span className="shrink-0 tabular-nums">Est. back {back}</span> : null}
        </div>
      </div>
    </li>
  );
}

/** Sidebar injury report: biggest scorers on the list first, the rest behind a toggle. */
export function InjuryReportPanel({ entries, today }: { entries: InjuryEntry[]; today: string }) {
  if (!entries.length) return null;
  const out = entries.filter((e) => e.status === "out").length;
  const dtd = entries.filter((e) => e.status === "day-to-day").length;
  const teams = new Set(entries.map((e) => teamOf(e)).filter(Boolean)).size;
  const top = entries.slice(0, TOP);
  const rest = entries.slice(TOP);
  const byTeam = new Map<string, InjuryEntry[]>();
  for (const e of rest) {
    const key = teamOf(e) ?? "Other";
    byTeam.set(key, [...(byTeam.get(key) ?? []), e]);
  }
  const counts = [out && `${out} out`, dtd && `${dtd} day-to-day`].filter(Boolean).join(" and ");

  return (
    <section aria-labelledby="injury-report-title" className="sports-card flex flex-col gap-2 p-4 sm:p-[21px]">
      <div>
        <h2 id="injury-report-title" className="type-heading">Injury report</h2>
        <p className="type-body-sm text-muted-foreground">
          {counts || `${entries.length} listed`} across {teams} {teams === 1 ? "team" : "teams"}.
        </p>
      </div>
      <ul className="flex flex-col divide-y divide-border">
        {top.map((e) => (
          <Row key={e.athleteId} entry={e} today={today} />
        ))}
      </ul>
      {rest.length ? (
        <details className="group">
          <summary className="cursor-pointer list-none text-[13px] font-semibold underline-offset-4 hover:underline">
            <span className="group-open:hidden">Show all {entries.length} players</span>
            <span className="hidden group-open:inline">Show fewer</span>
          </summary>
          <div className="mt-2 flex flex-col gap-3">
            {[...byTeam.entries()]
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([team, list]) => (
                <div key={team} className="flex flex-col gap-1">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground">
                    {team !== "Other" ? <TeamLogo teamKey={team} size="2xs" /> : null}
                    {team}
                  </div>
                  <ul className="flex flex-col gap-1">
                    {list.map((e) => (
                      <li key={e.athleteId} className="flex items-center justify-between gap-2 text-[12px]">
                        <span className="min-w-0 truncate">
                          <Link
                            href={`/players/${encodeURIComponent(e.athleteId)}`}
                            className="font-medium hover:underline"
                          >
                            {e.name}
                          </Link>
                          {e.injury ? <span className="text-muted-foreground"> · {e.injury}</span> : null}
                        </span>
                        <StatusPill entry={e} />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
          </div>
        </details>
      ) : null}
      <p className="text-[11px] text-muted-foreground">
        Biggest scorers first, with players out ahead of day-to-day and rest days last. Return
        dates are estimates and often move.
      </p>
    </section>
  );
}
