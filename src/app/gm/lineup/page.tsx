"use client";

import { GmShell } from "@/gm/ui/gm-shell";
import { useGmStore } from "@/gm/state/gm-store";
import { displayImpact, userPlayers, userTeam } from "@/gm/lib/selectors";
import type { GmPosition } from "@/gm/types";
import { Button } from "@/components/ui/button";

const POS: GmPosition[] = ["PG", "SG", "SF", "PF", "C"];

export default function GmLineupPage() {
  return (
    <GmShell>
      <LineupBody />
    </GmShell>
  );
}

function LineupBody() {
  const league = useGmStore((s) => s.league);
  const setStarter = useGmStore((s) => s.setStarter);
  const autoLineup = useGmStore((s) => s.autoLineup);
  if (!league) return null;
  const team = userTeam(league);
  const players = userPlayers(league);
  const byId = Object.fromEntries(players.map((p) => [p.id, p]));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Depth chart</h2>
        <Button variant="outline" size="sm" onClick={() => autoLineup()}>
          Auto-set by impact
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {POS.map((pos) => (
          <label
            key={pos}
            className="flex flex-col gap-1.5 rounded-xl border border-border p-3"
          >
            <span className="text-xs font-medium text-muted-foreground">
              {pos}
            </span>
            <select
              className="rounded-md border border-border bg-background px-2 py-2 text-sm"
              value={team.starters[pos] ?? ""}
              onChange={(e) =>
                setStarter(pos, e.target.value ? e.target.value : null)
              }
            >
              <option value=""> - </option>
              {players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.position}) {displayImpact(p)}
                </option>
              ))}
            </select>
            {team.starters[pos] && byId[team.starters[pos]!] ? (
              <p className="text-xs text-muted-foreground">
                True impact {byId[team.starters[pos]!].ratings.impact.toFixed(1)}{" "}
                · Morale {byId[team.starters[pos]!].morale}
              </p>
            ) : null}
          </label>
        ))}
      </div>
      <section>
        <h3 className="mb-2 font-medium">Bench order</h3>
        <ol className="list-decimal space-y-1 pl-5 text-sm">
          {team.benchOrder.map((id) => {
            const p = byId[id];
            if (!p) return null;
            return (
              <li key={id}>
                {p.name} · {p.position} · {displayImpact(p)}
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
