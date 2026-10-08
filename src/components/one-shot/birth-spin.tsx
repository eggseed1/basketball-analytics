"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import type { DrawMode, LifeState } from "@/one-shot/types";
import { country, countryFlag, PLAYABLE_COUNTRIES } from "@/one-shot/world";

import { Btn, OS } from "./ui";

const CARD = 96;
const STEP = 104;
const COUNT = 54;
const TARGET = 46;
const START = 2;
const SPIN_MS = 3500;

/** Cosmetic reel at the draw's own odds. Uses Math.random, never the life's random streams. */
function buildDeck(target: string, draw: DrawMode): string[] {
  const weights = PLAYABLE_COUNTRIES.map((c) => (draw === "equal" ? 1 : c.draw.weight));
  const total = weights.reduce((a, w) => a + w, 0);
  const pick = () => {
    let r = Math.random() * total;
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i]!;
      if (r < 0) return PLAYABLE_COUNTRIES[i]!.id;
    }
    return PLAYABLE_COUNTRIES.at(-1)!.id;
  };
  const deck: string[] = [];
  for (let i = 0; i < COUNT; i++) {
    let id = pick();
    for (let tries = 0; tries < 8 && (id === deck[i - 1] || (Math.abs(i - TARGET) <= 1 && id === target)); tries++) id = pick();
    deck.push(id);
  }
  deck[TARGET] = target;
  return deck;
}

type Phase = "ready" | "spin" | "settle" | "landed";

/** Sparkle offsets from the reel center: x, y, font size, delay in ms. */
const SPARKS: [number, number, number, number][] = [
  [-78, -40, 16, 0],
  [74, -44, 13, 90],
  [-92, 18, 12, 160],
  [88, 26, 17, 60],
  [-58, 50, 11, 220],
  [60, 52, 12, 140],
  [-120, -10, 10, 260],
  [118, -6, 11, 200],
  [0, -58, 12, 320],
];

export function BirthSpin({ life, onDone }: { life: LifeState; onDone: () => void }) {
  const target = life.birthplace.countryId;
  const [deck] = useState(() => buildDeck(target, life.draw));
  const [jitter] = useState(() => (Math.random() - 0.5) * CARD * 0.7);
  const wrap = useRef<HTMLDivElement>(null);
  const strip = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [phase, setPhase] = useState<Phase>("ready");
  const [under, setUnder] = useState(START);
  const [bump, setBump] = useState(0);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  }, [onDone]);

  useLayoutEffect(() => {
    setWidth(wrap.current?.clientWidth ?? 0);
  }, []);

  useEffect(() => {
    if (!width) return;
    let r2 = 0;
    const r1 = requestAnimationFrame(() => {
      r2 = requestAnimationFrame(() => setPhase("spin"));
    });
    return () => {
      cancelAnimationFrame(r1);
      cancelAnimationFrame(r2);
    };
  }, [width]);

  useEffect(() => {
    if (phase !== "spin") return;
    let raf = 0;
    let last = -1;
    const loop = () => {
      const el = strip.current;
      if (el) {
        const m = new DOMMatrixReadOnly(getComputedStyle(el).transform);
        const idx = Math.round((width / 2 - m.m41 - CARD / 2) / STEP);
        if (idx !== last) {
          last = idx;
          setUnder(Math.max(0, Math.min(COUNT - 1, idx)));
          setBump((b) => b + 1);
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [phase, width]);

  const unicorn = Boolean(life.unicorn);
  useEffect(() => {
    if (phase !== "landed") return;
    const t = window.setTimeout(() => done.current(), unicorn ? 2000 : 800);
    return () => window.clearTimeout(t);
  }, [phase, unicorn]);

  const centerOn = (i: number) => width / 2 - (i * STEP + CARD / 2);
  const x = phase === "ready" ? centerOn(START) : phase === "spin" ? centerOn(TARGET) + jitter : centerOn(TARGET);
  const transition = phase === "spin" ? `transform ${SPIN_MS}ms cubic-bezier(0.08, 0.72, 0.12, 1)` : phase === "settle" ? "transform 320ms cubic-bezier(0.3, 1.6, 0.5, 1)" : "none";
  const shown = phase === "landed" || phase === "settle" ? TARGET : under;
  const c = country(deck[shown]!);
  const landed = phase === "landed";

  return (
    <div className="flex flex-col items-center">
      <p className={`text-[11px] font-semibold uppercase tracking-[0.06em] ${landed && unicorn ? "animate-in zoom-in-50 fade-in duration-500" : "text-[var(--os-dim)]"}`} style={landed && unicorn ? { color: OS.rose } : undefined}>
        {landed ? (unicorn ? "🦄 Unicorn seed · born in" : "Born in") : "Drawing a birthplace"}
      </p>
      <p key={landed ? "landed" : bump} className={`mt-1 flex min-h-[44px] items-center gap-2 text-center text-[24px] font-semibold leading-tight sm:text-[28px] ${landed ? "animate-in zoom-in-95 fade-in duration-300" : ""}`} aria-hidden={!landed}>
        <span className="text-[30px] sm:text-[34px]">{countryFlag(c.id)}</span>
        <span>{landed ? `${life.birthplace.locality}, ${c.name}` : c.name}</span>
      </p>
      <div ref={wrap} className="relative mt-4 h-[132px] w-full overflow-hidden rounded-[11px] border border-[var(--os-border)] bg-[var(--os-page)] [mask-image:linear-gradient(90deg,transparent,#000_14%,#000_86%,transparent)]" onClick={() => done.current()} role="presentation">
        <div
          ref={strip}
          className="absolute top-[18px] flex gap-[8px] will-change-transform"
          style={{ transform: `translateX(${x}px)`, transition }}
          onTransitionEnd={(e) => {
            if (e.target !== e.currentTarget) return;
            if (phase === "spin") setPhase("settle");
            else if (phase === "settle") setPhase("landed");
          }}
        >
          {deck.map((id, i) => {
            const hit = i === shown;
            const win = landed && i === TARGET;
            const glow = win && unicorn;
            return (
              <div
                key={i}
                className="flex h-[96px] w-[96px] shrink-0 flex-col items-center justify-center gap-1 rounded-[9px] border px-1.5 text-center transition-transform duration-150"
                style={{
                  borderColor: glow ? OS.rose : win ? OS.amber : hit ? "var(--os-text)" : "var(--os-border)",
                  background: glow
                    ? `linear-gradient(135deg, color-mix(in srgb, ${OS.amber} 30%, var(--os-panel)), color-mix(in srgb, ${OS.rose} 26%, var(--os-panel)))`
                    : win
                      ? `color-mix(in srgb, ${OS.amber} 14%, var(--os-panel))`
                      : "var(--os-panel)",
                  transform: glow ? "scale(1.14)" : win ? "scale(1.1)" : hit ? "scale(1.04)" : undefined,
                  boxShadow: glow ? `0 0 0 3px color-mix(in srgb, ${OS.rose} 40%, transparent), 0 0 28px color-mix(in srgb, ${OS.amber} 55%, transparent)` : win ? `0 0 0 3px color-mix(in srgb, ${OS.amber} 35%, transparent)` : undefined,
                }}
              >
                <span className="text-[34px] leading-none">{countryFlag(id)}</span>
                <span className="line-clamp-2 text-[10.5px] leading-tight text-[var(--os-dim)]">{country(id).name}</span>
              </div>
            );
          })}
        </div>
        <span key={bump} aria-hidden className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 animate-in slide-in-from-top-1 duration-100" style={{ width: 0, height: 0, borderLeft: "9px solid transparent", borderRight: "9px solid transparent", borderTop: `12px solid ${OS.amber}` }} />
        {landed && unicorn
          ? SPARKS.map(([dx, dy, size, delay], i) => (
              <span
                key={i}
                aria-hidden
                className="pointer-events-none absolute animate-in zoom-in-0 fade-in spin-in-90 duration-700"
                style={{ left: `calc(50% + ${dx}px)`, top: `calc(50% + ${dy}px)`, fontSize: size, color: i % 2 ? OS.rose : OS.amber, animationDelay: `${delay}ms`, animationFillMode: "both", marginLeft: -size / 2, marginTop: -size / 2, lineHeight: 1 }}
              >
                ✦
              </span>
            ))
          : null}
        <span aria-hidden className="pointer-events-none absolute bottom-0 left-1/2 -translate-x-1/2" style={{ width: 0, height: 0, borderLeft: "9px solid transparent", borderRight: "9px solid transparent", borderBottom: `12px solid ${OS.amber}` }} />
      </div>
      <p className="sr-only" aria-live="polite">
        {landed ? `${unicorn ? "Unicorn seed. " : ""}Born in ${life.birthplace.locality}, ${country(target).name}.` : "Drawing a birthplace."}
      </p>
      <div className="mt-3 flex w-full items-center justify-between gap-3 text-[11.5px] text-[var(--os-dim)]">
        <span>{life.draw === "equal" ? "Every place on the reel had the same chance." : "The reel runs at real birth odds, so big countries come up often."}</span>
        {landed ? null : (
          <Btn variant="quiet" className="min-h-8 shrink-0 px-2 text-[12px]" onClick={() => done.current()}>
            Skip
          </Btn>
        )}
      </div>
    </div>
  );
}
