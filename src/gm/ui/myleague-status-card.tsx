"use client";

import { nextPlayablePhase } from "@/gm/myleague/phase";
import { useMyLeagueStore } from "@/gm/myleague/store";

/** Compact Layer B status for Franchise Lab shell (Milestone 2). */
export function MyLeagueStatusCard() {
  const hydrated = useMyLeagueStore((s) => s.hydrated);
  const myLeague = useMyLeagueStore((s) => s.myLeague);
  const simulation = useMyLeagueStore((s) => s.simulation);
  const historical = useMyLeagueStore((s) => s.historical);
  const decisions = useMyLeagueStore((s) => s.decisions);
  const canSimulate = useMyLeagueStore((s) => s.canSimulate);

  if (!hydrated) {
    return (
      <div className="sports-card px-4 py-3 text-sm text-muted-foreground">
        Loading MyLeague shell…
      </div>
    );
  }

  if (!myLeague || !simulation || !historical) {
    return (
      <div className="sports-card px-4 py-3 text-sm text-muted-foreground">
        MyLeague shell inactive - start a Franchise Lab save to bootstrap Reality /
        Simulation universes.
      </div>
    );
  }

  const gate = canSimulate();
  const seasonCount = Object.keys(historical.seasons).length;
  const decisionCount = Object.keys(decisions).length;
  const pending = simulation.pendingDecisions.length;
  const horizon = historical.realDataHorizon;
  const upcoming = nextPlayablePhase(simulation.phase);

  return (
    <section className="sports-card flex flex-col gap-3 px-4 py-4">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          MyLeague · Milestone 2
        </p>
        <h2 className="text-[17px] font-bold tracking-tight">
          {simulation.phase.replaceAll("_", " ")}
        </h2>
        <p className="text-[13px] text-muted-foreground">
          Season {simulation.currentSeason} · day {simulation.day} ·{" "}
          {myLeague.settings.mode.replaceAll("_", " ")}
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-[12px] sm:grid-cols-4">
        <div>
          <dt className="text-muted-foreground">Reality snaps</dt>
          <dd className="font-semibold">{seasonCount}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Data horizon</dt>
          <dd className="font-semibold">{horizon || "-"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Decisions</dt>
          <dd className="font-semibold">{decisionCount}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Sim gate</dt>
          <dd className="font-semibold">
            {gate.ok ? "open" : "blocked"}
            {pending ? ` · ${pending} pending` : ""}
          </dd>
        </div>
      </dl>
      <p className="text-[12px] text-muted-foreground">
        Next playable FO phase:{" "}
        <span className="font-semibold text-foreground">
          {upcoming.replaceAll("_", " ")}
        </span>
        . Universes persist in IndexedDB (
        <code className="text-[11px]">franchise-lab-myleague</code>
        ). Historical ingest is Milestone 3.
      </p>
      {!gate.ok && (
        <p className="text-[12px] text-muted-foreground">{gate.reason}</p>
      )}
    </section>
  );
}
