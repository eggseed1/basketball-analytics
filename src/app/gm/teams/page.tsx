"use client";

import Link from "next/link";

import { GmShell } from "@/gm/ui/gm-shell";
import { ClubMark } from "@/gm/ui/club-mark";
import { teamColorStyle } from "@/gm/ui/team-colors";
import { teamPayrollM } from "@/gm/engine/cap";
import { playerSheet } from "@/gm/engine/attributes";
import { sortedStandings } from "@/gm/engine/standings";
import { useGmStore } from "@/gm/state/gm-store";
import { formatNumber } from "@/lib/format";

export default function GmTeamsPage() {
  return (
    <GmShell>
      <TeamsBody />
    </GmShell>
  );
}

function TeamsBody() {
  const league = useGmStore((s) => s.league);
  if (!league) return null;
  const rows = sortedStandings(league.standings, undefined, league.teams);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-bold tracking-tight">Teams</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          All 30 clubs. Open a team to sort that roster on the players list.
        </p>
      </div>
      <div className="arena-panel overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
            <tr>
              {["Team", "Conf", "W", "L", "Diff", "Payroll", "Best OVR"].map((label) => (
                <th key={label} className="px-3 py-2 font-medium">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => {
              const team = league.teams.find((club) => club.id === row.teamId);
              if (!team) return null;
              const roster = league.players.filter((player) => player.teamId === team.id);
              const best = roster.reduce<{ name: string; ovr: number } | null>((top, player) => {
                const overall = playerSheet(player).overall;
                if (!top || overall > top.ovr) return { name: player.name, ovr: overall };
                return top;
              }, null);
              const games = row.wins + row.losses;
              const diff = games > 0 ? (row.pointsFor - row.pointsAgainst) / games : null;
              return (
                <tr key={team.id} className="gm-club-row" style={teamColorStyle(team.id)}>
                  <td className="px-3 py-2 font-medium">
                    <Link href={`/gm/players?team=${encodeURIComponent(team.id)}`}>
                      <ClubMark teamId={team.id} label={`${team.city} ${team.name}`} />
                    </Link>
                    {team.id === league.userTeamId ? " · You" : ""}
                  </td>
                  <td className="px-3 py-2">{team.conference}</td>
                  <td className="px-3 py-2 tabular-nums">{row.wins}</td>
                  <td className="px-3 py-2 tabular-nums">{row.losses}</td>
                  <td className="px-3 py-2 tabular-nums">
                    {diff == null ? "—" : formatNumber(diff, 1)}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    ${formatNumber(teamPayrollM(team.id, league.players, team.deadMoney), 1)}M
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {best ? `${best.name} ${best.ovr}` : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
