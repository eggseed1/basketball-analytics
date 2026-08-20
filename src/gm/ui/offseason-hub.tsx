"use client";

import Link from "next/link";
import { useMyLeagueStore } from "@/gm/myleague/store";
import { useGmStore } from "@/gm/state/gm-store";
import { nextPlayablePhase } from "@/gm/myleague/phase";
import { listSalaryCapHistory } from "@/gm/myleague/cba-registry";
import { Button } from "@/components/ui/button";
import { userCap, userRecord } from "@/gm/lib/selectors";
import { formatNumber } from "@/lib/format";

const HUB_SECTIONS = [
  {
    id: "review",
    title: "Season review",
    phase: "SEASON_REVIEW",
    href: "/gm",
    blurb: "Record, awards, and FO briefings from the year just played.",
  },
  {
    id: "roster",
    title: "Roster decisions",
    phase: "ROSTER_DECISIONS",
    href: "/gm/roster",
    blurb: "Options, waives, extensions - manage the 15-man board.",
  },
  {
    id: "staff",
    title: "Staff",
    phase: "STAFF_REVIEW",
    href: "/gm/staff",
    blurb: "Hire a director of scouting - eye + expertise set draft fog.",
  },
  {
    id: "draft",
    title: "Draft",
    phase: "DRAFT",
    href: "/gm/draft",
    blurb: "Codenames, dossiers, and pick-night identity reveals.",
  },
  {
    id: "fa",
    title: "Free agency",
    phase: "FREE_AGENCY",
    href: "/gm/free-agency",
    blurb: "Open market and minimum deals.",
  },
  {
    id: "cap",
    title: "Cap & CBA",
    phase: "ROSTER_DECISIONS",
    href: "/gm/cap",
    blurb: "Era salary cap, tax, and aprons from the CBA registry.",
  },
] as const;

export function OffseasonHub() {
  const league = useGmStore((s) => s.league);
  const runOffseason = useGmStore((s) => s.runOffseason);
  const myLeague = useMyLeagueStore((s) => s.myLeague);
  const simulation = useMyLeagueStore((s) => s.simulation);
  const historical = useMyLeagueStore((s) => s.historical);

  if (!league) return null;

  const record = userRecord(league);
  const cap = userCap(league);
  const phase = simulation?.phase ?? "REGULAR_SEASON";
  const upcoming = nextPlayablePhase(phase);
  const snapCount = historical ? Object.keys(historical.seasons).length : 0;
  const activeCap = listSalaryCapHistory(
    league.season,
    league.season
  )[0];

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-[28px] font-bold tracking-tight">Offseason Hub</h1>
        <p className="text-[16px] text-muted-foreground">
          Front-office workspace for the annual loop. Deep decision flows land
          in later milestones - links below jump into the live tools.
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2">
        <div className="sports-card p-4">
          <p className="text-[14px] font-semibold text-muted-foreground">
            MyLeague phase
          </p>
          <p className="mt-1 text-[20px] font-bold tracking-tight">
            {phase.replaceAll("_", " ")}
          </p>
          <p className="text-[14px] text-muted-foreground">
            Next playable: {upcoming.replaceAll("_", " ")}
          </p>
        </div>
        <div className="sports-card p-4">
          <p className="text-[14px] font-semibold text-muted-foreground">
            Reality snapshot
          </p>
          <p className="mt-1 text-[20px] font-bold tracking-tight">
            {snapCount} season{snapCount === 1 ? "" : "s"}
          </p>
          <p className="text-[14px] text-muted-foreground">
            {myLeague?.settings.realDataProviderId ?? "scaffold"} ·{" "}
            {myLeague?.settings.mode?.replaceAll("_", " ") ?? "-"}
          </p>
        </div>
      </section>

      <section className="sports-card flex flex-col gap-3 p-4">
        <h2 className="text-[16px] font-bold">Club snapshot</h2>
        <p className="text-[16px] text-muted-foreground">
          {record?.wins ?? 0}-{record?.losses ?? 0} · payroll $
          {formatNumber(cap.payrollM, 1)}M / cap $
          {formatNumber(league.settings.salaryCapM, 1)}M
          {activeCap
            ? ` · ${activeCap.label} cap $${formatNumber(activeCap.salaryCapM, 1)}M`
            : ""}
        </p>
        <div className="flex flex-wrap gap-2">
          {(league.phase === "draft" || league.phase === "offseason") && (
            <Button onClick={() => runOffseason()}>Start next season</Button>
          )}
          <Link
            href="/gm/draft"
            className="inline-flex h-8 items-center justify-center rounded-lg border border-border bg-background px-3 text-[14px] font-semibold"
          >
            Draft board
          </Link>
          <Link
            href="/gm/free-agency"
            className="inline-flex h-8 items-center justify-center rounded-lg border border-border bg-background px-3 text-[14px] font-semibold"
          >
            Free agency
          </Link>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-[16px] font-bold">Hub desks</h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          {HUB_SECTIONS.map((section) => (
            <li key={section.id}>
              <Link
                href={section.href}
                className="sports-card flex h-full flex-col gap-1 p-4 transition-colors hover:bg-secondary/60"
              >
                <span className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {section.phase.replaceAll("_", " ")}
                </span>
                <span className="text-[16px] font-bold">{section.title}</span>
                <span className="text-[14px] text-muted-foreground">
                  {section.blurb}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="sports-card p-4">
        <h2 className="text-[16px] font-bold">Salary cap by year</h2>
        <p className="mt-1 text-[14px] text-muted-foreground">
          Official cap / tax (and aprons when they exist) for each season.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-[14px]">
            <thead className="text-muted-foreground">
              <tr>
                <th className="py-1 pr-3 font-semibold">Season</th>
                <th className="py-1 pr-3 font-semibold">Cap</th>
                <th className="py-1 pr-3 font-semibold">Tax</th>
                <th className="py-1 font-semibold">Aprons</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {listSalaryCapHistory(2015, 2026)
                .slice()
                .reverse()
                .map((row) => {
                  const active = league.season === row.seasonEndYear;
                  return (
                    <tr
                      key={row.seasonEndYear}
                      className={active ? "font-semibold" : undefined}
                    >
                      <td className="py-2 pr-3">
                        {row.label}
                        {active ? " · active" : ""}
                      </td>
                      <td className="py-2 pr-3 tabular-nums">
                        ${formatNumber(row.salaryCapM, 1)}M
                      </td>
                      <td className="py-2 pr-3 tabular-nums">
                        {row.luxuryTaxM > 0
                          ? `$${formatNumber(row.luxuryTaxM, 1)}M`
                          : "-"}
                      </td>
                      <td className="py-2 tabular-nums text-muted-foreground">
                        {row.firstApronM
                          ? `$${formatNumber(row.firstApronM, 1)}M / $${formatNumber(row.secondApronM ?? 0, 1)}M`
                          : "-"}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
