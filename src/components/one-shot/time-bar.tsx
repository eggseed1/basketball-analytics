"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import { calendar, MONTHS } from "@/one-shot/career";
import type { LifeState, Speed } from "@/one-shot/types";

import { ageLabel, Btn, ExpandButton, Segmented } from "./ui";

export type UiPause = "user" | "decision" | "hidden" | null;

const SPEEDS: Speed[] = [1, 2, 4, 8, 16];

export function TimeBar({
  life,
  pause,
  onToggle,
  onSpeed,
  onNext,
  onAuto,
  units,
  onUnits,
  reducedMotion,
  onReducedMotion,
  onSources,
  onQuit,
  expanded,
  onExpand,
}: {
  life: LifeState;
  pause: UiPause;
  expanded: boolean;
  onExpand: () => void;
  onToggle: () => void;
  onSpeed: (s: Speed) => void;
  onNext: () => void;
  onAuto: (v: boolean) => void;
  units: "metric" | "imperial";
  onUnits: (u: "metric" | "imperial") => void;
  reducedMotion: boolean;
  onReducedMotion: (v: boolean) => void;
  onSources: () => void;
  onQuit: () => void;
}) {
  const running = pause === null;
  const barRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    if (expanded) {
      bar.style.top = "env(safe-area-inset-top, 0px)";
      return;
    }
    const header = document.querySelector<HTMLElement>("header.site-chrome");
    if (!header) return;
    const sync = () => {
      bar.style.top = `${Math.round(header.getBoundingClientRect().height)}px`;
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(header);
    return () => ro.disconnect();
  }, [expanded]);
  const { month, year } = calendar(life);
  const status = pause === "decision" ? "Paused for a decision" : pause === "hidden" ? "Paused while the tab was hidden" : pause === "user" ? "Paused" : "Running";
  return (
    <div
      ref={barRef}
      className={cn(
        "sticky top-0 z-30 -mx-3 border-b border-[var(--os-border)] bg-[var(--os-page)]/95 px-3 py-2 backdrop-blur sm:mx-0 sm:rounded-[6px] sm:border sm:bg-[var(--os-panel)] sm:px-3.5",
        expanded ? "sm:shadow-[0_10px_24px_-14px_rgb(0_0_0/0.9)]" : "sm:static",
      )}
    >
      <div className="flex items-center gap-1.5 sm:gap-3">
        <div className="min-w-0 shrink-0 font-mono tabular-nums">
          <p className="text-[15px] font-semibold leading-tight">{ageLabel(life.ageMonths)}</p>
          <p className="text-[10.5px] uppercase tracking-[0.1em] text-[var(--os-dim)]">
            {MONTHS[month - 1]} {year}
          </p>
        </div>
        <Btn
          variant={running ? "ghost" : "primary"}
          onClick={onToggle}
          disabled={pause === "decision"}
          aria-label={running ? "Pause time" : "Resume time"}
          aria-keyshortcuts="Space"
          className="w-[60px] sm:w-[84px]"
        >
          {running ? "Pause" : "Play"}
        </Btn>
        <Segmented<Speed>
          label="Speed"
          value={life.clock.speed}
          onChange={onSpeed}
          className="hidden md:inline-flex"
          options={SPEEDS.map((s) => ({ value: s, label: `${s}x` }))}
        />
        <button
          type="button"
          onClick={() => onSpeed(SPEEDS[(SPEEDS.indexOf(life.clock.speed) + 1) % SPEEDS.length]!)}
          className="min-h-9 rounded-[5px] border border-[var(--os-border)] px-2 font-mono text-[12px] tabular-nums md:hidden"
          aria-label={`Speed ${life.clock.speed}x. Tap to change.`}
        >
          {life.clock.speed}x
        </button>
        <Btn
          onClick={onNext}
          disabled={pause === "decision" || Boolean(life.ended)}
          aria-label="Next decision"
          aria-keyshortcuts="N"
          className="ml-auto whitespace-nowrap px-2.5 sm:ml-0 sm:px-3"
        >
          <span>
            Next<span className="hidden min-[400px]:inline"> decision</span>
          </span>
        </Btn>
        <label className="hidden items-center gap-2 text-[12.5px] text-[var(--os-dim)] lg:flex">
          <input
            type="checkbox"
            checked={life.clock.autoDecisions}
            onChange={(e) => onAuto(e.target.checked)}
            className="h-4 w-4 accent-[var(--os-teal)]"
          />
          Auto decisions
        </label>
        <span className="sr-only" role="status" aria-live="polite">
          {status}
        </span>
        <span className="ml-auto hidden font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--os-dim)] xl:block">{status}</span>
        <UtilityMenu
          life={life}
          onAuto={onAuto}
          units={units}
          onUnits={onUnits}
          reducedMotion={reducedMotion}
          onReducedMotion={onReducedMotion}
          onSources={onSources}
          onQuit={onQuit}
        />
        <ExpandButton expanded={expanded} onClick={onExpand} />
      </div>
    </div>
  );
}

function UtilityMenu({
  life,
  onAuto,
  units,
  onUnits,
  reducedMotion,
  onReducedMotion,
  onSources,
  onQuit,
}: {
  life: LifeState;
  onAuto: (v: boolean) => void;
  units: "metric" | "imperial";
  onUnits: (u: "metric" | "imperial") => void;
  reducedMotion: boolean;
  onReducedMotion: (v: boolean) => void;
  onSources: () => void;
  onQuit: () => void;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  const item = "flex w-full items-center justify-between gap-3 rounded-[4px] px-2.5 py-2 text-left text-[13px] hover:bg-[var(--os-panel2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--os-teal)]";
  return (
    <div ref={wrap} className="relative">
      <Btn ref={button} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)} aria-label="More options" className="px-2.5">
        <span aria-hidden className="text-[16px] leading-none">⋯</span>
      </Btn>
      {open ? (
        <div role="menu" className="absolute right-0 top-full z-40 mt-1.5 w-64 rounded-[6px] border border-[var(--os-border)] bg-[var(--os-panel)] p-1.5 shadow-[0_12px_30px_-12px_rgb(0_0_0/0.7)]">
          <button role="menuitemcheckbox" aria-checked={life.clock.autoDecisions} className={item} onClick={() => onAuto(!life.clock.autoDecisions)}>
            Auto decisions <span className="font-mono text-[11px] text-[var(--os-dim)]">{life.clock.autoDecisions ? "On" : "Off"}</span>
          </button>
          <button role="menuitem" className={item} onClick={() => onUnits(units === "metric" ? "imperial" : "metric")}>
            Units <span className="font-mono text-[11px] text-[var(--os-dim)]">{units === "metric" ? "Metric" : "Imperial"}</span>
          </button>
          <button role="menuitemcheckbox" aria-checked={reducedMotion} className={item} onClick={() => onReducedMotion(!reducedMotion)}>
            Reduced motion <span className="font-mono text-[11px] text-[var(--os-dim)]">{reducedMotion ? "On" : "Off"}</span>
          </button>
          <div className={`${item} cursor-default text-[var(--os-dim)] hover:bg-transparent`} role="menuitem" aria-disabled="true">
            Sound <span className="font-mono text-[11px]">Off</span>
          </div>
          <button
            role="menuitem"
            className={item}
            onClick={() => {
              setOpen(false);
              onSources();
            }}
          >
            Sources, coverage and auto rules
          </button>
          <button
            role="menuitem"
            className={item}
            onClick={() => {
              setOpen(false);
              onQuit();
            }}
          >
            Save and exit
          </button>
        </div>
      ) : null}
    </div>
  );
}
