"use client";

import { GmShell } from "@/gm/ui/gm-shell";
import { useGmStore } from "@/gm/state/gm-store";
import { userPlayers } from "@/gm/lib/selectors";

export default function GmMedicalPage() {
  return (
    <GmShell>
      <MedicalBody />
    </GmShell>
  );
}

function MedicalBody() {
  const league = useGmStore((s) => s.league);
  if (!league) return null;
  const injured = userPlayers(league).filter((p) => p.injury);
  const healthy = userPlayers(league).filter((p) => !p.injury);

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Medical report</h2>
      <p className="text-sm text-muted-foreground">
        Trainer level {league.teams.find((t) => t.id === league.userTeamId)?.staff.trainerLevel}
        /5 shortens recoveries and lowers game injury risk.
      </p>
      <section>
        <h3 className="mb-2 font-medium">Out ({injured.length})</h3>
        {injured.length === 0 ? (
          <p className="text-sm text-muted-foreground">No injuries.</p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {injured.map((p) => (
              <li key={p.id} className="px-3 py-2 text-sm">
                <span className="font-medium">{p.name}</span> - {p.injury!.type}{" "}
                · {p.injury!.gamesRemaining} games · re-injury risk{" "}
                {(p.injury!.reinjuryRisk * 100).toFixed(0)}%
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h3 className="mb-2 font-medium">Available ({healthy.length})</h3>
        <p className="text-sm text-muted-foreground">
          Avg durability{" "}
          {(
            healthy.reduce((s, p) => s + p.ratings.durability, 0) /
            Math.max(1, healthy.length)
          ).toFixed(0)}
        </p>
      </section>
    </div>
  );
}
