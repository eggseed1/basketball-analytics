"use client";

import { GmShell } from "@/gm/ui/gm-shell";
import { useGmStore } from "@/gm/state/gm-store";
import { userCap, userPlayers, userTeam } from "@/gm/lib/selectors";
import { formatNumber } from "@/lib/format";

export default function GmCapPage() {
  return (
    <GmShell>
      <CapBody />
    </GmShell>
  );
}

function CapBody() {
  const league = useGmStore((s) => s.league);
  if (!league) return null;
  const team = userTeam(league);
  const cap = userCap(league);
  const players = userPlayers(league);

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Cap sheet - {team.abbr}</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Payroll" value={`$${formatNumber(cap.payrollM, 1)}M`} />
        <Stat
          label="Cap room"
          value={`$${formatNumber(cap.capRoomM, 1)}M`}
        />
        <Stat
          label="Luxury tax line"
          value={`$${formatNumber(league.settings.luxuryTaxM, 1)}M`}
        />
        <Stat
          label="Roster"
          value={`${cap.rosterSize} / ${league.settings.maxRoster}`}
        />
      </div>
      <ul className="text-sm text-muted-foreground">
        <li>{cap.overCap ? "Over the salary cap." : "Under the salary cap."}</li>
        <li>
          {cap.overTax
            ? "Into the luxury tax."
            : "Below the luxury tax threshold."}
        </li>
        <li>
          {cap.overFirstApron
            ? "First apron restrictions apply."
            : "Below first apron."}
        </li>
        <li>
          {cap.overSecondApron
            ? "Second apron - hard limits."
            : "Below second apron."}
        </li>
        <li>
          Roster {cap.rosterLegal ? "is legal." : "is NOT legal (size)."}
        </li>
      </ul>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Player</th>
              <th className="px-3 py-2">Salary</th>
              <th className="px-3 py-2">Years</th>
              <th className="px-3 py-2">Bird</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {players.map((p) => (
              <tr key={p.id}>
                <td className="px-3 py-2">{p.name}</td>
                <td className="px-3 py-2 tabular-nums">
                  ${formatNumber(p.contract?.annualSalaryM ?? 0, 1)}M
                </td>
                <td className="px-3 py-2 tabular-nums">
                  {p.contract?.yearsRemaining ?? 0}
                </td>
                <td className="px-3 py-2">{p.contract?.birdRights ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}
