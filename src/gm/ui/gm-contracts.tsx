"use client";

import { useState } from "react";
import Link from "next/link";
import { SectionFrame } from "@/components/layout/section-frame";
import { Button } from "@/components/ui/button";
import { TeamLogo } from "@/components/brand/team-logo";
import { GmPlayerPortrait } from "@/gm/ui/gm-player-portrait";
import { GmContractNegotiation } from "@/gm/ui/gm-contract-negotiation";
import { extensionQuote } from "@/gm/engine/extensions";
import { cbaSeason } from "@/gm/engine/season-flow-state";
import { useGmStore } from "@/gm/state/gm-store";
import { userPlayers } from "@/gm/lib/selectors";
import type { GmLeagueState, GmPlayer } from "@/gm/types";

function ExtensionRoom({ league, player, onClose }: {
  league: GmLeagueState;
  player: GmPlayer;
  onClose: () => void;
}) {
  const extend = useGmStore(state => state.extendPlayer);
  const quote = extensionQuote(league, player);
  const [salary, setSalary] = useState(Math.min(quote.askingSalaryM, quote.maxSalaryM));
  const [years, setYears] = useState(Math.min(3, quote.maxYears));
  const [note, setNote] = useState<string | null>(null);
  const can = quote.eligible && Number.isFinite(salary) &&
    salary > 0 && salary <= quote.maxSalaryM + 0.05 && years >= 1 && years <= quote.maxYears;
  return <div className="flex flex-col gap-3">
    <GmContractNegotiation
      league={league}
      player={player}
      mode="extension"
      salaryM={salary}
      years={years}
      onSalaryChange={setSalary}
      onYearsChange={setYears}
      onSubmit={() => setNote(extend(player.id, salary, years).reason)}
      onClose={onClose}
      canSubmit={can}
      maxSalaryM={quote.maxSalaryM}
      maxYears={quote.maxYears}
      startsSeason={quote.startsSeason}
      submitLabel="Submit extension proposal"
      legalMessage={!quote.eligible ? quote.reason : salary > quote.maxSalaryM + 0.05 ? "Exceeds the permitted extension ceiling." : undefined}
    />
    {note ? <p role="status" className="rounded-lg border border-border bg-secondary/40 px-4 py-3 text-sm">{note}</p> : null}
  </div>;
}

export function GmContracts() {
  const league = useGmStore(state => state.league);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  if (!league) return null;
  const roster = userPlayers(league).sort((a,b) =>
    Number(extensionQuote(league,b).eligible) - Number(extensionQuote(league,a).eligible) ||
    (a.contract?.yearsRemaining ?? 0) - (b.contract?.yearsRemaining ?? 0));
  const selected = roster.find(p => p.id === selectedId) ?? null;
  const selectedQuote = selected ? extensionQuote(league, selected) : null;
  const eligible = roster.filter(p => extensionQuote(league,p).eligible);
  const expiring = roster.filter(p => p.contract?.yearsRemaining === 1);
  const ownFreeAgents = league.players.filter(p => p.teamId == null && p.rightsTeamId === league.userTeamId);

  return <div className="flex min-w-0 flex-col gap-5">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Front office · {cbaSeason(league)} cap year</p>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold"><TeamLogo teamKey={league.userTeamId} size="sm" />Contracts and extensions</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Review remaining deals, extension eligibility, CBA ceilings and the player's negotiating position. A signed extension begins after the current contract ends.</p>
      </div>
      <Link href="/gm/free-agency" className="rounded-lg border border-border px-4 py-2.5 text-sm font-semibold hover:bg-secondary">Free agency desk</Link>
    </header>
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="sports-card p-4"><p className="text-xs text-muted-foreground">Eligible to negotiate</p><strong className="mt-1 block text-2xl tabular-nums">{eligible.length}</strong></div>
      <div className="sports-card p-4"><p className="text-xs text-muted-foreground">Final year</p><strong className="mt-1 block text-2xl tabular-nums">{expiring.length}</strong></div>
      <div className="sports-card p-4"><p className="text-xs text-muted-foreground">Unsigned with your rights</p><strong className="mt-1 block text-2xl tabular-nums">{ownFreeAgents.length}</strong></div>
    </div>
    <SectionFrame title="Contract decisions" description="Select a player to meet with his agent. Rookie-scale extension windows close before tip-off; veteran extensions can remain open in-season when legal.">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] text-left text-sm">
          <thead><tr className="border-b border-border bg-secondary/40 text-xs text-muted-foreground"><th className="px-3 py-3">Player</th><th className="px-3 py-3">Current salary</th><th className="px-3 py-3">Contract</th><th className="px-3 py-3">Market demand</th><th className="px-3 py-3">Window</th><th className="px-3 py-3"></th></tr></thead>
          <tbody className="divide-y divide-border">
            {roster.map(player => {
              const quote = extensionQuote(league,player);
              const active = selectedId === player.id;
              return <tr key={player.id} className={active ? "bg-secondary/40" : undefined}>
                <td className="px-3 py-2.5"><div className="flex items-center gap-2"><GmPlayerPortrait player={player} size="sm" /><div className="min-w-0"><Link href={"/gm/player/" + player.id} className="font-semibold hover:underline">{player.name}</Link><p className="text-xs text-muted-foreground">{player.position} · {player.age} yrs</p></div></div></td>
                <td className="px-3 py-2.5 tabular-nums">${(player.contract?.annualSalaryM ?? 0).toFixed(1)}M</td>
                <td className="px-3 py-2.5">{player.contract?.yearsRemaining ?? 0} remaining · {player.contract?.birdRights ?? "none"}</td>
                <td className="px-3 py-2.5 tabular-nums">${quote.askingSalaryM.toFixed(1)}M / yr</td>
                <td className="px-3 py-2.5"><span title={quote.reason} className={quote.eligible ? "font-semibold text-foreground" : "text-xs text-muted-foreground"}>{player.contract?.extension ? "Extended" : quote.eligible ? "Eligible" : quote.reason}</span></td>
                <td className="px-3 py-2.5">{quote.eligible ? <Button size="sm" variant={active ? "default" : "outline"} onClick={() => setSelectedId(active ? null : player.id)}>{active ? "Selected" : "Negotiate"}</Button> : null}</td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>
    </SectionFrame>
    {selected && selectedQuote?.eligible ? <div id="extension-room" className="scroll-mt-24"><ExtensionRoom key={selected.id} player={selected} league={league} onClose={() => setSelectedId(null)} /></div> : null}
    <SectionFrame title="Retained signing rights" description="Your expiring players enter the offseason rights and re-signing stages. Keep their Bird holds when you need an over-cap signing path.">
      <p className="text-sm">{ownFreeAgents.length} unsigned player{ownFreeAgents.length === 1 ? "" : "s"} with prior-team rights.</p>
      <div className="mt-3 flex flex-wrap gap-3 text-sm"><Link href="/gm/free-agency" className="font-semibold underline underline-offset-4">Negotiate re-signings</Link><Link href="/gm/cap" className="underline underline-offset-4">Salary sheet</Link></div>
    </SectionFrame>
    <p className="text-xs text-muted-foreground">CBA note: extensions preserve the current-year salary. The 140% veteran ceiling uses the greater of last contract salary or estimated average player salary. Special designated-veteran, incentive, and renegotiation clauses are not represented in this contract model.</p>
  </div>;
}
