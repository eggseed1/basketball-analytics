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

function cancelKeepingAll(nodes: PlotEl[], clip: string) {
  for (const el of nodes) {
    el.style.clipPath = clip;
    for (const a of el.getAnimations()) {
      try {
        a.commitStyles();
      } catch {
        /* ignore */
      }
      a.cancel();
    }
    el.style.clipPath = clip;
  }
}

function clearClip(nodes: PlotEl[]) {
  for (const el of nodes) {
    for (const a of el.getAnimations()) {
      try {
        a.commitStyles();
      } catch {
        /* ignore */
      }
      a.cancel();
    }
    el.style.clipPath = "";
  }
}

function animateClip(
  nodes: PlotEl[],
  from: string,
  to: string,
  duration: number
): Animation[] {
  return nodes.map((el) => {
    el.style.clipPath = from;
    return el.animate([{ clipPath: from }, { clipPath: to }], {
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
  const pendingRef = useRef(children);
  const shownKeyRef = useRef(transitionKey);
  const latestKeyRef = useRef(transitionKey);
  const genRef = useRef(0);
  const [shownKey, setShownKey] = useState(transitionKey);
  const [shown, setShown] = useState(children);
  pendingRef.current = children;
  latestKeyRef.current = transitionKey;

  // Keep live children in sync when the key has not changed (no wipe).
  useEffect(() => {
    if (transitionKey === shownKeyRef.current) {
      setShown(children);
    }
  }, [children, transitionKey]);

  useEffect(() => {
    if (transitionKey === shownKeyRef.current) return;

    const root = wrapRef.current;
    const gen = ++genRef.current;

    const apply = (key: string) => {
      shownKeyRef.current = key;
      setShownKey(key);
      setShown(pendingRef.current);
    };

    if (prefersReducedMotion() || !root) {
      apply(latestKeyRef.current);
      return;
    }

    const outNodes = plotNodes(root);
    cancelKeepingAll(outNodes, OPEN);
    const outAnims = animateClip(outNodes, OPEN, CLOSED, OUT_MS);

    void (async () => {
      await finishedAll(outAnims);
      if (gen !== genRef.current) return;

      // Swap under a closed clip, then drop the clip so the remounted chart
      // can start empty and draw. Do not wipe-in a finished painting.
      cancelKeepingAll(plotNodes(root), CLOSED);
      apply(latestKeyRef.current);

      await new Promise<void>((r) => requestAnimationFrame(() => r()));
      if (gen !== genRef.current) return;
      clearClip(plotNodes(wrapRef.current ?? root));
    })();

    return () => {
      genRef.current += 1;
      if (wrapRef.current) clearClip(plotNodes(wrapRef.current));
    };
  }, [transitionKey]);

  return (
    <div
      ref={wrapRef}
      data-career-chart
      data-career-reveal="entry"
      data-motion-static
      className="relative w-full min-w-0"
      data-career-key={shownKey}
    >
      <CareerChartRevealContext.Provider value="entry">
        {/* Remount on each filter key so draw state always starts empty. */}
        <div key={shownKey} className="w-full min-w-0">
          {shown}
        </div>
      </CareerChartRevealContext.Provider>
    </div>
  );
}
