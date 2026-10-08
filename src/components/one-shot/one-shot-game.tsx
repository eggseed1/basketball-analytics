"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import { cn } from "@/lib/utils";
import { tick, TICK_MS } from "@/one-shot/clock";
import { advance, advanceToDecision, createLife, rename, resolveDecision, setPlan } from "@/one-shot/engine";
import {
  addCareer,
  clearSave,
  dailyDate,
  dailySeed,
  loadCareers,
  loadPrefs,
  loadSave,
  randomSeed,
  savePrefs,
  writeSave,
  type Prefs,
} from "@/one-shot/persistence";
import { summarize, type CareerSummary } from "@/one-shot/report";
import type { DrawMode, FocusId, LifeState, Speed, Workload } from "@/one-shot/types";

import { BirthReveal } from "./birth-reveal";
import { EndReport } from "./end-report";
import { DecisionPanel, DecisionWaiting, FocusPanel, LifeRecord, LifeScene } from "./panels-center";
import { FamilyAndResources, IdentityCard, PhysiquePanel, StatusPanel } from "./panels-left";
import { CareerMap, ScoutingReportPanel, SameGeneration, YourRoute } from "./panels-right";
import { SourcesDrawer } from "./sources-drawer";
import { StartScreen, type StartOptions } from "./start-screen";
import { TimeBar, type UiPause } from "./time-bar";
import { ageLabel, ExpandButton, OS_VARS } from "./ui";

const subscribeNoop = () => () => {};

export function OneShotGame() {
  const mounted = useSyncExternalStore(subscribeNoop, () => true, () => false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const header = document.querySelector<HTMLElement>("header.site-chrome");
    const wrap = wrapRef.current;
    if (!header || !wrap) return;
    const sync = () => wrap.style.setProperty("--os-chrome", `${Math.round(header.getBoundingClientRect().height)}px`);
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(header);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!expanded) return;
    const html = document.documentElement;
    const prevOverflow = html.style.overflow;
    html.style.overflow = "hidden";
    const onFullscreen = () => {
      if (!document.fullscreenElement) setExpanded(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || document.fullscreenElement) return;
      if (wrapRef.current?.querySelector('[role="dialog"], [role="menu"]')) return;
      setExpanded(false);
    };
    document.addEventListener("fullscreenchange", onFullscreen);
    document.addEventListener("keydown", onKey);
    return () => {
      html.style.overflow = prevOverflow;
      document.removeEventListener("fullscreenchange", onFullscreen);
      document.removeEventListener("keydown", onKey);
    };
  }, [expanded]);

  const toggleExpanded = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => setExpanded(false));
      return;
    }
    if (expanded) {
      setExpanded(false);
      return;
    }
    setExpanded(true);
    const el = wrapRef.current;
    if (el && document.fullscreenEnabled) el.requestFullscreen({ navigationUI: "hide" }).catch(() => {});
  }, [expanded]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key !== "f" && e.key !== "F") || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (wrapRef.current?.querySelector('[role="dialog"]')) return;
      e.preventDefault();
      toggleExpanded();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [toggleExpanded]);

  return (
    <div
      ref={wrapRef}
      style={OS_VARS}
      className={
        expanded
          ? "fixed inset-0 z-[80] overflow-y-auto overscroll-contain bg-[var(--os-page)] [color-scheme:dark]"
          : "mx-auto w-full max-w-[1700px] sm:px-5"
      }
    >
      <div
        data-os-frame
        className={cn(
          "flex flex-col bg-[var(--os-page)] text-[var(--os-text)] [color-scheme:dark]",
          expanded
            ? "mx-auto min-h-full w-full max-w-[1700px] pb-[max(0.75rem,env(safe-area-inset-bottom))] pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-5 sm:pb-5 sm:pt-4 md:has-[[data-os-play]]:h-full"
            : "min-h-[calc(100dvh-var(--os-chrome,0px)-1.5rem)] scroll-mt-[calc(var(--os-chrome,0px)+0.75rem)] p-3 sm:rounded-[8px] sm:p-5 md:has-[[data-os-play]]:h-[calc(100dvh-var(--os-chrome,0px)-1.5rem)] md:has-[[data-os-play]]:min-h-[540px]",
        )}
      >
        {mounted ? <Game expanded={expanded} onExpand={toggleExpanded} /> : <p className="p-6 font-mono text-[12px] text-[var(--os-dim)]">Loading ONE SHOT…</p>}
      </div>
    </div>
  );
}

function subscribeReducedMotion(cb: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

type Screen = "start" | "birth" | "play" | "report";

interface Boot {
  saved: LifeState | null;
  recovery: { reason: string; raw: string | null } | null;
  careers: CareerSummary[];
  prefs: Prefs;
  opts: StartOptions;
  replaySeed: number | null;
}

function boot(): Boot {
  const params = new URLSearchParams(window.location.search);
  const save = loadSave();
  const seedParam = params.get("seed");
  const seed = seedParam && /^\d{1,10}$/.test(seedParam) && Number(seedParam) <= 0xffffffff ? Number(seedParam) : null;
  const drawParam = params.get("draw");
  return {
    saved: save.ok && !save.state.ended ? save.state : null,
    recovery: !save.ok && save.reason !== "empty" ? { reason: save.reason, raw: save.raw } : null,
    careers: loadCareers(),
    prefs: loadPrefs(),
    opts: {
      mode: params.get("daily") === "1" ? "daily" : "random",
      draw: (drawParam === "equal" ? "equal" : "weighted") as DrawMode,
      pacing: "standard",
    },
    replaySeed: seed,
  };
}

function Game({ expanded, onExpand }: { expanded: boolean; onExpand: () => void }) {
  const [init] = useState(boot);
  const [screen, setScreen] = useState<Screen>("start");
  const [opts, setOpts] = useState<StartOptions>(init.opts);
  const [replaySeed, setReplaySeed] = useState<number | null>(init.replaySeed);
  const [saved, setSaved] = useState<LifeState | null>(init.saved);
  const [recovery, setRecovery] = useState(init.recovery);
  const [careers, setCareers] = useState<CareerSummary[]>(init.careers);
  const [prefs, setPrefsState] = useState<Prefs>(init.prefs);
  const [life, setLife] = useState<LifeState | null>(null);
  const lifeRef = useRef<LifeState | null>(null);
  const [pause, setPause] = useState<Exclude<UiPause, "decision">>("user");
  const [hiddenDecision, setHiddenDecision] = useState<string | null>(null);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const decisionHeading = useRef<HTMLHeadingElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const systemReduced = useSyncExternalStore(subscribeReducedMotion, () => window.matchMedia("(prefers-reduced-motion: reduce)").matches, () => false);
  const reducedMotion = prefs.reducedMotion ?? systemReduced;
  const units = prefs.units;
  const today = dailyDate();

  const setPrefs = useCallback((p: Prefs) => {
    setPrefsState(p);
    savePrefs(p);
  }, []);

  const commit = useCallback((next: LifeState) => {
    const prev = lifeRef.current;
    lifeRef.current = next;
    setLife(next);
    if (next.ended && !prev?.ended) {
      setCareers(addCareer(summarize(next, new Date().toISOString())));
      clearSave();
      setSaved(null);
      setScreen("report");
    }
  }, []);

  const pendingId = life?.pendingDecision?.id ?? null;
  const auto = life?.clock.autoDecisions ?? false;
  const decisionPause = Boolean(pendingId) && !auto;
  const effectivePause: UiPause = decisionPause ? "decision" : pause;
  const running = screen === "play" && Boolean(life) && !life?.ended && effectivePause === null;
  const speed = life?.clock.speed ?? 1;
  const pacing = life?.pacing ?? "standard";

  useEffect(() => {
    if (!running) return;
    let acc = 0;
    const id = window.setInterval(() => {
      const cur = lifeRef.current;
      if (!cur) return;
      const t = tick(acc, pacing, speed);
      acc = t.acc;
      if (t.months < 1) return;
      commit(advance(cur, t.months, { auto: cur.clock.autoDecisions }));
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [running, speed, pacing, commit]);

  useEffect(() => {
    if (!pendingId || auto) return;
    const raf = requestAnimationFrame(() => {
      const h = decisionHeading.current;
      if (!h) return;
      h.focus({ preventScroll: true });
      const section = h.closest("section");
      if (!section) return;
      const behavior = reducedMotion ? "auto" : "smooth";
      const col = section.closest<HTMLElement>("[data-os-col]");
      if (col && getComputedStyle(col).overflowY === "auto") {
        const c = col.getBoundingClientRect();
        const r = section.getBoundingClientRect();
        if (r.top < c.top || r.bottom > c.bottom) section.scrollIntoView({ block: "nearest", behavior });
        return;
      }
      const r = h.getBoundingClientRect();
      if (r.top < 120 || r.bottom > window.innerHeight - 40) section.scrollIntoView({ block: "center", behavior });
    });
    return () => cancelAnimationFrame(raf);
  }, [pendingId, auto, reducedMotion]);

  useEffect(() => {
    if (screen !== "play" || !life || life.ended) return;
    const t = window.setTimeout(() => writeSave(life), 800);
    return () => window.clearTimeout(t);
  }, [life, screen]);

  useEffect(() => {
    if (screen !== "play") return;
    const onVis = () => {
      if (document.visibilityState === "hidden") {
        setPause((p) => (p === null ? "hidden" : p));
        if (lifeRef.current && !lifeRef.current.ended) writeSave(lifeRef.current);
      } else {
        setPause((p) => (p === "hidden" ? null : p));
      }
    };
    const onHide = () => {
      if (lifeRef.current && !lifeRef.current.ended) writeSave(lifeRef.current);
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", onHide);
    };
  }, [screen]);

  const firstScreen = useRef(true);
  useEffect(() => {
    if (firstScreen.current) {
      firstScreen.current = false;
      return;
    }
    rootRef.current?.closest("[data-os-frame]")?.scrollIntoView({ block: "start" });
  }, [screen]);

  const toggle = useCallback(() => setPause((p) => (p === null ? "user" : null)), []);
  const openSources = useCallback(() => setSourcesOpen(true), []);
  const closeSources = useCallback(() => setSourcesOpen(false), []);

  const nextDecision = useCallback(() => {
    let s = lifeRef.current;
    if (!s || s.ended || s.pendingDecision) return;
    for (let i = 0; i < 5 && s && !s.pendingDecision && !s.ended; i++) s = advanceToDecision(s, 120);
    commit(s!);
    setPause(null);
  }, [commit]);

  const choose = useCallback(
    (id: string) => {
      const s = lifeRef.current;
      if (!s?.pendingDecision) return;
      const c = s.pendingDecision.choices.find((x) => x.id === id);
      if (!c || c.disabled) return;
      commit(resolveDecision(s, id));
      requestAnimationFrame(() => rootRef.current?.querySelector<HTMLElement>("#os-scene")?.scrollIntoView({ block: "nearest" }));
    },
    [commit],
  );

  const plan = useCallback(
    (p: { primary?: FocusId; secondary?: FocusId | null; workload?: Workload }) => {
      const s = lifeRef.current;
      if (s) commit(setPlan(s, p));
    },
    [commit],
  );

  const setClock = useCallback(
    (patch: Partial<LifeState["clock"]>) => {
      const s = lifeRef.current;
      if (s) commit({ ...s, clock: { ...s.clock, ...patch } });
    },
    [commit],
  );

  useEffect(() => {
    if (screen !== "play" || sourcesOpen) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const s = lifeRef.current;
      if (!s) return;
      if (e.key === " " && !(t && (t.tagName === "BUTTON" || t.getAttribute("role") === "radio"))) {
        if (s.pendingDecision && !s.clock.autoDecisions) return;
        e.preventDefault();
        toggle();
      } else if (e.key === "n" || e.key === "N") {
        nextDecision();
      } else if (/^[1-9]$/.test(e.key) && s.pendingDecision && hiddenDecision !== s.pendingDecision.id) {
        const c = s.pendingDecision.choices[Number(e.key) - 1];
        if (c) choose(c.id);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [screen, sourcesOpen, toggle, nextDecision, choose, hiddenDecision]);

  const beBorn = useCallback(
    (o: StartOptions = opts) => {
      const daily = o.mode === "daily";
      const seed = daily ? dailySeed(today) : (replaySeed ?? randomSeed());
      const born = createLife({
        seed,
        mode: o.mode,
        draw: daily ? "weighted" : o.draw,
        pacing: daily ? "standard" : o.pacing,
        dailyDate: daily ? today : null,
        runId: `r${seed.toString(36)}-${Date.now().toString(36)}`,
      });
      lifeRef.current = born;
      setLife(born);
      setReplaySeed(null);
      setScreen("birth");
    },
    [opts, replaySeed, today],
  );

  const startLife = useCallback(() => {
    const s = lifeRef.current;
    if (!s) return;
    writeSave(s);
    setSaved(null);
    setPause(null);
    setScreen("play");
  }, []);

  const continueLife = useCallback(() => {
    if (!saved) return;
    lifeRef.current = saved;
    setLife(saved);
    setPause("user");
    setScreen("play");
  }, [saved]);

  const quit = useCallback(() => {
    const s = lifeRef.current;
    if (s && !s.ended) {
      writeSave(s);
      setSaved(s);
    }
    setPause("user");
    setScreen("start");
  }, []);

  const downloadBad = useCallback(() => {
    if (!recovery?.raw) return;
    const url = URL.createObjectURL(new Blob([recovery.raw], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "one-shot-save.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [recovery]);

  return (
    <div ref={rootRef} className="flex min-h-0 flex-1 flex-col">
      {screen !== "play" ? (
        <div className="mb-3 flex items-center gap-3 sm:mb-4">
          {expanded ? <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--os-dim)]">ONE SHOT</p> : null}
          <ExpandButton expanded={expanded} onClick={onExpand} showLabel className="ml-auto" />
        </div>
      ) : null}

      {screen === "start" ? (
        <div className="my-auto">
          <StartScreen
            opts={opts}
            onOpts={setOpts}
            onBorn={() => beBorn()}
            canContinue={Boolean(saved)}
            continueLabel={saved ? `${saved.identity.displayName}, ${ageLabel(saved.ageMonths)}` : null}
            onContinue={continueLife}
            careers={careers}
            replaySeed={replaySeed}
            onClearReplay={() => setReplaySeed(null)}
            recovery={recovery?.reason ?? null}
            onDownloadBad={downloadBad}
            onDiscardBad={() => {
              clearSave();
              setRecovery(null);
            }}
            daily={today}
            onSources={openSources}
          />
        </div>
      ) : null}

      {screen === "birth" && life ? (
        <div className="my-auto">
          <BirthReveal
            life={life}
            units={units}
            onRename={(g, f) => commit(rename(life, g, f))}
            onStart={startLife}
            onBack={() => setScreen("start")}
          />
        </div>
      ) : null}

      {screen === "report" && life ? <EndReport life={life} units={units} onNew={() => beBorn()} onHome={() => setScreen("start")} /> : null}

      {screen === "play" && life ? (
        <div data-os-play className="flex flex-col gap-3 sm:gap-4 md:min-h-0 md:flex-1">
          <TimeBar
            life={life}
            pause={effectivePause}
            onToggle={toggle}
            onSpeed={(s: Speed) => setClock({ speed: s })}
            onNext={nextDecision}
            onAuto={(v) => setClock({ autoDecisions: v })}
            units={units}
            onUnits={(u) => setPrefs({ ...prefs, units: u })}
            reducedMotion={reducedMotion}
            onReducedMotion={(v) => setPrefs({ ...prefs, reducedMotion: v })}
            onSources={openSources}
            onQuit={quit}
            expanded={expanded}
            onExpand={onExpand}
          />
          <div className="flex flex-col gap-3 sm:gap-4 md:grid md:min-h-0 md:flex-1 md:grid-cols-2 md:grid-rows-1 xl:grid-cols-[26fr_47fr_27fr] xl:gap-5 2xl:gap-6">
            <div data-os-col className="contents md:col-start-1 md:row-start-1 md:flex md:min-h-0 md:flex-col md:gap-4 md:overflow-y-auto md:overscroll-contain md:[scrollbar-color:var(--os-border)_transparent] md:[scrollbar-width:thin] xl:col-start-2 xl:gap-5">
              <div className="order-2 md:order-none">
                <LifeScene life={life} animate={running && !reducedMotion} />
              </div>
              {life.pendingDecision && !auto ? (
                <div className="order-3 md:order-none">
                  {hiddenDecision === life.pendingDecision.id ? (
                    <DecisionWaiting life={life} onOpen={() => setHiddenDecision(null)} />
                  ) : (
                    <DecisionPanel life={life} onChoose={choose} onMinimize={() => setHiddenDecision(life.pendingDecision!.id)} headingRef={decisionHeading} />
                  )}
                </div>
              ) : null}
              <div className="order-4 md:order-none">
                <FocusPanel life={life} onPlan={plan} />
              </div>
              <div className="order-6 md:order-none">
                <LifeRecord life={life} />
              </div>
            </div>
            <div className="contents md:col-start-2 md:row-start-1 md:flex md:min-h-0 md:flex-col md:gap-4 md:overflow-y-auto md:overscroll-contain md:[scrollbar-color:var(--os-border)_transparent] md:[scrollbar-width:thin] xl:contents">
              <div className="contents md:flex md:flex-col md:gap-4 xl:col-start-1 xl:row-start-1 xl:min-h-0 xl:gap-5 xl:overflow-y-auto xl:overscroll-contain xl:[scrollbar-color:var(--os-border)_transparent] xl:[scrollbar-width:thin]">
                <div className="order-1 md:order-none">
                  <IdentityCard life={life} />
                </div>
                <div className="order-5 md:order-none">
                  <StatusPanel life={life} />
                </div>
                <div className="order-10 md:order-none">
                  <PhysiquePanel life={life} units={units} onUnits={(u) => setPrefs({ ...prefs, units: u })} />
                </div>
                <div className="order-11 md:order-none">
                  <FamilyAndResources life={life} units={units} />
                </div>
              </div>
              <div className="contents md:flex md:flex-col md:gap-4 xl:col-start-3 xl:row-start-1 xl:min-h-0 xl:gap-5 xl:overflow-y-auto xl:overscroll-contain xl:[scrollbar-color:var(--os-border)_transparent] xl:[scrollbar-width:thin]">
                <div className="order-8 md:order-none">
                  <SameGeneration life={life} units={units} />
                </div>
                <div className="order-9 md:order-none">
                  <CareerMap life={life} />
                </div>
                <div className="order-7 md:order-none">
                  <YourRoute life={life} onSources={openSources} />
                </div>
                <div className="order-12 md:order-none">
                  <ScoutingReportPanel life={life} />
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {sourcesOpen ? <SourcesDrawer life={screen === "start" ? null : life} onClose={closeSources} /> : null}
    </div>
  );
}
