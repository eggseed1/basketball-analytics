"use client";

import { useState } from "react";
import { GmShell } from "@/gm/ui/gm-shell";
import { useGmStore } from "@/gm/state/gm-store";
import { displayImpact, userCap } from "@/gm/lib/selectors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function GmFreeAgencyPage() {
  return (
    <GmShell>
      <FaBody />
    </GmShell>
  );
}

function FaBody() {
  const league = useGmStore((s) => s.league);
  const signFreeAgent = useGmStore((s) => s.signFreeAgent);
  const [salary, setSalary] = useState(8);
  const [years, setYears] = useState(2);
  if (!league) return null;
  const cap = userCap(league);
  const agents = league.freeAgents
    .map((id) => league.players.find((p) => p.id === id)!)
    .filter(Boolean)
    .sort((a, b) => b.ratings.impact - a.ratings.impact)
    .slice(0, 40);

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Free agency</h2>
      <p className="text-sm text-muted-foreground">
        Cap room: ${cap.capRoomM.toFixed(1)}M. Offer below uses mid-level-ish
        defaults - tune salary/years then sign.
      </p>
      <div className="flex flex-wrap gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="fa-sal">Salary ($M)</Label>
          <Input
            id="fa-sal"
            type="number"
            value={salary}
            onChange={(e) => setSalary(Number(e.target.value))}
            className="w-28"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="fa-yrs">Years</Label>
          <Input
            id="fa-yrs"
            type="number"
            value={years}
            onChange={(e) => setYears(Number(e.target.value))}
            className="w-28"
          />
        </div>
      </div>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Player</th>
              <th className="px-3 py-2">Pos</th>
              <th className="px-3 py-2">Age</th>
              <th className="px-3 py-2">Impact</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {agents.map((p) => (
              <tr key={p.id}>
                <td className="px-3 py-2 font-medium">{p.name}</td>
                <td className="px-3 py-2">{p.position}</td>
                <td className="px-3 py-2">{p.age}</td>
                <td className="px-3 py-2">{displayImpact(p)}</td>
                <td className="px-3 py-2">
                  <Button
                    size="xs"
                    disabled={cap.rosterSize >= league.settings.maxRoster}
                    onClick={() => signFreeAgent(p.id, salary, years)}
                  >
                    Sign
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
