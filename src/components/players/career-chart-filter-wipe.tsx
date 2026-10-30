"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

/** Filter wipe-out — was 280ms when chart draw was 720ms. */
const OUT_MS = Math.round((1500 * 280) / 720);
const EASE = "cubic-bezier(0.33, 1, 0.68, 1)";
/** Fully open — four values so WAAPI never normalizes to a different form mid-run. */
const OPEN = "inset(-50% -50% -50% -50%)";
/** Fully clipped from the right — same closed pose as the page LTR wipe. */
const CLOSED = "inset(-50% 150% -50% -50%)";

/**
 * Series / grid only — axes stay mounted so ticks can animate into the new
 * scale while the plot clears.
 */
const PLOT_SEL = [
  ".recharts-cartesian-grid",
  ".recharts-reference-line",
  ".recharts-line",
  // Recharts parks dots in a separate z-index layer — not under .recharts-line.
  ".recharts-line-dots",
  ".recharts-area",
  ".recharts-scatter",
  ".recharts-career-monotone-stroke",
].join(", ");

/**
 * How the career chart should appear:
 * - `entry`: stroke + dots draw left → right from empty
 * - `swap`: legacy; charts treat like entry (empty → fill)
 */
export type CareerChartReveal = "entry" | "swap";

const CareerChartRevealContext = createContext<CareerChartReveal>("entry");

export function useCareerChartReveal(): CareerChartReveal {
  return useContext(CareerChartRevealContext);
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

type PlotEl = HTMLElement | SVGElement;

function plotNodes(root: HTMLElement): PlotEl[] {
  return [...root.querySelectorAll<PlotEl>(PLOT_SEL)];
}

/** Freeze in-flight WAAPI onto inline style; leave the clip where it is. */
function commitAnimations(nodes: PlotEl[]) {
  for (const el of nodes) {
    for (const a of el.getAnimations()) {
      try {
        a.commitStyles();
      } catch {
        /* ignore */
      }
      a.cancel();
    }
  }
}

/** Commit in-flight WAAPI onto style, then pin `clip`. Never snaps to OPEN. */
function cancelKeepingAll(nodes: PlotEl[], clip: string) {
  commitAnimations(nodes);
  for (const el of nodes) {
    el.style.clipPath = clip;
  }
}

/** Visual clip right now — mid-wipe / mid-reveal stay put instead of flashing open. */
function clipNow(el: PlotEl): string {
  const inline = el.style.clipPath.trim();
  const computed = getComputedStyle(el).clipPath.trim();
  const raw =
    inline ||
    (computed && computed !== "none" ? computed : "");
  // Fully painted plot (no clip) or a collapsed single-value inset — wipe from open.
  if (!raw || raw === "inset(-50%)") return OPEN;
  return raw;
}

function isClosedClip(clip: string): boolean {
  return clip.includes("150%");
}

/** Wipe out from wherever the plot is — not from a forced full-open snap. */
function animateClipOut(nodes: PlotEl[], duration: number): Animation[] {
  return nodes.map((el) => {
    for (const a of el.getAnimations()) {
      try {
        a.commitStyles();
      } catch {
        /* ignore */
      }
      a.cancel();
    }
    const from = clipNow(el);
    el.style.clipPath = from;
    if (isClosedClip(from)) {
      el.style.clipPath = CLOSED;
      return el.animate([{ clipPath: CLOSED }, { clipPath: CLOSED }], {
        duration: 0,
        fill: "forwards",
      });
    }
    return el.animate([{ clipPath: from }, { clipPath: CLOSED }], {
      duration,
      easing: EASE,
      fill: "forwards",
    });
  });
}

async function finishedAll(anims: Animation[]): Promise<void> {
  await Promise.all(
    anims.map((a) =>
      a.finished.catch(() => {
        /* cancelled */
      })
    )
  );
}

/**
 * Career filter switches: wipe the old plot away, remount the new series
 * empty, then let the chart draw left → right into place. No wipe-in of a
 * pre-painted graph — that fought the stroke draw and never felt empty→full.
 */
export function CareerChartFilterWipe({
  transitionKey,
  children,
}: {
  transitionKey: string;
  children: ReactNode;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const pendingRef = useRef({ key: transitionKey, children });
  const shownKeyRef = useRef(transitionKey);
  const genRef = useRef(0);
  const [shown, setShown] = useState({ key: transitionKey, children });

  // Keep the last committed plot available while a different filter wipes out.
  if (shown.key === transitionKey && shown.children !== children) {
    setShown({ key: transitionKey, children });
  }
  useEffect(() => {
    pendingRef.current = { key: transitionKey, children };
  }, [transitionKey, children]);

  useEffect(() => {
    if (transitionKey === shownKeyRef.current) return;
    const root = wrapRef.current;
    const gen = ++genRef.current;
    const apply = () => {
      if (gen !== genRef.current) return;
      const next = pendingRef.current;
      shownKeyRef.current = next.key;
      setShown(next);
    };

    if (prefersReducedMotion() || !root) {
      const frame = window.requestAnimationFrame(apply);
      return () => {
        genRef.current += 1;
        window.cancelAnimationFrame(frame);
      };
    }

    const outAnims = animateClipOut(plotNodes(root), OUT_MS);
    void finishedAll(outAnims).then(() => {
      if (gen !== genRef.current) return;
      cancelKeepingAll(plotNodes(root), CLOSED);
      apply();
    });
    return () => {
      genRef.current += 1;
      commitAnimations(plotNodes(root));
    };
  }, [transitionKey]);

  return (
    <div
      ref={wrapRef}
      data-career-chart
      data-career-reveal="entry"
      data-motion-static
      className="relative w-full min-w-0"
      data-career-key={shown.key}
    >
      <CareerChartRevealContext.Provider value="entry">
        <div key={shown.key} className="w-full min-w-0">
          {shown.key === transitionKey ? children : shown.children}
        </div>
      </CareerChartRevealContext.Provider>
    </div>
  );
}
