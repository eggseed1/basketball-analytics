import { SalaryPayoffPanel, type PayoffRow } from "@/components/charts/salary-payoff-chart";
import {
  payoffLeftOutNote,
  payoffLine,
  payoffMethodNote,
  payoffSourceNote,
  sampleIndexes,
  type TeamPayoff,
} from "@/data/runtime/salary-payoff";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

export const TEAM_PAYOFF_TOTAL_ID = "team-total";

/** Each player's line on this roster, plus the roster's combined line. */
export function TeamSalaryPayoff({ payoff }: { payoff: TeamPayoff }) {
  const { meta, players, total } = payoff;
  const indexes = sampleIndexes(meta.dates.length, meta.dates.length);
  const totalLine = payoffLine(
    {
      key: TEAM_PAYOFF_TOTAL_ID,
      nbaId: null,
      name: "Roster total",
      teamId: players[0].teamId,
      salary: total.salary,
      pct: total.pct,
      earned: total.earned,
    },
    indexes,
    true
  );
  const rows: PayoffRow[] = players.map((p, i) => ({
    id: p.key,
    rank: i + 1,
    name: p.name,
    teamId: p.teamId,
    href: p.nbaId ? `/players/${p.nbaId}` : null,
    salary: p.salary,
    earned: p.earned.at(-1) ?? 0,
    pct: p.pct.at(-1) ?? 0,
    paidOff: p.paidOff,
    projected: p.projected,
  }));
  const leftOut = payoffLeftOutNote(meta);

  return (
    <>
      <SalaryPayoffPanel
        dates={indexes.map((i) => meta.dates[i])}
        pace={indexes.map((i) => meta.pace[i])}
        lines={[...players.map((p) => payoffLine(p, indexes)), totalLine]}
        rows={rows}
        colors="team"
        totalId={TEAM_PAYOFF_TOTAL_ID}
        title={`Salary paid off · ${meta.season}`}
        listLabel="Players by share of salary covered"
      />
      <div className={cn(type.caption, "flex flex-col gap-1 text-muted-foreground")}>
        <p>
          The bold line is the whole roster: everyone&apos;s worth added up against everyone&apos;s salary.
          Players count with the team they&apos;re listed on now, for the whole season.
        </p>
        <p>{payoffMethodNote(meta)}</p>
        <p>{payoffSourceNote(meta)}</p>
        {leftOut ? <p>{leftOut}</p> : null}
      </div>
    </>
  );
}
