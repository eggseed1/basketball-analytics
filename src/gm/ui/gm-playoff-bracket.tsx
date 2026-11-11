"use client";

import { useState } from "react";
import { SectionFrame } from "@/components/layout/section-frame";
import { TeamLogo } from "@/components/brand/team-logo";
import { Button } from "@/components/ui/button";
import { useGmStore } from "@/gm/state/gm-store";
import { seriesHosts } from "@/gm/engine/standings";
import { seriesGameBoxes } from "@/gm/engine/postseason";
import { GmPostseasonGameLinks } from "@/gm/ui/gm-postseason-game-links";
import type { GmLeagueState, GmPlayoffSeries } from "@/gm/types";
import { cn } from "@/lib/utils";

const ROUNDS = ["First round", "Conference semifinals", "Conference finals"];
function abbr(league: GmLeagueState, id?: string) {
  return league.teams.find(team => team.id === id)?.abbr ?? id?.toUpperCase() ?? "TBD";
}

export function GmPlayoffBracket({ league, controls = false }: { league: GmLeagueState; controls?: boolean }) {
  const series = league.playoffBracket ?? [];
  const sim = useGmStore(state => state.simPlayoffDay);
  const round = useGmStore(state => state.finishPlayoffRound);
  const finish = useGmStore(state => state.simRestOfPlayoffs);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selected = series.find(s => s.id === selectedId) ?? series.find(s => !s.done && (s.teamAId === league.userTeamId || s.teamBId === league.userTeamId)) ?? finals;
  const finals = series.find(s => s.conf === "Finals");
  const selectedBoxes = selected ? seriesGameBoxes(league, selected) : [];
  const openRound = Math.min(...series.filter(s => !s.done).map(s => s.round));
  const live = league.phase === "playoffs" && !league.champion;
  function choose(id: string) {
    setSelectedId(id);
  }
  function run(kind: "game" | "round" | "all") {
    setError(null);
    try { if (kind === "game") sim(); else if (kind === "round") round(); else finish(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to simulate. Review your healthy rotation and try again."); }
  }
  return <SectionFrame title="Playoff bracket" description={finals?.winnerId ? `${abbr(league, finals.winnerId)} won the Finals.` : "Follow each path to the Finals. Select a matchup for game scores, box scores and watch mode."}>
    {controls && live ? <div className="sticky top-0 z-30 -mx-2 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-background/95 p-2 shadow-sm backdrop-blur" data-testid="playoff-sim-controls">
      <Button onClick={() => run("game")}>Sim tonight</Button>
      <Button variant="outline" onClick={() => run("round")}>Finish round</Button>
      <Button variant="outline" onClick={() => run("all")}>Finish playoffs</Button>
    </div> : null}
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    <div className="rounded-xl border border-border bg-card p-3 sm:p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Western Conference</p>
        <h2 className="text-base font-black tracking-wide">NBA Playoffs</h2>
        <p className="text-right text-xs font-semibold uppercase tracking-widest text-muted-foreground">Eastern Conference</p>
      </div>
      <div className="overflow-x-auto pb-2" role="region" aria-label="Full NBA playoff tree, West to East" tabIndex={0}>
        <div className="grid min-w-[920px] grid-cols-[1.5fr_1.15fr_1fr_1.35fr_1fr_1.15fr_1.5fr] items-stretch gap-2 lg:min-w-0" data-testid="playoff-bracket-tree">
          {(["West"] as const).map(conf => [1,2,3].map(roundNum => (
            <div key={conf+roundNum} className="flex min-h-[390px] flex-col gap-2">
              <p className="text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{ROUNDS[roundNum-1]}</p>
              <div className="flex flex-1 flex-col justify-around gap-2">
                {Array.from({length: 4 / (2 ** (roundNum-1))}, (_,slot) => {
                  const matches = series.filter(row => row.conf === conf && row.round === roundNum);
                  return <SeriesCard key={slot} series={matches[slot]} league={league} selected={matches[slot]?.id===selected?.id} pending="Winner TBD" onSelect={choose}/>;
                })}
              </div>
            </div>
          )))}
          <div className="flex min-h-[390px] flex-col items-center justify-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-amber-500/50 bg-amber-500/10 text-3xl" aria-hidden="true">🏆</div>
            <p className="text-center text-xs font-bold uppercase tracking-wider">NBA Finals</p>
            <SeriesCard series={finals} league={league} selected={finals?.id===selected?.id} pending="Conference winners" onSelect={choose}/>
          </div>
          {([3,2,1] as const).map(roundNum => (
            <div key={"East"+roundNum} className="flex min-h-[390px] flex-col gap-2">
              <p className="text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{ROUNDS[roundNum-1]}</p>
              <div className="flex flex-1 flex-col justify-around gap-2">
                {Array.from({length: 4 / (2 ** (roundNum-1))}, (_,slot) => {
                  const matches = series.filter(row => row.conf === "East" && row.round === roundNum);
                  return <SeriesCard key={slot} series={matches[slot]} league={league} selected={matches[slot]?.id===selected?.id} pending="Winner TBD" onSelect={choose}/>;
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Select a matchup to review game scores and box scores below. The sim controls remain at the top as rounds advance.</p>
    </div>
    {selected ? <div className="gm-series-details" data-testid="postseason-series-details">
      <h3 className="text-lg font-semibold">{abbr(league, selected.teamAId)} vs {abbr(league, selected.teamBId)}</h3>
      <p className="text-sm text-muted-foreground">{selected.conf === "Finals" ? "NBA Finals" : `${selected.conf} · ${ROUNDS[selected.round - 1]}`} · {selected.winsA}–{selected.winsB}{selected.done ? ` · ${abbr(league, selected.winnerId)} ${selected.conf === "Finals" ? "wins the title" : "advances"}` : ""}</p>
      <ol className="gm-series-games">
        {(selected.games ?? []).map((game, index) => <li key={game.gameId ?? index}>
          <div><p className="font-semibold">Game {index + 1}</p><p className="text-sm tabular-nums">{abbr(league, game.awayTeamId)} {game.awayScore} at {abbr(league, game.homeTeamId)} {game.homeScore}</p></div>
          <GmPostseasonGameLinks boxId={selectedBoxes[index]?.id} label={`Game ${index + 1}, ${abbr(league, game.awayTeamId)} at ${abbr(league, game.homeTeamId)}`} />
        </li>)}
        {!selected.done && live && selected.round === openRound ? <li>
          <div><p className="font-semibold">Game {(selected.games?.length ?? 0) + 1}</p><p className="text-sm">{abbr(league, seriesHosts(selected).awayTeamId)} at {abbr(league, seriesHosts(selected).homeTeamId)}</p></div>
          <GmPostseasonGameLinks key={`${selected.id}:${selected.games?.length ?? 0}`} seriesId={selected.id} label={`Game ${(selected.games?.length ?? 0) + 1}, ${abbr(league, selected.teamAId)} vs ${abbr(league, selected.teamBId)}`} />
        </li> : null}
      </ol>
      {!selected.games?.length && (!live || selected.round !== openRound) ? <p className="text-sm text-muted-foreground">This series has not started.</p> : null}
    </div> : null}
  </SectionFrame>;
}

function SeriesCard({ series, league, selected, pending, onSelect }: {
  series?: GmPlayoffSeries; league: GmLeagueState; selected: boolean; pending: string; onSelect: (id: string) => void;
}) {
  if (!series) return <div className="gm-bracket-card is-pending"><p className="text-xs text-muted-foreground">{pending}</p></div>;
  return <button type="button" className={cn("gm-bracket-card", selected && "is-selected", [series.teamAId, series.teamBId].includes(league.userTeamId) && "is-yours")}
    aria-pressed={selected} aria-label={`${abbr(league, series.teamAId)} vs ${abbr(league, series.teamBId)}, ${series.winsA} to ${series.winsB}. View series`} onClick={() => onSelect(series.id)}>
    {[series.teamAId, series.teamBId].map((id, index) => <span key={id} className={cn("gm-bracket-team", series.done && series.winnerId !== id && "opacity-50")}>
      <span className="text-xs text-muted-foreground">{(index === 0 ? series.seedA : series.seedB) ?? ""}</span>
      <TeamLogo teamKey={id} size="xs" /><span className="font-semibold">{abbr(league, id)}{id === league.userTeamId ? " · You" : ""}</span>
      <span className="ml-auto font-bold tabular-nums">{index === 0 ? series.winsA : series.winsB}</span>
    </span>)}
    <span className="mt-1 block text-xs text-muted-foreground">{series.done ? `${abbr(league, series.winnerId)} ${series.conf === "Finals" ? "wins the title" : "advances"}` : `${(series.games?.length ?? 0) ? `Game ${(series.games?.length ?? 0) + 1}` : "Series not started"} · View series`}</span>
  </button>;
}
