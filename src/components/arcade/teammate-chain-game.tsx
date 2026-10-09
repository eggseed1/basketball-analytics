"use client";

import { useMemo, useState, type CSSProperties } from "react";

import { playerLabel, type ArcadeLeague } from "@/arcade/league";
import {
  areTeammates,
  buildTeammateGraph,
  chainStars,
  pickChainPuzzle,
  sharedStints,
  type ChainPuzzle,
  type TeammateGraph,
} from "@/arcade/teammates";
import { teamSeasonLabel } from "@/arcade/teams";
import { ArcadeLoading, PlayerAvatar } from "@/components/arcade/arcade-parts";
import { arcadeTeamLook } from "@/components/arcade/team-look";
import { useArcadeLeague } from "@/components/arcade/use-arcade-league";
import { HistoricalTeamMark } from "@/components/brand/historical-team-mark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

function searchKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, "");
}

export function TeammateChainGame() {
  const { league, failed, retry } = useArcadeLeague();
  if (!league) return <ArcadeLoading failed={failed} onRetry={retry} />;
  return <ChainBoard league={league} />;
}

function ChainBoard({ league }: { league: ArcadeLeague }) {
  const graph = useMemo(() => buildTeammateGraph(league), [league]);
  const stars = useMemo(() => chainStars(league), [league]);
  const years = useMemo(() => {
    const span = new Map<number, [string, string]>();
    for (const row of league.rows) {
      const prior = span.get(row.pid);
      span.set(row.pid, prior ? [prior[0], row.season] : [row.season, row.season]);
    }
    return span;
  }, [league]);
  const keys = useMemo(() => league.players.map((p) => searchKey(p.name)), [league]);

  const [puzzle, setPuzzle] = useState<ChainPuzzle>(() => pickChainPuzzle(graph, stars));
  const [chain, setChain] = useState<number[]>([puzzle.from]);
  const [status, setStatus] = useState<"playing" | "solved" | "revealed">("playing");
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const last = chain[chain.length - 1];
  const matches = useMemo(() => {
    const q = searchKey(query.trim());
    if (q.length < 2) return [];
    return league.players
      .filter((p, i) => keys[i].includes(q) && !chain.includes(p.id))
      .sort((a, b) => Number(!keys[a.id].startsWith(q)) - Number(!keys[b.id].startsWith(q)))
      .slice(0, 8);
  }, [query, league, keys, chain]);

  function newPuzzle() {
    const next = pickChainPuzzle(graph, stars);
    setPuzzle(next);
    setChain([next.from]);
    setStatus("playing");
    setQuery("");
    setMessage(null);
  }

  function add(pid: number) {
    setQuery("");
    if (!areTeammates(graph, last, pid)) {
      setMessage(
        `${playerLabel(league, last)} and ${playerLabel(league, pid)} were never on the same team in the same season.`
      );
      return;
    }
    setMessage(null);
    const next = [...chain, pid];
    if (pid !== puzzle.to && areTeammates(graph, pid, puzzle.to)) next.push(puzzle.to);
    setChain(next);
    if (next[next.length - 1] === puzzle.to) setStatus("solved");
  }

  const par = puzzle.best.length - 2;
  const shown = status === "revealed" ? puzzle.best : chain;
  const between = chain.length - 2;

  const filled = status === "playing" ? Math.min(between, par) : par;
  return (
    <section className="flex flex-col gap-4">
      <div className="sports-card relative isolate flex flex-col gap-4 overflow-hidden px-4 py-5">
        <span aria-hidden className="strip-orb -z-10" style={{ left: -40, top: -40, "--orb-color": "#0a84ff" } as CSSProperties} />
        <span
          aria-hidden
          className="strip-orb strip-orb--b -z-10"
          style={{ right: -40, bottom: -50, "--orb-color": "#bf5af2" } as CSSProperties}
        />
        <div className="grid grid-cols-[6.5rem_minmax(0,1fr)_6.5rem] items-start gap-1 sm:grid-cols-[10rem_minmax(0,1fr)_10rem]">
          <Endpoint league={league} pid={puzzle.from} label="Start" years={years.get(puzzle.from)} />
          <div className="mt-5 flex items-center gap-1.5 sm:mt-7" aria-hidden>
            {Array.from({ length: par }, (_, i) => (
              <span key={i} className="flex flex-1 items-center gap-1.5">
                <span className={cn("h-0.5 flex-1 rounded-full", i < filled ? "bg-foreground" : "bg-foreground/15")} />
                <span
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold transition-colors",
                    i < filled
                      ? "bg-foreground text-background"
                      : "border-2 border-dashed border-foreground/25 text-muted-foreground"
                  )}
                >
                  {i < filled ? i + 1 : "?"}
                </span>
              </span>
            ))}
            <span className={cn("h-0.5 flex-1 rounded-full", status !== "playing" ? "bg-foreground" : "bg-foreground/15")} />
          </div>
          <Endpoint league={league} pid={puzzle.to} label="Reach" years={years.get(puzzle.to)} />
        </div>
        <p className={cn(type.caption, "text-center text-muted-foreground")}>
          Shortest possible: {par} {par === 1 ? "player" : "players"} in between
        </p>
      </div>

      <div className="sports-card flex flex-col gap-3 px-4 py-4">
        <h2 className={type.heading}>Your chain</h2>
        <ChainList
          league={league}
          graph={graph}
          chain={shown}
          goal={status === "playing" ? puzzle.to : null}
        />

        {status === "playing" ? (
          <div className="relative flex flex-col gap-2">
            <label className={cn(type.caption, "font-semibold text-muted-foreground")} htmlFor="chain-input">
              Add a teammate of {playerLabel(league, last)}
            </label>
            <Input
              id="chain-input"
              value={query}
              autoComplete="off"
              placeholder="Type a player's name"
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && matches[0]) add(matches[0].id);
              }}
            />
            {matches.length ? (
              <ul role="list" className="flex flex-col overflow-hidden rounded-lg border border-border bg-background">
                {matches.map((p) => {
                  const span = years.get(p.id);
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => add(p.id)}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-secondary/60 focus-visible:bg-secondary/60 focus-visible:outline-none"
                      >
                        <PlayerAvatar player={p} className="size-7 text-[11px]" />
                        <span className={cn(type.bodySm, "font-semibold")}>{playerLabel(league, p.id)}</span>
                        {span ? (
                          <span className={cn(type.caption, "ml-auto text-muted-foreground")}>
                            {span[0].slice(0, 4)}–{span[1].slice(0, 2)}
                            {span[1].slice(5)}
                          </span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : null}
            {message ? <p className={cn(type.caption, "text-destructive")}>{message}</p> : null}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={chain.length < 2}
                onClick={() => {
                  setChain(chain.slice(0, -1));
                  setMessage(null);
                }}
              >
                Undo
              </Button>
              <Button variant="ghost" onClick={() => setStatus("revealed")}>
                Show the answer
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-start gap-3 border-t border-border/70 pt-3">
            <p className={type.bodySm}>
              {status === "revealed"
                ? `One shortest chain, with ${par} in between.`
                : between <= par
                  ? `Solved with ${between} in between. That matches the shortest chain.`
                  : `Solved with ${between} in between. The shortest chain needs ${par}.`}
            </p>
            <Button size="lg" onClick={newPuzzle}>
              New puzzle
            </Button>
          </div>
        )}
      </div>

      <p className={cn(type.caption, "text-muted-foreground")}>
        Teammates means on the same team in the same season, from 1996-97 on. A player traded
        midseason counts for every team he played for that year.
      </p>
    </section>
  );
}

function Endpoint({
  league,
  pid,
  label,
  years,
}: {
  league: ArcadeLeague;
  pid: number;
  label: string;
  years?: [string, string];
}) {
  const player = league.players[pid];
  return (
    <div className="flex min-w-0 flex-col items-center gap-2 text-center">
      <PlayerAvatar player={player} className="size-16 text-lg ring-4 ring-background shadow-lg sm:size-20 sm:text-xl" />
      <div className="min-w-0">
        <p className={cn(type.micro, "font-bold uppercase tracking-[0.12em] text-muted-foreground")}>{label}</p>
        <p className={cn(type.bodySm, "font-semibold sm:text-base")}>{playerLabel(league, pid)}</p>
        {years ? (
          <p className={cn(type.caption, "text-muted-foreground")}>
            {years[0].slice(0, 4)}–{years[1].slice(0, 2)}
            {years[1].slice(5)}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function LinkPill({ stint, more }: { stint: string; more: number }) {
  const [season, team] = stint.split("|");
  if (!season || !team) return null;
  const look = arcadeTeamLook(team, season);
  return (
    <span
      className="inline-flex max-w-full items-center gap-1.5 rounded-full py-0.5 pl-1 pr-2.5 text-[12px] font-semibold"
      style={{ background: `color-mix(in oklab, ${look.primary} 14%, transparent)` }}
    >
      {look.brand ? <HistoricalTeamMark brand={look.brand} size="2xs" /> : null}
      <span className="truncate">{teamSeasonLabel(season, team)}</span>
      {more > 0 ? <span className="shrink-0 text-muted-foreground">+{more} more</span> : null}
    </span>
  );
}

function ChainList({
  league,
  graph,
  chain,
  goal,
}: {
  league: ArcadeLeague;
  graph: TeammateGraph;
  chain: number[];
  goal: number | null;
}) {
  return (
    <ol className="flex flex-col">
      {chain.map((pid, i) => {
        const player = league.players[pid];
        const link = i > 0 ? sharedStints(graph, chain[i - 1], pid) : [];
        return (
          <li key={`${pid}-${i}`} className="arcade-pop flex flex-col">
            {i > 0 ? (
              <span className="ml-[19px] flex items-center border-l-2 border-foreground/70 py-2 pl-6">
                {link[0] ? <LinkPill stint={link[0]} more={link.length - 1} /> : null}
              </span>
            ) : null}
            <span className="flex items-center gap-3">
              <PlayerAvatar player={player} className="size-10 text-sm ring-2 ring-foreground/80" />
              <span className={cn(type.bodySm, "font-semibold")}>{playerLabel(league, pid)}</span>
            </span>
          </li>
        );
      })}
      {goal != null ? (
        <li className="flex flex-col opacity-60" aria-label={`Goal: ${playerLabel(league, goal)}`}>
          <span className="ml-[19px] h-8 border-l-2 border-dashed border-foreground/30" />
          <span className="flex items-center gap-3">
            <PlayerAvatar
              player={league.players[goal]}
              className="size-10 text-sm outline-dashed outline-2 outline-offset-2 outline-foreground/30 grayscale"
            />
            <span className={cn(type.bodySm, "font-semibold text-muted-foreground")}>{playerLabel(league, goal)}</span>
          </span>
        </li>
      ) : null}
    </ol>
  );
}
