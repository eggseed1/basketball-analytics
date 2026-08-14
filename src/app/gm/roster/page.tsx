"use client";

import { GmShell } from "@/gm/ui/gm-shell";
import { useGmStore } from "@/gm/state/gm-store";
import { displayImpact, userPlayers } from "@/gm/lib/selectors";
import { Button } from "@/components/ui/button";
import { PlayerHeadshot } from "@/components/brand/player-headshot";
import { formatNumber } from "@/lib/format";

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

  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-bold tracking-tight text-xl tracking-wide">
        Roster ({players.length})
      </h2>
      <div className="arena-panel overflow-x-auto">
        <table className="w-full min-w-[800px] text-left text-sm">
          <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Player</th>
              <th className="px-3 py-2">Pos</th>
              <th className="px-3 py-2">Age</th>
              <th className="px-3 py-2">Impact</th>
              <th className="px-3 py-2">O/D</th>
              <th className="px-3 py-2">Pot</th>
              <th className="px-3 py-2">$</th>
              <th className="px-3 py-2">Yrs</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {players.map((p) => (
              <tr key={p.id}>
                <td className="px-3 py-2">
                  <span className="inline-flex items-center gap-2 font-medium">
                    <PlayerHeadshot
                      playerId={p.nbaPlayerId ?? p.id}
                      name={p.name}
                      teamKey={p.teamId}
                      size="xs"
                    />
                    {p.name}
                  </span>
                </td>
                <td className="px-3 py-2">{p.position}</td>
                <td className="px-3 py-2 tabular-nums">{p.age}</td>
                <td className="px-3 py-2 tabular-nums">{displayImpact(p)}</td>
                <td className="px-3 py-2 text-xs tabular-nums">
                  {(p.scouted.offense ?? p.ratings.offense).toFixed(1)}/
                  {(p.scouted.defense ?? p.ratings.defense).toFixed(1)}
                </td>
                <td className="px-3 py-2 tabular-nums">
                  {p.ratings.potential.toFixed(1)}
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
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
