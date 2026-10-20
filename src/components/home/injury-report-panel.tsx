import Link from "next/link";
import { useLocale } from "next-intl";

import { PlayerHeadshot } from "@/components/brand/player-headshot";
import { TeamLogo } from "@/components/brand/team-logo";
import { NewSinceTag } from "@/components/home/new-since-tag";
import { SectionLink } from "@/components/ui/section-link";
import { formatGameCalendarDate } from "@/i18n/format-date";
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
        "type-micro shrink-0 rounded-full px-2 py-0.5 font-semibold leading-none",
        STATUS_STYLE[entry.status]
      )}
    >
      {entry.status === "day-to-day" ? "Day-to-day" : entry.statusLabel}
    </span>
  );
}

function shortDate(iso: string, locale: string): string {
  return formatGameCalendarDate(iso, locale, "monthDay") ?? iso;
}

/** A status or injury change counts as a new listing. */
function injurySeenId(entry: InjuryEntry): string {
  return `injury:${entry.athleteId}:${entry.status}:${entry.injury ?? ""}`;
}

function teamOf(entry: InjuryEntry): string | null {
  return resolveTeamBrand(entry.teamAbbr)?.abbr ?? entry.teamAbbr;
}

function Row({ entry, today }: { entry: InjuryEntry; today: string }) {
  const locale = useLocale();
  const team = teamOf(entry);
  const back = entry.returnDate && entry.returnDate >= today ? shortDate(entry.returnDate, locale) : null;
  return (
    <li data-motion="row" className="flex items-center gap-3 py-2.5">
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
            className="type-body-sm truncate font-semibold leading-tight hover:underline"
          >
            {entry.name}
          </Link>
          <span className="flex shrink-0 items-center gap-1.5">
            <NewSinceTag id={injurySeenId(entry)} />
            <StatusPill entry={entry} />
          </span>
        </div>
        <div className="type-caption flex items-center justify-between gap-2 text-muted-foreground">
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

export function injuryReportSummary(entries: InjuryEntry[]): string {
  const out = entries.filter((e) => e.status === "out").length;
  const dtd = entries.filter((e) => e.status === "day-to-day").length;
  const teams = new Set(entries.map((e) => teamOf(e)).filter(Boolean)).size;
  const counts = [out && `${out} out`, dtd && `${dtd} day-to-day`].filter(Boolean).join(" and ");
  const listed = counts || `${entries.length} listed`;
  return `${listed}, ${teams} ${teams === 1 ? "team" : "teams"}. ESPN's feed can lag.`;
}

export function InjuryReportList({ entries, today }: { entries: InjuryEntry[]; today: string }) {
  return (
    <ul className="flex flex-col divide-y divide-border/40">
      {entries.map((e) => (
        <Row key={e.athleteId} entry={e} today={today} />
      ))}
    </ul>
  );
}

/** Sidebar injury report. The full list lives at /injuries. */
export function InjuryReportPanel({ entries, today }: { entries: InjuryEntry[]; today: string }) {
  if (!entries.length) return null;
  const top = entries.slice(0, TOP);

  return (
    <section aria-labelledby="injury-report-title" className="sports-card flex flex-col gap-2 p-4">
      <div>
        <div className="flex min-w-0 items-start justify-between gap-3">
          <h2 id="injury-report-title" className="type-heading min-w-0">Injury report</h2>
          {entries.length > TOP ? (
            <SectionLink href="/injuries" className="pt-0.5">
              {`Show all ${entries.length} players`}
            </SectionLink>
          ) : null}
        </div>
      </div>
      <InjuryReportList entries={top} today={today} />
      <p className="type-caption text-muted-foreground">
        Biggest scorers first, with players out ahead of day-to-day and rest days last. Return
        dates are estimates and often move.
      </p>
    </section>
  );
}
