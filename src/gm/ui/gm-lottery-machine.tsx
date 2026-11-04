"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ClubMark } from "@/gm/ui/club-mark";
import { teamColorStyle } from "@/gm/ui/team-colors";
import { LotteryPhysicsChamber } from "@/gm/ui/gm-lottery-physics-chamber";
import type { GmLeagueState } from "@/gm/types";

type Phase = "ready" | "mixing" | "pulled" | "complete";
type DrawStep = {
  pick: number;
  ballId: number;
  origin: string;
  accepted: boolean;
  collecting?: boolean;
  reason?: string;
};

const labels: Record<string, string> = {
  "consecutive-number-one": "Ineligible: back-to-back #1 picks",
  "third-top-five": "Ineligible: three consecutive top-five picks",
  "relegation-floor": "Returned: relegated teams must pick by #12",
};

/**
 * The animation never rerolls or shuffles the saved result. For 2027–29 the
 * engine has already sampled individually numbered balls from the 37-ball urn;
 * this ceremony plays every successful pull and restriction-driven redraw.
 * Draws are shown in actual extraction order (#1 -> #16), not via envelopes.
 */
export function GmLotteryMachine({
  league, onFinish,
}: { league: GmLeagueState; onFinish: () => void }) {
  const classic = league.lotteryFormat === "classic" || league.season <= 2026;
  const size = Math.min(league.lotteryCount ?? (classic ? 14 : 16), league.teams.length);
  const physical = !classic && league.lotteryBallPool?.length === 37 &&
    league.lotteryDraws?.slice(0, size).every(d => (d.attempts?.length ?? 0) > 0);
  const picks = useMemo(() => Array.from({ length: size }, (_, i) => ({
    pick: i + 1,
    owner: league.draftOrder?.[i] ?? league.lotteryOrder?.[i] ?? "",
    origin: league.draftSlotOrigins?.[i] ?? league.lotteryOrder?.[i] ?? "",
    draw: league.lotteryDraws?.[i],
  })), [league.draftOrder, league.lotteryOrder, league.draftSlotOrigins, league.lotteryDraws, size]);

  const steps = useMemo<DrawStep[]>(() => (league.lotteryDraws ?? []).slice(0, classic ? 4 : size).flatMap((draw, i) => {
    if (classic) {
      // Four balls without replacement form a combination in the old system.
      return draw.balls.map((ballId, index) => ({
        pick: i + 1, ballId, origin: draw.teamId, accepted: index === draw.balls.length - 1,
        collecting: index < draw.balls.length - 1,
      }));
    }
    const attempts = draw.attempts?.length
      ? draw.attempts
      : [{ ballId: draw.balls[0] ?? 1, teamId: draw.teamId, accepted: true }];
    return attempts.map(pull => ({
      pick: i + 1, ballId: pull.ballId, origin: pull.teamId,
      accepted: pull.accepted, reason: pull.reason,
    }));
  }), [league.lotteryDraws, classic, size]);

  const pool = useMemo(() => {
    if (classic) return Array.from({ length: 14 }, (_, i) => ({ id: i + 1, teamId: "" }));
    if (league.lotteryBallPool?.length === 37) return league.lotteryBallPool;
    // An old saved lottery had no real ball log. Show its fixed outcome without
    // claiming the illustrative numbers or chamber positions were the draw.
    let id = 1;
    return [...(league.lotteryDraws ?? [])].sort((a,b) => a.startingRank - b.startingRank)
      .flatMap(draw => Array.from({ length: Math.round(draw.oddsPct / 100 * 37) },
        () => ({ id: id++, teamId: draw.teamId })));
  }, [classic, league.lotteryBallPool, league.lotteryDraws]);

  const initiallyDone = Boolean(league.seasonFlow?.lotteryRevealed);
  const [step, setStep] = useState(() => initiallyDone ? steps.length : 0);
  const [phase, setPhase] = useState<Phase>(initiallyDone ? "complete" : "ready");
  const [auto, setAuto] = useState(true);
  const current = steps[step];
  const completed = steps.slice(0, step);
  const activePull = phase === "pulled" ? current : undefined;
  const shown = [...completed, ...(activePull ? [activePull] : [])];
  const revealedPicks = new Set(shown.filter(x => x.accepted).map(x => x.pick));
  const shownRows = picks.filter(p => classic
    ? p.pick > 4 || revealedPicks.has(p.pick) && p.pick <= 4
    : revealedPicks.has(p.pick));
  // Classic only four positions are randomly selected. The remainder must
  // inherit reverse-standings ordering, so they reveal with the final draw.
  const visibleRows = classic && phase !== "complete"
    ? shownRows.filter(p => p.pick <= 4) : phase === "complete" ? picks : shownRows;
  const selected = shown.filter(x => x.accepted && !classic).map(x => x.origin);
  const nameOf = (id: string) => {
    const team = league.teams.find(t => t.id === id);
    return team ? team.city + " " + team.name : id.toUpperCase();
  };
  const advance = () => {
    const next = step + 1;
    setStep(next);
    if (next >= steps.length) {
      setPhase("complete");
      onFinish();
    } else setPhase("mixing");
  };

  useEffect(() => {
    if (phase !== "mixing") return;
    const timer = window.setTimeout(() => setPhase("pulled"),
      step === 0 || (current?.pick ?? 0) <= 5 ? 1750 : 1150);
    return () => window.clearTimeout(timer);
  }, [phase, step, current?.pick]);

  useEffect(() => {
    if (phase !== "pulled" || !auto) return;
    const timer = window.setTimeout(advance,
      current?.accepted ? (current.pick <= 5 ? 2200 : 1150) :
        current?.collecting ? 650 : 1300);
    return () => window.clearTimeout(timer);
  // Advance reads the current draw and step; no other state is sampled.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, auto, step, current?.accepted, current?.pick, current?.collecting]);

  const skip = () => {
    setStep(steps.length);
    setPhase("complete");
    onFinish();
  };
  const done = phase === "complete";
  const headline = done ? "The lottery is official." :
    phase === "ready" ? "37 balls. 16 picks. One real draw." :
    phase === "mixing" ? "Air jets are mixing the balls…" :
    current?.accepted ? "Pick #" + current.pick + " has been drawn!" :
    current?.collecting ? "Ball " + current.ballId + " extracted." :
    "Ball returned. Drawing again.";
  const announced = shown.filter(x => x.accepted).length;
  const originallyDrawn = activePull ? picks[activePull.pick - 1] : undefined;
  const lastBall = activePull?.ballId;
  const legacy = !classic && !physical;

  return <div data-testid="gm-lottery-ceremony" className="overflow-hidden rounded-2xl border border-border bg-background">
    <div className="bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 px-4 py-6 text-white sm:px-7 sm:py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.2em] text-cyan-200">
            Draft lottery · {league.season}
          </p>
          <h3 className="mt-2 text-xl font-black tracking-tight sm:text-2xl">{headline}</h3>
          <p className="mt-2 text-xs text-slate-300">
            {classic ? "Historical 14 numbered balls · four-ball combinations for picks 1–4" :
              "16 teams · 37 separately numbered physical balls · picks 1–16 pulled in order"}
          </p>
          {!classic && league.season >= 2030 ? <p className="mt-1 text-xs text-amber-200">
            Franchise Lab continues 2027–29 rules for 2030+ until the NBA approves a replacement.
          </p> : null}
          {legacy ? <p className="mt-1 text-xs text-amber-200">
            Archived save: lottery results were fixed before numbered-ball records existed. Chamber is illustrative for this draft.
          </p> : null}
        </div>
        <div className="rounded-lg border border-white/25 bg-white/10 px-3 py-2 text-right text-xs">
          <strong className="block text-2xl tabular-nums">{done ? size : classic ? announced : announced}
            <span className="text-slate-400">/{size}</span></strong>
          Picks confirmed
        </div>
      </div>

      <div className="mt-6 grid items-center gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="relative">
          <LotteryPhysicsChamber
            balls={pool}
            selectedTeams={selected}
            pullingId={activePull?.ballId}
            spinning={phase === "mixing"}
          />
          {activePull ? <div className="pointer-events-none absolute left-1/2 top-0 z-20 flex -translate-x-1/2 items-start">
            <div key={step} className="gm-lotto-eject flex h-12 w-12 items-center justify-center rounded-full border-2 border-white bg-gradient-to-br from-white via-cyan-100 to-sky-500 text-sm font-black text-slate-900 shadow-[0_6px_30px_rgba(125,211,252,.7)]">
              {lastBall}
            </div>
          </div> : null}
        </div>

        <div className="flex min-h-52 flex-col justify-center rounded-xl border border-white/20 bg-black/25 p-5" aria-live="polite" aria-atomic="true">
          {done ? <>
            <span className="text-xs font-bold uppercase tracking-widest text-emerald-300">Final order saved</span>
            <strong className="mt-3 text-2xl font-black">#1 Overall</strong>
            <div className="mt-3 flex items-center gap-3">
              <ClubMark teamId={picks[0]?.owner ?? ""} label={nameOf(picks[0]?.owner ?? "")}/>
              <span className="font-semibold">{nameOf(picks[0]?.owner ?? "")}</span>
            </div>
            <p className="mt-4 text-xs text-slate-300">The draw cannot be rerolled by replaying this screen.</p>
          </> : phase === "ready" ? <>
            <span className="text-xs font-bold uppercase tracking-widest text-amber-300">Lottery machine ready</span>
            <strong className="mt-3 text-xl">{classic ? "14-ball combinations" : "37 balls loaded in the drum"}</strong>
            <p className="mt-3 text-sm text-slate-300">
              {classic ? "Four different numbers determine a team. Repeated teams and unassigned combinations are redrawn." :
                "Every ball has exactly one team owner. Each physical ball is equally likely to be extracted, and all of a winning team's remaining balls leave the chamber."}
            </p>
            <p className="mt-2 text-xs text-slate-400">Watch the actual saved draw, including ineligible-ball redraws.</p>
          </> : phase === "mixing" ? <>
            <span className="text-xs font-bold uppercase tracking-widest text-amber-300">
              {classic ? "Combination for pick #" : "Drawing pick #"}{current?.pick}
            </span>
            <strong className="mt-5 text-2xl">Balls in motion</strong>
            <p className="mt-2 text-sm text-slate-300">Bouncing, colliding and swirling inside the air-powered chamber…</p>
            {current?.pick === 1 ? <p className="mt-2 text-xs text-sky-200">The next ball has not been revealed.</p> : null}
          </> : activePull ? <>
            <span className={"text-xs font-bold uppercase tracking-widest " +
              (activePull.accepted ? "text-emerald-300" : "text-amber-300")}>
              {activePull.collecting ? "Combination in progress" :
                activePull.accepted ? "Valid ball extracted" : "Invalid draw · retry"}
            </span>
            <strong className="mt-2 text-3xl font-black tabular-nums">Ball #{activePull.ballId}</strong>
            {activePull.collecting ? <p className="mt-2 text-sm text-slate-300">
              {completed.filter(x => x.pick === activePull.pick).length + 1} of 4 balls collected. More numbers are needed.
            </p> : activePull.accepted && originallyDrawn ? <>
              <div style={teamColorStyle(originallyDrawn.owner)} className="gm-lotto-team-in mt-3 flex items-center gap-2">
                <ClubMark teamId={originallyDrawn.owner} label={nameOf(originallyDrawn.owner)}/>
                <strong className="text-lg">{nameOf(originallyDrawn.owner)}</strong>
              </div>
              {originallyDrawn.origin !== originallyDrawn.owner ? <p className="mt-1 text-xs text-slate-300">
                via {nameOf(originallyDrawn.origin)}&apos;s pick
              </p> : null}
              {originallyDrawn.draw ? <p className="mt-2 text-xs text-slate-300">
                Starting rank #{originallyDrawn.draw.startingRank} · original first-pick odds {originallyDrawn.draw.oddsPct.toFixed(1)}%
              </p> : null}
              {originallyDrawn.owner === league.userTeamId ? <p className="mt-3 rounded-md bg-emerald-500/20 px-3 py-2 text-sm font-bold text-emerald-200">
                YOUR TEAM HAS PICK #{activePull.pick}!
              </p> : null}
              {originallyDrawn.draw && originallyDrawn.draw.startingRank > activePull.pick + 2 ?
                <p className="mt-3 text-sm font-black text-amber-200">↑ JUMPS {originallyDrawn.draw.startingRank - activePull.pick} PICKS!</p> : null}
            </> : <p className="mt-2 text-sm text-amber-200">
              {labels[activePull.reason ?? ""] ?? "Not eligible for this pick. Ball returns to the chamber."}
            </p>}
          </> : null}
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        {phase === "ready" ? <Button data-testid="lottery-start" className="bg-amber-400 font-bold text-slate-950 hover:bg-amber-300"
          onClick={() => steps.length ? setPhase("mixing") : skip()}>Start ball draw</Button> : null}
        {phase === "pulled" && !auto ? <Button data-testid="lottery-next" onClick={advance}>
          {activePull?.accepted ? "Draw next pick" : "Draw next ball"}
        </Button> : null}
        {phase !== "ready" && !done ? <Button variant="outline" className="border-white/30 bg-transparent text-white hover:text-white"
          onClick={() => setAuto(x => !x)}>{auto ? "Pause auto draw" : "Resume auto draw"}</Button> : null}
        {!done ? <Button variant="ghost" className="text-slate-200 hover:text-white"
          data-testid="lottery-skip" onClick={skip}>Skip to final order</Button> : null}
        {done ? <p role="status" className="text-sm font-semibold text-emerald-300">
          Every pick is recorded. Continue to scouting and the combine.
        </p> : null}
      </div>
    </div>

    <div className="p-4 sm:p-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h4 className="font-bold">Drawn picks</h4>
        <span className="text-xs text-muted-foreground">Only confirmed selections are visible</span>
      </div>
      {visibleRows.length ? <ol className="grid gap-2 sm:grid-cols-2" data-testid="lottery-revealed-order">
        {visibleRows.map(p => <li key={p.pick} className={"flex items-center gap-2 rounded-lg border px-3 py-2 text-sm " +
          (p.owner === league.userTeamId ? "border-primary bg-primary/10" : "border-border")}>
          <strong className="w-10 shrink-0 tabular-nums">#{p.pick}</strong>
          <ClubMark teamId={p.owner} label={nameOf(p.owner)} />
          <span className="truncate font-medium">{nameOf(p.owner)}</span>
          {p.owner !== p.origin ? <span className="ml-auto text-xs text-muted-foreground">
            via {league.teams.find(t => t.id === p.origin)?.abbr}
          </span> : null}
        </li>)}
      </ol> : <p className="text-sm text-muted-foreground">
        No picks have been pulled yet.
      </p>}
      {classic && !done ? <p className="mt-3 text-xs text-muted-foreground">
        Picks #5–14 retain their reverse-standings order and appear after the four-ball drawings conclude.
      </p> : null}
      {!classic ? <p className="mt-3 text-xs text-muted-foreground">
        Ball odds: 3/37 (8.1%), 2/37 (5.4%), or 1/37 (2.7%) before restrictions.
        Relegated clubs are guaranteed a top-12 pick. Ineligible balls are returned and redrawn.
      </p> : null}
    </div>
    <style>{`
      @keyframes gm-lotto-eject {
        0% { opacity:0; transform:translateY(116px) scale(.45) }
        55% { opacity:1; transform:translateY(-20px) scale(1.2) }
        100% { opacity:1; transform:translateY(10px) scale(1) }
      }
      .gm-lotto-eject { animation:gm-lotto-eject .9s cubic-bezier(.16,1,.3,1) both }
      @keyframes gm-lotto-team-enter { from { opacity:0; transform:translateY(12px) } to { opacity:1; transform:none } }
      .gm-lotto-team-in { animation:gm-lotto-team-enter .4s ease-out both }
      @media (prefers-reduced-motion:reduce) {
        .gm-lotto-eject,.gm-lotto-team-in { animation:none }
      }
    `}</style>
  </div>;
}
