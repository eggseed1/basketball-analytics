"use client";

import Link from "next/link";

import { GmShell } from "@/gm/ui/gm-shell";
import { useGmStore } from "@/gm/state/gm-store";
import { rateLabel } from "@/gm/lib/counting";
import { countingForBoard, valueForBoard } from "@/gm/lib/season-line";
import { scoutPotentialView } from "@/gm/engine/scouting";
import { categoryMeans, playerSheet } from "@/gm/engine/attributes";
import { userPlayers, userTeam } from "@/gm/lib/selectors";
import { Button } from "@/components/ui/button";
import { PlayerHeadshot } from "@/components/brand/player-headshot";
import { TeamLogo } from "@/components/brand/team-logo";
import { teamColorStyle } from "@/gm/ui/team-colors";
import { DRBL_PUBLIC_RATE_LABEL, WAR1_LABEL, formatWar1 } from "@/lib/drbl-public-labels";
import { UNAVAILABLE_STAT_LABEL, formatNumber } from "@/lib/format";

function sideRatings(player: Parameters<typeof playerSheet>[0]): string {
  const cats = categoryMeans(playerSheet(player).attributes);
  const offense = Math.round((cats[0]! + cats[1]! + cats[2]!) / 3);
  const defense = Math.round(cats[3]!);
  return `${offense}/${defense}`;
}

export default function GmRosterPage() {
  return (
    <GmShell>
      <RosterBody />
    </GmShell>
  );
}

function RosterBody() {
  const league = useGmStore((s) => s.league);
  const waivePlayer = useGmStore((s) => s.waivePlayer);
  if (!league) return null;
  const players = userPlayers(league);
  const scout = userTeam(league).staff.scout;

  return (
    <div className="flex flex-col gap-4">
      <h2 className="flex items-center gap-2 text-xl font-bold tracking-tight">
        <TeamLogo teamKey={league.userTeamId} size="sm" />
        Roster ({players.length})
      </h2>
      <div className="gm-club-panel overflow-x-auto">
        <table className="w-full min-w-[800px] text-left text-sm">
          <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Player</th>
              <th className="px-3 py-2">Pos</th>
              <th className="px-3 py-2">Age</th>
              <th className="px-3 py-2">OVR</th>
              <th className="px-3 py-2">{WAR1_LABEL}</th>
              <th className="px-3 py-2">{DRBL_PUBLIC_RATE_LABEL}</th>
              <th className="px-3 py-2">PPG</th>
              <th className="px-3 py-2">RPG</th>
              <th className="px-3 py-2">APG</th>
              <th className="px-3 py-2">O/D</th>
              <th className="px-3 py-2">Scout</th>
              <th className="px-3 py-2">$</th>
              <th className="px-3 py-2">Yrs</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {[...players]
              .sort((a, b) => {
                const gap = playerSheet(b).overall - playerSheet(a).overall;
                if (gap !== 0) return gap;
                return a.name.localeCompare(b.name);
              })
              .map((p) => {
              const read = scoutPotentialView(p, scout);
              const line = countingForBoard(league, p);
              const value = valueForBoard(league, p);
              return (
              <tr key={p.id} className="gm-club-row" style={teamColorStyle(league.userTeamId)}>
                <td className="px-3 py-2">
                  <span className="inline-flex items-center gap-2 font-medium">
                    <PlayerHeadshot
                      playerId={p.nbaPlayerId ?? p.id}
                      name={p.name}
                      teamKey={p.teamId}
                      size="xs"
                    />
                    <Link href={`/gm/player/${encodeURIComponent(p.id)}`}>{p.name}</Link>
                  </span>
                </td>
                <td className="px-3 py-2">{p.position}</td>
                <td className="px-3 py-2 tabular-nums">{p.age}</td>
                <td className="px-3 py-2 tabular-nums">{playerSheet(p).overall}</td>
                <td className="px-3 py-2 tabular-nums">{formatWar1(value.war1, 1)}</td>
                <td className="px-3 py-2 tabular-nums">{formatWar1(value.drbl100, 1)}</td>
                <td className="px-3 py-2 tabular-nums">
                  {line ? rateLabel(line.pts, line.gp) : UNAVAILABLE_STAT_LABEL}
                </td>
                <td className="px-3 py-2 tabular-nums">
                  {line ? rateLabel(line.reb, line.gp) : UNAVAILABLE_STAT_LABEL}
                </td>
                <td className="px-3 py-2 tabular-nums">
                  {line ? rateLabel(line.ast, line.gp) : UNAVAILABLE_STAT_LABEL}
                </td>
                <td className="px-3 py-2 text-xs tabular-nums" title="Offense and defense attributes">
                  {sideRatings(p)}
                </td>
                <td className="px-3 py-2 tabular-nums" title={read.comment}>
                  {read.low}-{read.high}
                </td>
                <td className="px-3 py-2 tabular-nums">
                  {p.contract
                    ? `$${formatNumber(p.contract.annualSalaryM, 1)}M`
                    : "-"}
                </td>
                <td className="px-3 py-2 tabular-nums">
                  {p.contract?.yearsRemaining ?? "-"}
                </td>
                <td className="px-3 py-2 text-xs">
                  {p.injury
                    ? `${p.injury.type} (${p.injury.gamesRemaining}g)`
                    : "Healthy"}
                </td>
                <td className="px-3 py-2">
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() => waivePlayer(p.id)}
                  >
                    Waive
                  </Button>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-sm text-muted-foreground">
        Sorted by overall. DRBL/100 is the rating they entered with. Once games
        are played, WAR1 and the per-game columns follow this save. Open a name
        for the year-by-year log. Waiving a player keeps that salary on the cap
        for the years left on the deal. Bird rights stay until you renounce
        them on the cap sheet.
      </p>
    </div>
  );
}
