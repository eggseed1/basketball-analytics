"use client";

import { useRef, useState } from "react";
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
  const userConf = league.teams.find(team => team.id === league.userTeamId)?.conference ?? "East";
  const [conference, setConference] = useState<"East" | "West">(userConf);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const details = useRef<HTMLDivElement>(null);
  const selected = series.find(s => s.id === selectedId) ?? series.find(s => !s.done && (s.teamAId === league.userTeamId || s.teamBId === league.userTeamId)) ?? series.find(s => s.conf === conference);
  const finals = series.find(s => s.conf === "Finals");
  const selectedBoxes = selected ? seriesGameBoxes(league, selected) : [];
  const openRound = Math.min(...series.filter(s => !s.done).map(s => s.round));
  const live = league.phase === "playoffs" && !league.champion;
  function choose(id: string) {
    setSelectedId(id);
    requestAnimationFrame(() => details.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }
  function run(kind: "game" | "round" | "all") {
    setError(null);
    try { if (kind === "game") sim(); else if (kind === "round") round(); else finish(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to simulate. Review your healthy rotation and try again."); }
  }
  return <SectionFrame title="Playoff bracket" description={finals?.winnerId ? `${abbr(league, finals.winnerId)} won the Finals.` : "Follow each path to the Finals. Select a matchup for game scores, box scores and watch mode."}>
    {controls && live ? <div className="flex flex-wrap gap-2">
      <Button onClick={() => run("game")}>Sim tonight</Button>
      <Button variant="outline" onClick={() => run("round")}>Finish round</Button>
      <Button variant="outline" onClick={() => run("all")}>Finish playoffs</Button>
    </div> : null}
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Bracket conference">
      {(["East", "West"] as const).map(conf => <Button key={conf} variant={conference === conf ? "default" : "outline"} aria-pressed={conference === conf} onClick={() => {
        setConference(conf);
        setSelectedId(series.find(s => s.conf === conf && !s.done)?.id ?? series.find(s => s.conf === conf)?.id ?? null);
      }}>{conf}</Button>)}
      <p className="text-xs text-muted-foreground">Best of seven · Select any matchup · Scroll across rounds</p>
    </div>
    <div className="gm-bracket-scroll" role="region" aria-label={`${conference} playoff bracket, scroll horizontally for later rounds`} tabIndex={0}>
      <div className="gm-bracket-tree" data-testid="playoff-bracket-tree">
        {ROUNDS.map((label, index) => {
          const entries = series.filter(s => s.conf === conference && s.round === index + 1);
          const previous = series.filter(s => s.conf === conference && s.round === index);
          return <div className="gm-bracket-round" key={label}>
            <h3>{label}</h3>
            <div className={`gm-bracket-slots gm-bracket-slots--${index + 1}`}>
              {Array.from({ length: 4 / 2 ** index }, (_, slot) => <div className={cn("gm-bracket-node", index < 2 && "has-next")} key={slot}>
                <SeriesCard series={entries[slot]} league={league} selected={entries[slot]?.id === selected?.id} onSelect={choose}
                  pending={index === 0 ? "Seeds pending" : `${abbr(league, previous[slot * 2]?.winnerId)} / ${abbr(league, previous[slot * 2 + 1]?.winnerId)}`} />
              </div>)}
            </div>
          </div>;
        })}
      </div>
    </div>
    <div className="gm-finals-path" aria-label="Path to the Finals">
      <div className="gm-finals-feeders">
        {(["East", "West"] as const).map(conf => <div key={conf} className="gm-postseason-card"><p className="text-xs text-muted-foreground">{conf} champion</p><p className="font-semibold">{abbr(league, series.find(s => s.conf === conf && s.round === 3)?.winnerId)}</p></div>)}
      </div>
      <div className="gm-finals-match"><h3 className="mb-2 text-sm font-semibold">NBA Finals</h3><SeriesCard series={finals} league={league} selected={finals?.id === selected?.id} pending="East winner / West winner" onSelect={choose} /></div>
    </div>
    {selected ? <div ref={details} className="gm-series-details" data-testid="postseason-series-details">
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
