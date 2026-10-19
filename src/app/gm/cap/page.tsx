"use client";

import { useState } from "react";

import { GmBooks } from "@/gm/ui/gm-books";
import { GmShell } from "@/gm/ui/gm-shell";
import { useGmStore } from "@/gm/state/gm-store";
import { userCap, userPlayers, userTeam } from "@/gm/lib/selectors";
import { formatNumber } from "@/lib/format";
import { staffBillM } from "@/gm/engine/staff";
import { staffBudgetM } from "@/gm/seed/coaches";

export default function GmCapPage() {
  return (
    <GmShell>
      <CapBody />
    </GmShell>
  );
}

function CapBody() {
  const league = useGmStore((s) => s.league);
  const renounceRights = useGmStore((s) => s.renounceRights);
  const [teamId, setTeamId] = useState<string | null>(null);
  if (!league) return null;
  const user = userTeam(league);
  const team = league.teams.find((entry) => entry.id === (teamId ?? user.id)) ?? user;
  const cap = userCap(league);
  const players = team.id === user.id ? userPlayers(league) : league.players.filter((player) => player.teamId === team.id);
  const holds = league.players.filter(
    (player) => player.rightsTeamId === league.userTeamId && player.teamId == null
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-lg font-semibold">Salary and assets · {team.abbr}</h2>
        <label className="flex flex-col gap-1 text-sm">
          Club
          <select
            className="rounded-md border border-border bg-background px-2 py-2"
            value={team.id}
            onChange={(event) => setTeamId(event.target.value)}
          >
            {league.teams.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.abbr} · {entry.city}
              </option>
            ))}
          </select>
        </label>
      </div>
      <GmBooks
        league={league}
        team={team}
        summary={
          <>
      <h2 className="sr-only">Cap sheet · {team.abbr}</h2>
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
            ? "Second apron: hard limits."
            : "Below second apron."}
        </li>
        <li>
          Roster {cap.rosterLegal ? "is legal." : "is short or over the limit."}
        </li>
        <li>
          {`Mid-level left $${formatNumber(cap.mleRemainingM, 1)}M of $${formatNumber(cap.nonTaxpayerMleM, 1)}M. Taxpayer mid-level left $${formatNumber(cap.taxpayerMleRemainingM, 1)}M. Bi-annual $${formatNumber(cap.biAnnualM, 1)}M${cap.baeAvailable ? " is open." : " is used."} Minimum $${formatNumber(cap.minimumM, 1)}M.`}
        </li>
        <li>
          {`Cap holds $${formatNumber(cap.holdsM, 1)}M. Dead money $${formatNumber(cap.deadMoneyM, 1)}M.`}
        </li>
        <li>
          {`Staff $${formatNumber(staffBillM(team), 1)}M of a $${formatNumber(staffBudgetM(team, cap.overTax), 1)}M owner budget. Coaches are not a cap charge.`}
        </li>
      </ul>
      {holds.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">Bird rights on the market</h3>
          <ul className="flex flex-col gap-1 text-sm">
            {holds.map((player) => (
              <li key={player.id} className="flex items-center justify-between gap-3">
                <span>
                  {player.name} · {player.rightsKind} · hold $
                  {formatNumber(player.lastSalaryM ?? 0, 1)}M
                </span>
                <button
                  type="button"
                  className="text-[13px] font-semibold underline-offset-4 hover:underline"
                  onClick={() => renounceRights(player.id)}
                >
                  Renounce
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {(team.deadMoney ?? []).length > 0 ? (
        <ul className="text-sm text-muted-foreground">
          {(team.deadMoney ?? []).map((row) => (
            <li key={row.id}>
              {row.label}: ${formatNumber(row.annualM, 1)}M for {row.yearsLeft}{" "}
              year{row.yearsLeft === 1 ? "" : "s"}
            </li>
          ))}
        </ul>
      ) : null}
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
          </>
        }
      />
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
