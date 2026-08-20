"use client";

import { GmShell } from "@/gm/ui/gm-shell";
import { useGmStore } from "@/gm/state/gm-store";
import { userTeam } from "@/gm/lib/selectors";
import { Button } from "@/components/ui/button";
import { expertiseLabel } from "@/gm/seed/scouts";

export default function GmStaffPage() {
  return (
    <GmShell>
      <StaffBody />
    </GmShell>
  );
}

function StaffBody() {
  const league = useGmStore((s) => s.league);
  const upgradeStaff = useGmStore((s) => s.upgradeStaff);
  const hireScout = useGmStore((s) => s.hireScout);
  const refreshScoutMarket = useGmStore((s) => s.refreshScoutMarket);
  if (!league) return null;
  const team = userTeam(league);
  const coach = team.staff.headCoach;
  const scout = team.staff.scout;
  const market = league.scoutMarket ?? [];

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Staff & culture</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-border p-4">
          <h3 className="font-medium">Head coach - {coach.name}</h3>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
            <li>Offense bonus: {coach.offenseBonus.toFixed(2)}</li>
            <li>Defense bonus: {coach.defenseBonus.toFixed(2)}</li>
            <li>Development: {coach.developmentBonus.toFixed(2)}</li>
          </ul>
        </div>
        <div className="rounded-xl border border-border p-4 sm:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="font-medium">Director of scouting</h3>
              {scout ? (
                <>
                  <p className="mt-1 text-[16px] font-semibold tracking-tight">
                    {scout.name}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {scout.yearsExperience} years ·{" "}
                    {expertiseLabel(scout.expertise)} · Eye {scout.eye}/5 · $
                    {scout.salaryM.toFixed(1)}M
                  </p>
                  <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
                    {scout.bio} Expertise sharpens grades on matching positions
                    and tools; eye + experience cut fog on the war-room board.
                  </p>
                </>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">
                  No director hired - draft fog is heavy. Pick someone below.
                </p>
              )}
            </div>
            {scout ? (
              <Button
                size="sm"
                variant="outline"
                disabled={scout.eye >= 5}
                onClick={() => upgradeStaff("scout")}
              >
                Develop eye
              </Button>
            ) : null}
          </div>

          <div className="mt-4 border-t border-border pt-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Available hires
              </p>
              <Button size="sm" variant="ghost" onClick={() => refreshScoutMarket()}>
                Refresh market
              </Button>
            </div>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {market.map((s) => (
                <li
                  key={s.id}
                  className="rounded-lg border border-border bg-secondary/40 p-3"
                >
                  <p className="text-[14px] font-semibold">{s.name}</p>
                  <p className="mt-0.5 text-[12px] text-muted-foreground">
                    {s.yearsExperience} yrs · {expertiseLabel(s.expertise)} · Eye{" "}
                    {s.eye}/5
                  </p>
                  <p className="mt-1 text-[12px] leading-snug text-muted-foreground">
                    {s.bio}
                  </p>
                  <Button
                    className="mt-2"
                    size="sm"
                    disabled={scout?.id === s.id}
                    onClick={() => hireScout(s.id)}
                  >
                    Hire · ${s.salaryM.toFixed(1)}M
                  </Button>
                </li>
              ))}
              {!market.length ? (
                <li className="text-sm text-muted-foreground">
                  Market empty - refresh for new candidates.
                </li>
              ) : null}
            </ul>
          </div>
        </div>
        <div className="rounded-xl border border-border p-4">
          <h3 className="font-medium">Training staff</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Level {team.staff.trainerLevel}/5 - fewer / shorter injuries.
          </p>
          <Button
            className="mt-3"
            size="sm"
            disabled={team.staff.trainerLevel >= 5}
            onClick={() => upgradeStaff("trainer")}
          >
            Upgrade training
          </Button>
        </div>
        <div className="rounded-xl border border-border p-4">
          <h3 className="font-medium">Ownership</h3>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
            <li>Goal: {team.ownerGoal}</li>
            <li>Patience: {team.ownerPatience}</li>
            <li>Fan confidence: {team.fanConfidence}</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
