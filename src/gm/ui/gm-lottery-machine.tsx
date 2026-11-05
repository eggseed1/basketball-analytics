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
  physicsSeed?: number;
  physicsVersion?: 1 | 2;
  exitFrame?: number;
};

const labels: Record<string, string> = {
  "consecutive-number-one": "Ineligible: back-to-back #1 picks",
  "third-top-five": "Ineligible: three consecutive top-five picks",
  "relegation-floor": "Returned: relegated teams must pick by #12",
};

/**
 * The animation never rerolls or shuffles the saved result. For 2027–29 the
 * engine has already resolved which numbered ball physically left the
 * circular opening; this ceremony replays that exact seeded collision event.
 * Draws are shown in actual extraction order (#1 -> #16), not via envelopes.
 */
export function GmLotteryMachine({
  league, onFinish,
}: { league: GmLeagueState; onFinish: () => void }) {
  const classic = league.lotteryFormat === "classic" || league.season <= 2026;
  const size = Math.min(league.lotteryCount ?? (classic ? 14 : 16), league.teams.length);
  const physical = !classic && league.lotteryBallPool?.length === 37 &&
    league.lotteryDraws?.slice(0, size).every(d => (d.attempts?.length ?? 0) > 0);
  const modernHole = Boolean(!classic && physical &&
    league.lotteryDraws?.slice(0, size).every(draw =>
      draw.attempts?.every(attempt =>
        Number.isInteger(attempt.physicsSeed) && (attempt.exitFrame ?? 0) > 0)));
  const picks = useMemo(() => Array.from({ length: size }, (_, i) => ({
    pick: i + 1,
    owner: league.draftOrder?.[i] ?? league.lotteryOrder?.[i] ?? "",
    origin: league.draftSlotOrigins?.[i] ?? league.lotteryOrder?.[i] ?? "",
    draw: league.lotteryDraws?.[i],
  })), [league.draftOrder, league.lotteryOrder, league.draftSlotOrigins, league.lotteryDraws, size]);

  const steps = useMemo<DrawStep[]>(() => (league.lotteryDraws ?? []).slice(0, classic ? 4 : size).flatMap((draw, i): DrawStep[] => {
    if (classic) {
      // Four balls without replacement form a combination in the old system.
      return draw.balls.map((ballId, index) => ({
        pick: i + 1, ballId, origin: draw.teamId, accepted: index === draw.balls.length - 1,
        collecting: index < draw.balls.length - 1,
      }));
    }
    const attempts: Array<{ballId:number; teamId:string; accepted:boolean; reason?:string;
      physicsSeed?:number; physicsVersion?:1|2; exitFrame?:number}> = draw.attempts?.length
      ? draw.attempts
      : [{ ballId: draw.balls[0] ?? 1, teamId: draw.teamId, accepted: true }];
    return attempts.map(pull => ({
      pick: i + 1, ballId: pull.ballId, origin: pull.teamId,
      accepted: pull.accepted, reason: pull.reason,
      physicsSeed: pull.physicsSeed, physicsVersion: pull.physicsVersion ?? 1, exitFrame: pull.exitFrame,
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
  // Manual, cinematic reveals by default; user can opt into autoplay or 2x.
  const [auto, setAuto] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<"cinematic" | "quick">("cinematic");
  const [replayError, setReplayError] = useState<string | null>(null);
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
    if (phase !== "mixing" || modernHole) return;
    // Historic 14-ball and archived 37-ball draws have no actual chamber
    // history to replay, so retain the existing illustrative reveal pacing.
    const timer = window.setTimeout(() => setPhase("pulled"),
      step === 0 || (current?.pick ?? 0) <= 5 ? 1750 : 1150);
    return () => window.clearTimeout(timer);
  }, [phase, step, current?.pick, modernHole]);

  useEffect(() => {
    if (phase !== "pulled" || !auto) return;
    const timer = window.setTimeout(advance,
      current?.accepted ? (current.pick <= 5 ? 4800 : 3200) :
        current?.collecting ? 2300 : 3000);
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
    phase === "ready" ? (classic ? "14 balls. Four-number combinations." : "37 balls. 16 picks. One real draw.") :
    phase === "mixing" ? "Drawing the next ball…" :
    current?.accepted ? "Pick #" + current.pick + " has been drawn!" :
    current?.collecting ? "Ball " + current.ballId + " extracted." :
    "Ball returned. Drawing again.";
  const announced = shown.filter(x => x.accepted).length;
  const originallyDrawn = activePull ? picks[activePull.pick - 1] : undefined;
  const lastBall = activePull?.ballId;
  const legacy = !classic && !modernHole;

  return <section data-testid="gm-lottery-ceremony" className="gm-lottery-ceremony overflow-hidden rounded-2xl border border-border bg-card text-foreground">
    <div className="px-4 py-5 sm:px-6 sm:py-6">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
        <div>
          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[.13em] text-muted-foreground"><span className="inline-block h-2 w-2 rounded-full bg-[var(--team-primary)]" aria-hidden="true" />
            Draft lottery · {league.season}
          </p>
          <h3 className="mt-2 text-[23px] font-semibold tracking-tight sm:text-[28px]">{headline}</h3>
          <p className="mt-1.5 text-[13px] text-muted-foreground">
            {classic ? "Historical 14 numbered balls · four-ball combinations for picks 1–4" :
              "37 balls · gravity and collisions · the bottom exit decides each pick"}
          </p>
          {!classic && league.season >= 2030 ? <p className="mt-2 text-xs text-[var(--accent-warning)]">
            Franchise Lab continues 2027–29 rules for 2030+ until the NBA approves a replacement.
          </p> : null}
          {legacy ? <p className="mt-2 text-xs text-[var(--accent-warning)]">
            Archived save: this draw was decided before hole-physics replay existed. The chamber is illustrative; your fixed order is preserved.
          </p> : null}
        </div>
        <div className="min-w-28 rounded-xl border border-border bg-secondary/35 px-4 py-3 text-right text-xs text-muted-foreground">
          <strong className="block text-2xl font-semibold tabular-nums tracking-tight text-foreground">{done ? size : announced}<span className="text-muted-foreground">/{size}</span></strong>
          Picks confirmed
        </div>
      </div>

      <div className="mt-5 grid min-w-0 items-stretch gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]" data-testid="gm-lottery-draw-stage">
        <div className="relative flex min-w-0 flex-col justify-center rounded-xl border border-border bg-secondary/30 px-3 py-4 sm:px-5 sm:py-5">
          <LotteryPhysicsChamber
            balls={pool}
            selectedTeams={selected}
            removedBallIds={classic ? completed.filter(x => x.pick === current?.pick).map(x => x.ballId) : []}
            pullingId={activePull?.ballId}
            spinning={phase === "mixing"}
            sceneSeed={modernHole ? current?.physicsSeed : undefined}
            physicsVersion={current?.physicsVersion ?? 1}
            playbackSpeed={playbackSpeed}
            onExit={ballId => {
              if (phase !== "mixing" || !modernHole) return;
              if (ballId === current?.ballId) setPhase("pulled");
              else {
                setAuto(false);
                setReplayError("The physical extraction does not match the saved ball. The draw has stopped to protect your saved order.");
              }
            }}
          />
          {activePull ? <div className="pointer-events-none absolute bottom-9 left-1/2 z-20 flex -translate-x-1/2 items-start">
            <div key={step} style={teamColorStyle(activePull.origin)} className="gm-lotto-eject flex h-14 w-14 items-center justify-center rounded-full border-2 border-[var(--team-primary)] bg-card text-lg font-bold tabular-nums text-foreground shadow-sm">
              {lastBall}
            </div>
          </div> : null}
        </div>

        <div className="flex min-h-52 min-w-0 flex-col justify-center rounded-xl border border-border bg-background p-4 sm:p-6" aria-live="polite" aria-atomic="true" data-testid="gm-lottery-result-panel">
          {done ? <>
            <span className="text-[11px] font-semibold uppercase tracking-[.12em] text-muted-foreground">Final order saved</span>
            <strong className="mt-3 text-2xl font-semibold tracking-tight">#1 overall</strong>
            <div className="mt-3 flex items-center gap-3">
              <ClubMark teamId={picks[0]?.owner ?? ""} label={nameOf(picks[0]?.owner ?? "")}/>
              <span className="font-semibold">{nameOf(picks[0]?.owner ?? "")}</span>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">Replaying does not change the saved draft order.</p>
          </> : phase === "ready" ? <>
            <span className="text-[11px] font-semibold uppercase tracking-[.12em] text-muted-foreground">Lottery machine ready</span>
            <strong className="mt-3 text-xl font-semibold tracking-tight">{classic ? "14-ball combinations" : "37 numbered balls"}</strong>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {classic ? "Four different numbers determine a team. Repeated teams and unassigned combinations are redrawn." :
                "Identical balls collide inside the circle. After mixing, one ball-sized opening releases the winner. A fresh random arrangement protects every physical ball's equal chance."}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              {modernHole ? "The visible escape determines the saved pick. Invalid pulls are returned and redrawn." :
                "This historical result remains unchanged by the animation."}
            </p>
          </> : phase === "mixing" ? <>
            <span className="text-[11px] font-semibold uppercase tracking-[.12em] text-muted-foreground">
              {classic ? "Combination for pick #" : "Drawing pick #"}{current?.pick}
            </span>
            <strong className="mt-3 text-2xl font-semibold tracking-tight">Balls in motion</strong>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {modernHole ? "Watch the balls tumble under gravity. The first ball through the bottom opening gets the pick." :
                "Bouncing, colliding and swirling inside the air-powered chamber…"}
            </p>
            {current?.pick === 1 ? <p className="mt-2 text-xs text-muted-foreground">The next ball has not been revealed.</p> : null}
            <p className="mt-3 text-xs text-muted-foreground">The ball physically exits before the pick is revealed.</p>
          </> : activePull ? <>
            <span className={"text-[11px] font-semibold uppercase tracking-[.12em] " +
              (activePull.accepted ? "text-muted-foreground" : "text-[var(--accent-warning)]")}>
              {activePull.collecting ? "Combination in progress" :
                activePull.accepted ? "Valid ball extracted" : "Invalid draw · retry"}
            </span>
            <strong className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">Ball #{activePull.ballId}</strong>
            {activePull.collecting ? <p className="mt-2 text-sm text-muted-foreground">
              {completed.filter(x => x.pick === activePull.pick).length + 1} of 4 balls collected. More numbers are needed.
            </p> : activePull.accepted && originallyDrawn ? <>
              <div style={teamColorStyle(originallyDrawn.owner)} className="gm-lotto-team-in mt-3 flex items-center gap-2 border-l-[3px] border-l-[var(--team-primary)] pl-3">
                <ClubMark teamId={originallyDrawn.owner} label={nameOf(originallyDrawn.owner)}/>
                <strong className="text-lg">{nameOf(originallyDrawn.owner)}</strong>
              </div>
              {originallyDrawn.origin !== originallyDrawn.owner ? <p className="mt-1 text-xs text-muted-foreground">
                via {nameOf(originallyDrawn.origin)}&apos;s pick
              </p> : null}
              {originallyDrawn.draw ? <p className="mt-2 text-xs text-muted-foreground">
                Starting rank #{originallyDrawn.draw.startingRank} · original first-pick odds {originallyDrawn.draw.oddsPct.toFixed(1)}%
              </p> : null}
              {originallyDrawn.owner === league.userTeamId ? <p className="mt-3 rounded-lg border border-border bg-secondary/60 px-3 py-2 text-sm font-semibold text-foreground">
                YOUR TEAM HAS PICK #{activePull.pick}!
              </p> : null}
              {originallyDrawn.draw && originallyDrawn.draw.startingRank > activePull.pick + 2 ?
                <p className="mt-3 text-sm font-semibold text-foreground">↑ JUMPS {originallyDrawn.draw.startingRank - activePull.pick} PICKS!</p> : null}
            </> : <p className="mt-2 text-sm text-[var(--accent-warning)]">
              {labels[activePull.reason ?? ""] ?? "Not eligible for this pick. Ball returns to the chamber."}
            </p>}
          </> : null}
        </div>
      </div>

      {replayError ? <p role="alert" className="mt-4 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm font-medium text-destructive">{replayError}</p> : null}
      <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-border pt-4">
        {phase === "ready" ? <Button data-testid="lottery-start" className="font-semibold"
          onClick={() => steps.length ? setPhase("mixing") : skip()}>Start ball draw</Button> : null}
        {phase === "pulled" && !auto ? <Button data-testid="lottery-next" onClick={advance}>
          {activePull?.accepted ? "Draw next pick" : "Draw next ball"}
        </Button> : null}
        {phase !== "ready" && !done && !replayError ? <Button variant="outline"
          onClick={() => setAuto(x => !x)}>{auto ? "Pause after this ball" : "Auto-play remaining picks"}</Button> : null}
        {phase !== "ready" && !done && modernHole ?
          <Button variant="outline"
            data-testid="lottery-playback-speed"
            onClick={() => setPlaybackSpeed(x => x === "cinematic" ? "quick" : "cinematic")}>
            Playback: {playbackSpeed === "cinematic" ? "Cinematic 1×" : "Quick 2×"}
          </Button> : null}
        {!done ? <Button variant="ghost"
          data-testid="lottery-skip" onClick={skip}>Skip to final order</Button> : null}
        {done ? <p role="status" className="text-sm font-medium text-muted-foreground">
          Every pick is recorded. Continue to scouting and the combine.
        </p> : null}
      </div>
    </div>

    <div className="border-t border-border bg-card p-4 sm:p-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h4 className="text-base font-semibold tracking-tight">Drawn picks</h4>
        <span className="text-xs text-muted-foreground">Only confirmed selections are visible</span>
      </div>
      {visibleRows.length ? <ol className="grid gap-2 sm:grid-cols-2" data-testid="lottery-revealed-order">
        {visibleRows.map(p => <li key={p.pick} style={p.owner === league.userTeamId ? teamColorStyle(p.owner) : undefined} className={"flex min-w-0 items-center gap-2 rounded-lg border px-3 py-2.5 text-sm " +
          (p.owner === league.userTeamId ? "border-border border-l-[3px] border-l-[var(--team-primary)] bg-secondary/30" : "border-border bg-background")}>
          <strong className="w-10 shrink-0 font-semibold tabular-nums">#{p.pick}</strong>
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
        A fair shuffle gives every numbered ball an equal physical starting chance.
        Relegated clubs are guaranteed a top-12 pick; ineligible balls are returned and redrawn.
      </p> : null}
      {!classic && pool.length === 37 ? <details className="mt-4 rounded-xl border border-border p-3" data-testid="lottery-ball-allotments">
        <summary className="cursor-pointer text-sm font-semibold">Verify all 37 ball assignments and opening odds</summary>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {[...new Set(pool.map(ball => ball.teamId))].map(teamId => {
            const owned = pool.filter(ball => ball.teamId === teamId);
            return <div key={teamId} className="flex items-center justify-between gap-2 rounded-lg bg-muted/50 px-3 py-2 text-xs">
              <span className="min-w-0 truncate">{nameOf(teamId)}</span>
              <strong className="shrink-0 tabular-nums">{owned.length} {owned.length === 1 ? "ball" : "balls"} · {(owned.length/37*100).toFixed(1)}%</strong>
            </div>;
          })}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Each numbered ball is sampled uniformly. Restrictions alter eligible teams as picks are drawn;
          percentages above are opening odds, not guarantees at every slot.
        </p>
      </details> : null}
    </div>
    <style>{`
      @keyframes gm-lotto-eject {
        0% { opacity:0; transform:translateY(-10px) scale(.82) }
        55% { opacity:1; transform:translateY(18px) scale(1.17) }
        100% { opacity:1; transform:translateY(27px) scale(1) }
      }
      .gm-lotto-eject { animation:gm-lotto-eject 1.35s cubic-bezier(.16,1,.3,1) both }
      @keyframes gm-lotto-team-enter { from { opacity:0; transform:translateY(12px) } to { opacity:1; transform:none } }
      .gm-lotto-team-in { animation:gm-lotto-team-enter .4s ease-out both }
      @media (prefers-reduced-motion:reduce) {
        .gm-lotto-eject,.gm-lotto-team-in { animation:none }
      }
    `}</style>
  </section>;
}
