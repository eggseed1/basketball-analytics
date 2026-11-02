"use client";

import { useState } from "react";
import { SectionFrame } from "@/components/layout/section-frame";
import { TeamLogo } from "@/components/brand/team-logo";
import { Button } from "@/components/ui/button";
import { useGmStore } from "@/gm/state/gm-store";
import { createPlayInBoard, playInDone, playInOpenGames } from "@/gm/engine/play-in";
import { postseasonBox } from "@/gm/engine/postseason";
import { GmPostseasonGameLinks } from "@/gm/ui/gm-postseason-game-links";
import type { GmLeagueState, GmPlayInConference } from "@/gm/types";

function abbr(league: GmLeagueState, id: string) {
  return league.teams.find(team => team.id === id)?.abbr ?? id.toUpperCase();
}

export function GmPlayInSchedule({ league }: { league: GmLeagueState }) {
  const board = league.playIn ?? (league.phase === "play_in" ? createPlayInBoard(league) : null);
  const sim = useGmStore(state => state.simPlayInNight);
  const finish = useGmStore(state => state.finishPlayIn);
  const [error, setError] = useState<string | null>(null);
  if (!board) return null;
  const live = league.phase === "play_in";
  const complete = playInDone(board);
  const open = playInOpenGames(board);
  function run(all: boolean) {
    setError(null);
    try { if (all) finish(); else sim(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to simulate. Review your healthy rotation and try again."); }
  }
  return <SectionFrame title="Play-in tournament" description="The 7–8 winner takes the seventh seed. The loser hosts the 9–10 winner for the final playoff spot.">
    {live ? <div className="flex flex-wrap gap-2">
      <Button onClick={() => run(false)}>{complete ? "Open the playoffs" : "Sim tonight"}</Button>
      {!complete ? <Button variant="outline" onClick={() => run(true)}>Finish the play-in</Button> : null}
    </div> : null}
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    <div className="grid gap-4 lg:grid-cols-2">
      {board.conferences.map(conf => <section key={conf.conf} aria-label={`${conf.conf} play-in`} className="gm-playin-conference">
        <h3 className="font-semibold">{conf.conf}</h3>
        <ol className="gm-playin-path">
          {(["seven", "nine", "eight"] as const).map(slot => {
            const result = conf.results?.find(game => game.slot === slot);
            const homeId = slot === "seven" ? conf.sevenId : slot === "nine" ? conf.nineId : conf.sevenLoserId;
            const awayId = slot === "seven" ? conf.eightId : slot === "nine" ? conf.tenId : conf.nineWinnerId;
            const winnerId = slot === "seven" ? conf.sevenSeedId : slot === "nine" ? conf.nineWinnerId : conf.eightSeedId;
            return <Match key={slot} league={league} homeId={homeId} awayId={awayId} winnerId={winnerId}
              label={slot === "seven" ? "7 vs 8 · Seventh seed" : slot === "nine" ? "9 vs 10 · Elimination" : "Final · Eighth seed"}
              pending={slot === "eight" ? "7–8 loser vs 9–10 winner" : "Matchup pending"}
              result={result} available={live && open.some(game => game.homeId === homeId && game.awayId === awayId)} />;
          })}
        </ol>
      </section>)}
    </div>
  </SectionFrame>;
}

function Match({ league, homeId, awayId, winnerId, label, pending, result, available }: {
  league: GmLeagueState; homeId?: string; awayId?: string; winnerId?: string;
  label: string; pending: string; result?: NonNullable<GmPlayInConference["results"]>[number]; available: boolean;
}) {
  const box = result ? postseasonBox(league, { ...result, homeTeamId: result.homeId, awayTeamId: result.awayId }, "play_in") : undefined;
  return <li className="gm-postseason-card">
    <p className="text-xs font-semibold text-muted-foreground">{label}</p>
    {homeId && awayId ? <>
      {[awayId, homeId].map(id => <div key={id} className="gm-bracket-team">
        <TeamLogo teamKey={id} size="xs" /><span className={winnerId === id ? "font-bold" : undefined}>{abbr(league, id)}{id === league.userTeamId ? " · You" : ""}</span>
        <span className="ml-auto tabular-nums">{result ? id === result.homeId ? result.homeScore : result.awayScore : id === homeId ? "Home" : "Away"}</span>
      </div>)}
      {result ? <GmPostseasonGameLinks boxId={box?.id} label={`${abbr(league, awayId)} at ${abbr(league, homeId)}`} /> : available ? <GmPostseasonGameLinks match={{ homeId, awayId }} label={`${abbr(league, awayId)} at ${abbr(league, homeId)}`} /> : <p className="text-xs text-muted-foreground">Waiting for the first night to finish.</p>}
    </> : <p className="text-sm text-muted-foreground">{pending}</p>}
    {winnerId ? <p className="text-xs font-semibold">{abbr(league, winnerId)} {label.startsWith("9") ? "advances to the final" : "clinches the seed"}</p> : null}
  </li>;
}
