"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Button } from "@/components/ui/button";
import { ClubMark } from "@/gm/ui/club-mark";
import { teamColorStyle } from "@/gm/ui/team-colors";
import type { GmLeagueState } from "@/gm/types";

type Phase = "ready" | "mixing" | "revealed" | "complete";

/**
 * Broadcast ceremony, NOT a second lottery roll. The weighted draft order is
 * saved before this screen loads; envelopes are opened 16 -> 1 (14 -> 1 pre-2027).
 * Only revealed picks enter the DOM so scouting users cannot spoil a reveal.
 */
export function GmLotteryMachine({
  league, onFinish,
}: { league: GmLeagueState; onFinish: () => void }) {
  const size = Math.min(league.lotteryCount ?? (league.season >= 2027 ? 16 : 14),
    league.teams.length);
  const [shown, setShown] = useState(() => league.seasonFlow?.lotteryRevealed ? size : 0);
  const [phase, setPhase] = useState<Phase>(league.seasonFlow?.lotteryRevealed ? "complete" : "ready");
  const [auto, setAuto] = useState(true);
  const slots = useMemo(() => Array.from({ length: size }, (_, i) => {
    const index = size - i - 1;
    return { pick: index + 1, owner: league.draftOrder?.[index] ?? league.lotteryOrder?.[index] ?? "",
      origin: league.draftSlotOrigins?.[index] ?? league.lotteryOrder?.[index] ?? "" };
  }), [size, league.draftOrder, league.lotteryOrder, league.draftSlotOrigins]);
  const current = slots[shown] ?? null;
  const revealed = slots.slice(0, shown);
  const isDone = phase === "complete";
  const nameOf = (id: string) => {
    const team = league.teams.find(t => t.id === id);
    return team ? team.city + " " + team.name : id.toUpperCase();
  };

  useEffect(() => {
    if (phase !== "mixing") return;
    const timer = window.setTimeout(() => {
      setShown(n => Math.min(size, n + 1));
      setPhase(shown + 1 >= size ? "complete" : "revealed");
      if (shown + 1 >= size) onFinish();
    }, current?.pick && current.pick <= 4 ? 2300 : 1450);
    return () => window.clearTimeout(timer);
  }, [phase, shown, size, current?.pick, onFinish]);

  useEffect(() => {
    if (phase !== "revealed" || !auto) return;
    const last = slots[shown - 1];
    const timer = window.setTimeout(() => setPhase("mixing"),
      last?.pick && last.pick <= 4 ? 2300 : last?.owner === league.userTeamId ? 2000 : 1250);
    return () => window.clearTimeout(timer);
  }, [phase, shown, auto, slots, league.userTeamId]);

  function skip() {
    setShown(size);
    setPhase("complete");
    onFinish();
  }
  const headline = phase === "mixing" ? "The drum is spinning…" :
    phase === "ready" ? "The envelopes are sealed." :
    isDone ? "The lottery is official." :
    current ? "Pick #" + current.pick + " is next." : "The lottery is official.";
  const last = slots[shown - 1];
  const lastDraw = last && league.lotteryDraws?.find(d=>d.teamId===last.origin);
  const jump = lastDraw && last && lastDraw.startingRank > last.pick &&
    (lastDraw.startingRank-last.pick>=3 || last.pick<=4);

  return <div data-testid="gm-lottery-ceremony" className="overflow-hidden rounded-2xl border border-border bg-background">
    <div className="bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 px-4 py-6 text-white sm:px-7 sm:py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.2em] text-cyan-200">Draft lottery · {league.season}</p>
          <h3 className="mt-2 text-xl font-black tracking-tight sm:text-2xl">{headline}</h3>
          <p className="mt-2 text-xs text-slate-300">{league.lotteryFormat === "classic" ? "Four weighted four-ball drawings · 14 lottery teams" :
            "3-2-1 weighted draw · 16 lottery teams"} · Results revealed from last to first</p>
        </div>
        <div className="rounded-md border border-white/25 bg-white/10 px-3 py-2 text-right text-xs">
          <strong className="block text-2xl tabular-nums">{shown}<span className="text-slate-400">/{size}</span></strong>
          Envelopes opened
        </div>
      </div>
      <div className="mt-6 grid items-center gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="gm-lotto-chamber relative mx-auto flex h-52 w-full max-w-sm items-center justify-center overflow-hidden rounded-[45%] border-4 border-slate-400/60 bg-slate-500/20 shadow-[inset_0_0_35px_rgba(255,255,255,.15)]">
          <div aria-hidden="true" className="absolute inset-3 rounded-[45%] border border-white/25" />
          {Array.from({length: 23}, (_, i) => {
            const cx = 50 + 33*Math.cos(i*2.399), cy=50+34*Math.sin(i*2.399);
            return <span aria-hidden="true" key={i}
              className={"gm-lotto-ball absolute flex h-8 w-8 items-center justify-center rounded-full border border-white/60 bg-gradient-to-br from-white via-slate-200 to-slate-400 text-[10px] font-extrabold text-slate-900 shadow-lg " +
                (phase === "mixing" ? "is-mixing" : "")}
              style={{left:cx+"%",top:cy+"%",animationDelay:(i*73%710)+"ms",
                ["--lotto-x" as string]:((i*37%110)-55)+"px",
                ["--lotto-y" as string]:((i*53%90)-45)+"px"} as CSSProperties}>
              {(i%14)+1}
            </span>;
          })}
          <div className="absolute bottom-0 left-1/2 h-7 w-28 -translate-x-1/2 rounded-t-full border-t-4 border-slate-300 bg-slate-900/80" />
          {phase === "mixing" ? <span className="absolute bottom-4 rounded-full bg-amber-400 px-3 py-1 text-[10px] font-black uppercase text-slate-950 animate-pulse">Mixing</span> : null}
        </div>
        <div className="flex min-h-44 flex-col justify-center rounded-xl border border-white/20 bg-black/25 p-5" aria-live="polite" aria-atomic="true">
          {isDone ? <>
            <span className="text-xs font-semibold uppercase tracking-widest text-emerald-300">Lottery complete</span>
            <strong className="mt-3 text-2xl font-black">Pick #1</strong>
            <div className="mt-3 flex items-center gap-2"><ClubMark teamId={slots[size-1]?.owner ?? ""} label={nameOf(slots[size-1]?.owner ?? "")} />
              <span className="font-semibold">{nameOf(slots[size-1]?.owner ?? "")}</span></div>
          </> : phase === "ready" ? <>
            <span className="text-xs font-bold uppercase tracking-widest text-amber-300">Live from the lottery room</span>
            <strong className="mt-3 text-2xl">Pick #{size} awaits</strong>
            <p className="mt-2 text-sm text-slate-300">Who falls? Who jumps? Start the drawing to find out.</p>
          </> : phase === "mixing" ? <>
            <span className="text-xs font-bold uppercase tracking-widest text-amber-300">Next envelope · #{current?.pick}</span>
            <div className="mt-5 flex gap-2" aria-label="Drawing lottery balls">
              {(league.lotteryFormat === "classic" && (current?.pick ?? 99)<=4 ? [0,1,2,3] : [0]).map(i =>
                <div key={i} className="gm-lotto-drawn flex h-11 w-11 items-center justify-center rounded-full bg-white font-black text-slate-900 shadow-lg" style={{animationDelay:(i*390)+"ms"}}>?</div>)}
            </div>
            <p className="mt-4 animate-pulse text-sm text-slate-300">Drawing in progress. The pick is still sealed.</p>
          </> : last ? <div style={teamColorStyle(last.owner)}>
            <p className="text-xs font-bold uppercase tracking-widest text-amber-300">Envelope opened · pick #{last.pick}</p>
            <div className="gm-lotto-team-in mt-4 flex flex-wrap items-center gap-3">
              <ClubMark teamId={last.owner} label={nameOf(last.owner)} />
              <strong className="text-xl">{nameOf(last.owner)}</strong>
            </div>
            {last.origin !== last.owner ? <p className="mt-2 text-xs text-slate-300">via {nameOf(last.origin)}&apos;s pick</p> : null}
            {last.owner === league.userTeamId ? <p className="mt-3 rounded-lg bg-emerald-500/20 px-3 py-2 font-bold text-emerald-200">YOUR TEAM IS ON THE CLOCK AT #{last.pick}!</p> : null}
            {jump ? <div className="gm-lotto-shock relative mt-4 overflow-hidden rounded-xl border-2 border-amber-400/70 bg-gradient-to-r from-amber-500/25 to-orange-500/10 p-3">
              {Array.from({length:20},(_,i)=><span aria-hidden="true" key={i}
                className="gm-lotto-celebration absolute -top-3 h-3 w-2 rounded-sm"
                style={{left:(i*47%100)+"%",background:i%2?"var(--team-primary)":"#fbbf24",
                  animationDelay:(i*61%680)+"ms"} as CSSProperties}/>)}
              <p className="text-[10px] font-black uppercase tracking-[.21em] text-amber-200">Lottery shock · into the spotlight</p>
              <strong className="mt-1 block text-2xl font-black text-white">↑ {lastDraw!.startingRank-last.pick} spots!</strong>
              <p className="mt-1 text-xs text-amber-100">{nameOf(last.origin)} climbs from projected #{lastDraw!.startingRank} to #{last.pick}.</p>
            </div> : null}
          </div> : null}
        </div>
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        {phase === "ready" ? <Button data-testid="lottery-start" className="bg-amber-400 font-bold text-slate-950 hover:bg-amber-300" onClick={()=>setPhase("mixing")}>Start lottery</Button> : null}
        {phase === "revealed" ? <Button data-testid="lottery-next" onClick={()=>setPhase("mixing")}>Open next envelope</Button> : null}
        {phase !== "complete" && phase !== "ready" ? <Button variant="outline" className="border-white/30 bg-transparent text-white hover:text-white" onClick={()=>setAuto(v=>!v)}>{auto?"Pause auto reveal":"Resume auto reveal"}</Button> : null}
        {!isDone ? <Button variant="ghost" className="text-slate-200 hover:text-white" data-testid="lottery-skip" onClick={skip}>Skip to final order</Button> : null}
        {isDone ? <p role="status" className="text-sm font-semibold text-emerald-300">All picks revealed. Continue to the combine.</p> : null}
      </div>
    </div>
    <div className="p-4 sm:p-6">
      <div className="mb-3 flex justify-between gap-3"><h4 className="font-bold">Lottery board</h4><span className="text-xs text-muted-foreground">Only opened envelopes are visible</span></div>
      {revealed.length ? <ol className="grid gap-2 sm:grid-cols-2" data-testid="lottery-revealed-order">
        {[...revealed].reverse().map(row=><li key={row.pick} className={"flex items-center gap-2 rounded-lg border px-3 py-2 text-sm "+(row.owner===league.userTeamId?"border-primary bg-primary/10":"border-border")}>
          <strong className="w-9 shrink-0 tabular-nums">#{row.pick}</strong>
          <ClubMark teamId={row.owner} label={nameOf(row.owner)} />
          <span className="truncate font-medium">{nameOf(row.owner)}</span>
          {row.owner!==row.origin?<span className="ml-auto text-xs text-muted-foreground">via {league.teams.find(t=>t.id===row.origin)?.abbr}</span>:null}
        </li>)}
      </ol> : <p className="text-sm text-muted-foreground">No envelopes opened yet.</p>}
    </div>
    <style>{`
      @keyframes lotto-tumble { 0%{transform:translate(-50%,-50%) rotate(0)} 25%{transform:translate(calc(-50% + var(--lotto-x)),calc(-50% + var(--lotto-y))) rotate(130deg)} 50%{transform:translate(calc(-50% - var(--lotto-y)),calc(-50% + var(--lotto-x))) rotate(290deg)} 100%{transform:translate(-50%,-50%) rotate(720deg)} }
      @keyframes lotto-extract { 0%{opacity:0;transform:translateY(38px) scale(.35)} 55%{opacity:1;transform:translateY(-9px) scale(1.22)} 100%{opacity:1;transform:translateY(0) scale(1)} }
      @keyframes lotto-enter { from{opacity:0;transform:translateY(10px) scale(.94)} to{opacity:1;transform:translateY(0) scale(1)} }
      @keyframes lotto-shock { from{opacity:.2;transform:scale(.85)} 65%{transform:scale(1.05)} to{opacity:1;transform:scale(1)} }
      @keyframes lotto-celebration { from{opacity:1;transform:translateY(-12px) rotate(0deg)} to{opacity:0;transform:translateY(130px) rotate(540deg)} }
      .gm-lotto-shock { animation:lotto-shock .6s cubic-bezier(.16,1,.3,1) both; }
      .gm-lotto-celebration { animation:lotto-celebration 1.5s ease-in forwards; }
      .gm-lotto-ball { transform:translate(-50%,-50%); }
      .gm-lotto-ball.is-mixing { animation:lotto-tumble .93s ease-in-out infinite; }
      .gm-lotto-drawn { opacity:0;animation:lotto-extract .65s cubic-bezier(.16,1,.3,1) forwards; }
      .gm-lotto-team-in { animation:lotto-enter .5s ease-out both; }
      @media(prefers-reduced-motion:reduce){.gm-lotto-ball.is-mixing,.gm-lotto-drawn,.gm-lotto-team-in,.gm-lotto-shock{animation:none;opacity:1}.gm-lotto-celebration{display:none}}
    `}</style>
  </div>;
}
