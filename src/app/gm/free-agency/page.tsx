"use client";

import { useState } from "react";
import { GmShell } from "@/gm/ui/gm-shell";
import { useGmStore } from "@/gm/state/gm-store";
import { displayOverall, displayPlayerName, userCap } from "@/gm/lib/selectors";
import { askingSalary, askingYears, faStageLabel } from "@/gm/engine/free-agency";
import { getCbaRules } from "@/gm/myleague/cba-registry";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { GmPlayer } from "@/gm/types";
import Link from "next/link";

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
  const resignOwn = useGmStore((s) => s.resignOwnFreeAgent);
  const advanceFaDay = useGmStore((s) => s.advanceFaDay);
  const runCpuSignings = useGmStore((s) => s.runCpuSignings);
  const runOffseason = useGmStore((s) => s.runOffseason);
  const openFreeAgency = useGmStore((s) => s.openFreeAgency);
  const [salary, setSalary] = useState(8);
  const [years, setYears] = useState(2);
  const [note, setNote] = useState<string | null>(null);
  if (!league) return null;

  const cap = userCap(league);
  const rules = getCbaRules(league.season);
  const market = league.faMarket;
  const open = league.phase === "free_agency";
  const agents = league.freeAgents
    .map((id) => league.players.find((p) => p.id === id))
    .filter((player): player is GmPlayer => player != null && player.teamId == null)
    .sort(
      (a, b) =>
        Number(displayOverall(b)) - Number(displayOverall(a)) ||
        a.name.localeCompare(b.name)
    )
    .slice(0, 50);

  const ownRights = agents.filter((p) => p.rightsTeamId === league.userTeamId);
  const agreements = market?.agreements ?? [];
  const pending = market?.pending ?? [];
  const teamName = (id: string) =>
    league.teams.find((t) => t.id === id)?.abbr ?? id.toUpperCase();

  function offerDefaults(player: GmPlayer) {
    setSalary(askingSalary(player, rules));
    setYears(askingYears(player, rules));
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">Free agency</h2>
        <p className="text-sm text-muted-foreground">
          Cap room ${cap.capRoomM.toFixed(1)}M · roster {cap.rosterSize}/
          {league.settings.maxRoster}
          {open
            ? ` · ${faStageLabel(market)}`
            : " · market closed until the draft ends"}
        </p>
      </header>

      {!open ? (
        <div className="flex flex-wrap gap-2">
          {league.phase === "draft" || league.phase === "offseason" ? (
            <Button onClick={() => openFreeAgency()}>Open free agency</Button>
          ) : (
            <p className="text-sm text-muted-foreground">
              Finish the season and draft first.{" "}
              <Link href="/gm" className="underline">
                Offseason hub
              </Link>
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => advanceFaDay()}
            disabled={Boolean(market?.done)}
          >
            Advance one day
          </Button>
          <Button variant="outline" onClick={() => runCpuSignings()}>
            Sim to quiet
          </Button>
          {market?.done ? (
            <Button onClick={() => runOffseason()}>Start next season</Button>
          ) : null}
        </div>
      )}

      {note ? (
        <p className="text-sm text-muted-foreground" role="status">
          {note}
        </p>
      ) : null}

      {open && agreements.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">Moratorium agreements</h3>
          <ul className="text-sm text-muted-foreground">
            {agreements.slice(0, 12).map((row) => {
              const player = league.players.find((p) => p.id === row.playerId);
              if (!player) return null;
              return (
                <li key={row.id}>
                  {displayPlayerName(player)} → {teamName(row.teamId)} ·{" "}
                  {row.years} yrs, ${row.salaryM.toFixed(1)}M
                  {row.teamId === league.userTeamId ? " (yours)" : ""}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {open && market?.recap?.length ? (
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">Recent moves</h3>
          <ul className="text-sm text-muted-foreground">
            {market.recap.slice(0, 8).map((line, i) => (
              <li key={`${i}-${line.slice(0, 24)}`}>{line}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {open && ownRights.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">Your Bird rights</h3>
          <ul className="divide-y divide-border rounded-xl border border-border">
            {ownRights.map((player) => (
              <li
                key={player.id}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
              >
                <span>
                  {displayPlayerName(player)} · {displayOverall(player)} OVR · ask $
                  {askingSalary(player, rules).toFixed(1)}M /{" "}
                  {askingYears(player, rules)} yrs
                </span>
                <Button
                  size="xs"
                  onClick={() => {
                    const result = resignOwn(player.id);
                    setNote(
                      result.ok
                        ? (result.note ?? "Deal in.")
                        : (result.reason ?? null)
                    );
                  }}
                >
                  Re-sign
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

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
              <th className="px-3 py-2">OVR</th>
              <th className="px-3 py-2">Ask</th>
              <th className="px-3 py-2">Interest</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {agents.map((p) => {
              const interest = pending.filter((row) => row.playerId === p.id);
              const agreed = agreements.find((row) => row.playerId === p.id);
              const ask = askingSalary(p, rules);
              const askY = askingYears(p, rules);
              return (
                <tr key={p.id}>
                  <td className="px-3 py-2 font-medium">
                    {displayPlayerName(p)}
                    {p.rightsTeamId === league.userTeamId ? (
                      <span className="ml-1 text-xs text-muted-foreground">
                        Bird
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">{p.position}</td>
                  <td className="px-3 py-2">{p.age}</td>
                  <td className="px-3 py-2 tabular-nums">
                    {displayOverall(p)}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">
                    ${ask.toFixed(1)}M / {askY}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {agreed
                      ? `Agreed ${teamName(agreed.teamId)}`
                      : interest.length
                        ? interest
                            .slice(0, 3)
                            .map((row) => teamName(row.teamId))
                            .join(", ")
                        : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      <Button
                        size="xs"
                        variant="outline"
                        disabled={!open}
                        onClick={() => offerDefaults(p)}
                      >
                        Load ask
                      </Button>
                      <Button
                        size="xs"
                        disabled={
                          !open ||
                          Boolean(market?.done) ||
                          cap.rosterSize >= league.settings.maxRoster ||
                          Boolean(
                            agreed && agreed.teamId !== league.userTeamId
                          )
                        }
                        onClick={() => {
                          const result = signFreeAgent(p.id, salary, years);
                          setNote(
                            result.ok
                              ? (result.note ??
                                  `Deal via ${(result.via ?? "room").replaceAll("_", " ")}.`)
                              : (result.reason ?? null)
                          );
                        }}
                      >
                        {market?.stage === "moratorium" ? "Pitch" : "Offer"}
                      </Button>
                    </div>
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
