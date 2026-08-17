import Link from "next/link";

import { getOffseasonPulse } from "@/data/queries/offseason-tracker";
import { TeamLogo } from "@/components/brand/team-logo";
import { resolveTeamBrand } from "@/lib/nba-brand";

/**
 * Compact Home module — factual offseason pulse from the ESPN event archive.
 */
export async function OffseasonPulsePanel() {
  const pulse = await getOffseasonPulse().catch(() => null);
  if (!pulse || pulse.archiveEventCount === 0) return null;

  const brand = pulse.mostActiveTeam
    ? resolveTeamBrand(pulse.mostActiveTeam.teamId) ??
      resolveTeamBrand(pulse.mostActiveTeam.teamAbbr)
    : undefined;

  return (
    <section className="sports-card flex flex-col gap-3 px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-[15px] font-bold tracking-tight">
            NBA transaction pulse
          </h2>
          <p className="text-[12px] text-muted-foreground">
            {pulse.offseasonYear} offseason · ESPN event archive
          </p>
        </div>
        <Link
          href="/offseason"
          className="text-[12px] font-semibold underline-offset-2 hover:underline"
        >
          Open Transactions →
        </Link>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            This week
          </p>
          <p className="text-[20px] font-bold tabular-nums">
            {pulse.eventsThisWeek}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            Offseason events
          </p>
          <p className="text-[20px] font-bold tabular-nums">{pulse.eventCount}</p>
        </div>
        <div className="flex items-center gap-2">
          {brand ? <TeamLogo teamKey={brand.abbr} size="sm" /> : null}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              Most active
            </p>
            <p className="text-[15px] font-bold">
              {brand?.abbr ??
                pulse.mostActiveTeam?.teamAbbr ??
                pulse.mostActiveTeam?.teamId ??
                "—"}
            </p>
          </div>
        </div>
      </div>
      {pulse.latestEvent ? (
        <p className="line-clamp-2 text-[13px] text-muted-foreground">
          <span className="font-semibold text-foreground">
            {pulse.latestEvent.date}
          </span>{" "}
          · {pulse.latestEvent.description}
        </p>
      ) : null}
    </section>
  );
}
