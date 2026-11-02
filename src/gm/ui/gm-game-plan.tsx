"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClubMark } from "@/gm/ui/club-mark";
import { Button } from "@/components/ui/button";
import { useGmStore } from "@/gm/state/gm-store";
import { isLineupReady, nextUserGame, userGamesRemaining } from "@/gm/lib/selectors";
import { formatTipDateLong } from "@/gm/seed/real-schedule";
import type { GmDigestItem, GmLeagueState } from "@/gm/types";

/** Headlines are optional reading; the next action belongs above them. */
function RecentResults({ digest }: { digest?: GmDigestItem[] }) {
  if (!digest?.length) return null;
  return <details className="border-t border-border pt-3 text-sm">
    <summary className="cursor-pointer font-medium">Since your last sim ({digest.length})</summary>
    <ul className="mt-2 space-y-3">
      {digest.slice(0, 5).map(item => <li key={item.headline}>
        <p className="font-medium">{item.headline}</p>
        <p className="text-xs text-muted-foreground">{item.detail}{item.gameId ? <> · <Link className="underline underline-offset-4" href={`/gm/game/${item.gameId}`}>Box score</Link></> : null}</p>
      </li>)}
    </ul>
  </details>;
}

export function GmGamePlan({ league }: { league: GmLeagueState }) {
  const router = useRouter();
  const simPlayoffDay = useGmStore(s => s.simPlayoffDay);
  const finishPlayoffRound = useGmStore(s => s.finishPlayoffRound);
  const simRestOfPlayoffs = useGmStore(s => s.simRestOfPlayoffs);
  const simPlayInNight = useGmStore(s => s.simPlayInNight);
  const finishPlayIn = useGmStore(s => s.finishPlayIn);
  const simulateNextGame = useGmStore(s => s.simulateNextGame);
  const startAutoSim = useGmStore(s => s.startAutoSim);
  const stopAutoSim = useGmStore(s => s.stopAutoSim);
  const simRun = useGmStore(s => s.simRun);
  const next = nextUserGame(league);
  const ready = isLineupReady(league);
  const running = Boolean(simRun && simRun.kind !== "day");

  if (league.phase === "play_in" && league.playIn) {
    return <section className="sports-card flex flex-col gap-3 p-4" aria-label="Play-in controls">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-lg font-bold">Play-in</h2><p className="text-sm text-muted-foreground">Your next postseason games</p></div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => simPlayInNight()}>Sim next game</Button>
          <Button variant="outline" onClick={() => finishPlayIn()}>Finish play-in</Button>
        </div>
      </div>
      <details className="text-sm"><summary className="cursor-pointer font-medium">More options</summary>
        <div className="mt-2 flex flex-wrap gap-2"><Button variant="outline" onClick={() => { finishPlayIn(); simRestOfPlayoffs(); }}>Sim to draft</Button><Link className="text-sm underline underline-offset-4" href="/gm/lineup">Rotation</Link></div>
      </details>
      <RecentResults digest={league.digest}/>
    </section>;
  }

  if (league.phase === "playoffs") {
    return <section className="sports-card flex flex-col gap-3 p-4" aria-label="Playoff controls">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold">Playoffs</h2>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => simPlayoffDay()}>Sim next game</Button>
          <Button variant="outline" onClick={() => finishPlayoffRound()}>Sim round</Button>
        </div>
      </div>
      <details className="text-sm"><summary className="cursor-pointer font-medium">More options</summary>
        <div className="mt-2 flex flex-wrap gap-3"><Button variant="outline" onClick={() => simRestOfPlayoffs()}>Sim playoffs</Button><Link href="/gm/lineup" className="underline underline-offset-4">Edit rotation</Link></div>
      </details>
      <RecentResults digest={league.digest}/>
    </section>;
  }

  if (["draft","free_agency","offseason"].includes(league.phase)) {
    return <section className="sports-card flex flex-wrap items-center justify-between gap-3 p-4">
      <div><h2 className="text-lg font-bold">Offseason</h2><p className="text-sm text-muted-foreground">Your next decision is ready.</p></div>
      <Button onClick={() => router.push("/gm/offseason")}>Continue offseason</Button>
    </section>;
  }

  return <section className="sports-card flex flex-col gap-3 p-4" aria-label="Next game">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Next up</p>
        <h2 className="mt-1 flex items-center gap-2 text-xl font-bold">
          {next ? <>
            {next.homeTeamId === league.userTeamId ? "vs" : "@"}
            <ClubMark teamId={next.homeTeamId === league.userTeamId ? next.awayTeamId : next.homeTeamId} label={(next.homeTeamId === league.userTeamId ? next.awayTeamId : next.homeTeamId).toUpperCase()}/>
          </> : "Season complete"}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">{next ? (next.gameDate ? formatTipDateLong(next.gameDate) : `Day ${next.day}`) : "Continue to the postseason"} · {userGamesRemaining(league)} games left</p>
      </div>
      {running ? <Button onClick={() => stopAutoSim()}>Stop sim</Button>
      : !ready ? <Button onClick={() => router.push("/gm/lineup")}>Set lineup</Button>
      : next ? <div className="flex flex-wrap gap-2">
        <Button onClick={() => router.push("/gm/night")}>Play game</Button>
        <Button variant="outline" onClick={() => { const id = simulateNextGame(); if(id) router.push(`/gm/game/${id}?watch=1`); }}>Watch sim</Button>
      </div>
      : <Button onClick={() => router.push("/gm/offseason")}>Continue</Button>}
    </div>
    {!ready ? <p role="status" className="text-sm text-muted-foreground">Choose a starting five to play or simulate.</p> : null}
    <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3 text-xs">
      <Link href="/gm/lineup" className="font-medium underline-offset-4 hover:underline">Rotation</Link>
      {league.phase === "regular" && !running && ready ? <button type="button" className="font-medium underline-offset-4 hover:underline" onClick={() => startAutoSim("next")}>Sim to next game</button> : null}
      <Link href="/gm/trade" className="font-medium underline-offset-4 hover:underline">Trades</Link>
      <Link href="/gm/standings" className="font-medium underline-offset-4 hover:underline">Standings</Link>
    </div>
    <RecentResults digest={league.digest}/>
  </section>;
}
