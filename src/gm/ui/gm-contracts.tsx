"use client";
import { useState } from "react";
import Link from "next/link";
import { SectionFrame } from "@/components/layout/section-frame";
import { Button } from "@/components/ui/button";
import { extensionQuote } from "@/gm/engine/extensions";
import { cbaSeason } from "@/gm/engine/season-flow-state";
import { useGmStore } from "@/gm/state/gm-store";
import { userPlayers } from "@/gm/lib/selectors";
import type { GmLeagueState, GmPlayer } from "@/gm/types";

function ContractRow({ league, player }: { league: GmLeagueState; player: GmPlayer }) {
  const quote = extensionQuote(league, player);
  const extend = useGmStore(state => state.extendPlayer);
  const [salary, setSalary] = useState(quote.askingSalaryM);
  const [years, setYears] = useState(Math.min(3, quote.maxYears));
  const [note, setNote] = useState<string | null>(null);
  const contract = player.contract;
  return <li className="py-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="max-w-xl"><Link href={"/gm/player/" + player.id} className="font-semibold underline underline-offset-4">{player.name}</Link><p className="mt-1 text-sm text-muted-foreground">{contract ? "$" + contract.annualSalaryM.toFixed(2) + "M this year · " + contract.yearsRemaining + " years under contract · " + contract.birdRights + " rights" : "Unsigned rookie contract"}</p>
        <p className="mt-1 text-sm">{contract?.extension ? "Extension signed: " + contract.extension.years + " added years at $" + contract.extension.annualSalaryM.toFixed(2) + "M from " + contract.extension.startsSeason + "." : quote.reason}</p>
      </div>
      {quote.eligible ? <form className="flex flex-wrap items-end gap-2" onSubmit={event => { event.preventDefault(); setNote(extend(player.id, salary, years).reason); }}>
        <label className="text-xs">Annual salary ($M)<input aria-label={"Extension salary for " + player.name} type="number" min={quote.askingSalaryM} max={quote.maxSalaryM} step="0.01" value={salary} onChange={event => setSalary(Number(event.target.value))} className="mt-1 block w-28 rounded-md border border-border bg-background px-2 py-2 text-sm" /></label>
        <label className="text-xs">Added years<select aria-label={"Extension years for " + player.name} value={years} onChange={event => setYears(Number(event.target.value))} className="mt-1 block rounded-md border border-border bg-background px-2 py-2 text-sm">{Array.from({ length: quote.maxYears }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}</select></label>
        <Button size="sm" type="submit">Offer extension</Button>
      </form> : null}
    </div>
    {quote.eligible ? <p className="mt-2 text-xs text-muted-foreground">{quote.kind === "rookie" ? "Rookie" : "Veteran"} window · Starts {quote.startsSeason} · Ceiling ${quote.maxSalaryM.toFixed(2)}M. The current cap charge stays ${contract?.annualSalaryM.toFixed(2)}M.</p> : null}
    {note ? <p className="mt-2 text-sm" role="status">{note}</p> : null}
  </li>;
}

export function GmContracts() {
  const league = useGmStore(state => state.league);
  if (!league) return null;
  const roster = userPlayers(league).sort((a, b) => Number(extensionQuote(league, b).eligible) - Number(extensionQuote(league, a).eligible) || (a.contract?.yearsRemaining ?? 0) - (b.contract?.yearsRemaining ?? 0));
  const ownFreeAgents = league.players.filter(player => player.teamId == null && player.rightsTeamId === league.userTeamId);
  return <div className="flex min-w-0 flex-col gap-8"><header><p className="text-xs text-muted-foreground">Contract year {cbaSeason(league)}</p><h1 className="mt-1 text-2xl font-bold">Contracts and extensions</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">Extensions add future seasons while the current contract stays in force. Re-signing happens after expiry through your own-player window and free agency.</p></header>
    <SectionFrame title="Your roster" description="Final-year veteran extensions can stay open during the season. Rookie extensions close when the regular season tips off."><ul className="divide-y divide-border">{roster.map(player => <ContractRow key={player.id} league={league} player={player} />)}</ul></SectionFrame>
    <SectionFrame title="Expiring rights" description="Keep Bird holds to retain signing paths, or renounce them when you need cap room."><p className="text-sm">{ownFreeAgents.length} former player(s) on your rights list.</p><p className="text-sm"><Link href="/gm/free-agency" className="font-semibold underline underline-offset-4">Open re-signing and free agency</Link>{" · "}<Link href="/gm/cap" className="underline underline-offset-4">Salary sheet</Link></p></SectionFrame>
    <p className="text-xs text-muted-foreground">Extension eligibility is a simplified final-year model. Imported salary books lack some original signing dates. Designated veteran, renegotiation and extend-and-trade rules are not modeled here.</p>
  </div>;
}
