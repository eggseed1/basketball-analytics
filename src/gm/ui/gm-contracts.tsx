"use client";

import Link from "next/link";
import { SectionFrame } from "@/components/layout/section-frame";
import { buttonVariants } from "@/components/ui/button";
import { extensionQuote } from "@/gm/engine/extensions";
import { cbaSeason } from "@/gm/engine/season-flow-state";
import { useGmStore } from "@/gm/state/gm-store";
import { GmPlayerPortrait } from "@/gm/ui/gm-player-portrait";
import { userPlayers } from "@/gm/lib/selectors";
import type { GmLeagueState, GmPlayer } from "@/gm/types";

function ContractRow({ league, player }: { league: GmLeagueState; player: GmPlayer }) {
  const quote = extensionQuote(league, player);
  const contract = player.contract;
  return <li className="flex flex-wrap items-center justify-between gap-3 py-4">
    <div className="flex min-w-0 items-center gap-3">
      <GmPlayerPortrait player={player} size="sm" />
      <div className="min-w-0">
        <Link href={"/gm/player/" + player.id} className="font-semibold underline underline-offset-4">{player.name}</Link>
        <p className="mt-1 text-xs text-muted-foreground">
          {contract ? "$" + contract.annualSalaryM.toFixed(2) + "M per year · " +
            contract.yearsRemaining + " years left · " + contract.birdRights + " rights" :
            "Unsigned rookie contract"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {contract?.extension ? "Extended: " + contract.extension.years + " added years at $" +
            contract.extension.annualSalaryM.toFixed(2) + "M from " + contract.extension.startsSeason :
            quote.eligible ? "Agent asking $" + quote.askingSalaryM.toFixed(2) +
              "M / yr · max legal $" + quote.maxSalaryM.toFixed(2) + "M" : quote.reason}
        </p>
      </div>
    </div>
    {quote.eligible ? <Link href={"/gm/contracts/offer/" + encodeURIComponent(player.id)}
      className={buttonVariants({ size: "sm" })}>Negotiate extension</Link> : null}
  </li>;
}

export function GmContracts() {
  const league = useGmStore(state => state.league);
  if (!league) return null;
  const roster = userPlayers(league).sort((a, b) =>
    Number(extensionQuote(league, b).eligible) - Number(extensionQuote(league, a).eligible) ||
    (a.contract?.yearsRemaining ?? 0) - (b.contract?.yearsRemaining ?? 0));
  const ownFreeAgents = league.players.filter(player =>
    player.teamId == null && player.rightsTeamId === league.userTeamId);
  return <div className="flex min-w-0 flex-col gap-8">
    <header>
      <p className="text-xs text-muted-foreground">Contract year {cbaSeason(league)}</p>
      <h1 className="mt-1 text-2xl font-bold">Contracts and extensions</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Choose a player to open their contract screen. Adjust salary and years with sliders;
        the max offer respects the extension rules. Re-signing happens through the free-agency desk.
      </p>
    </header>
    <SectionFrame title="Your roster" description="Veteran extensions can open during the season. Rookie extensions close at opening night.">
      <ul className="divide-y divide-border">{roster.map(player =>
        <ContractRow key={player.id} league={league} player={player} />)}</ul>
    </SectionFrame>
    <SectionFrame title="Expiring rights" description="Keep Bird holds for a higher possible offer; renounce them to make cap room.">
      <p className="text-sm">{ownFreeAgents.length} former player(s) on your rights list.</p>
      <p className="mt-1 text-sm"><Link href="/gm/free-agency" className="font-semibold underline underline-offset-4">
        Open free-agency negotiations</Link>{" · "}<Link href="/gm/cap" className="underline underline-offset-4">Salary sheet</Link></p>
    </SectionFrame>
    <p className="text-xs text-muted-foreground">Team/player options and league-fixed qualifying offers are fixed terms, not adjustable negotiations. Imported contract books may lack full original signing dates.</p>
  </div>;
}
