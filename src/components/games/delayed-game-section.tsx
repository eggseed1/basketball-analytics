"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, type ReactNode } from "react";

import {
  DelayAsOf,
  useDelayedValue,
  useHydrated,
  useScoreDelaySeconds,
} from "@/components/sports/use-score-delay";
import { scoreDelayLabel } from "@/lib/score-delay";

/**
 * Server-rendered game sections on the viewer's score delay. When the server
 * already rendered them as of that delay (`cutDelay`), they show right away.
 * Otherwise each route refresh arrives as new children and this shows the
 * newest one at least the delay old. CSS shows the placeholder before
 * hydration when a delay is saved.
 */
export function DelayedGameSection({
  risky,
  cutDelay,
  children,
}: {
  /** Live or recently ended when the server rendered these children, and not cut to a delay. */
  risky: boolean;
  /**
   * Delay in seconds the server rendered these children at (0 for live).
   * Set only on the page-level section, which refreshes the route when it
   * doesn't match the viewer's delay.
   */
  cutDelay?: number;
  children: ReactNode;
}) {
  const delay = useScoreDelaySeconds();
  const hydrated = useHydrated();
  const router = useRouter();
  const snapshot = useMemo(() => ({ node: children, risky }), [children, risky]);
  const { due, earliest, delayMs } = useDelayedValue(snapshot);

  const refreshedFor = useRef<number | null>(null);
  const stale = hydrated && cutDelay != null && cutDelay !== delay && (risky || cutDelay > 0);
  useEffect(() => {
    if (!stale || refreshedFor.current === delay) return;
    refreshedFor.current = delay;
    router.refresh();
  }, [stale, delay, router]);

  const cutFits = cutDelay != null && cutDelay > 0 && cutDelay >= delay;
  let shown: { node: ReactNode; at: number | undefined } | null;
  if (!delayMs || cutFits) shown = { node: children, at: undefined };
  else if (due) shown = { node: due.value.node, at: due.at };
  else if (earliest && !earliest.value.risky) shown = { node: earliest.value.node, at: earliest.at };
  else if (!earliest && !risky) shown = { node: children, at: undefined };
  else shown = null;

  return (
    <div
      data-delay-section=""
      data-delay-risky={risky ? "" : undefined}
      data-delay-ready={hydrated ? "" : undefined}
      data-delay-waiting={shown ? undefined : ""}
    >
      <div data-delay-placeholder className="sports-card flex-col items-start gap-1 p-4 sm:p-5">
        <p className="text-[17px] font-bold tracking-tight">Catching up to your delay</p>
        <p className="text-[14px] text-muted-foreground">
          This shows here once your {delay ? scoreDelayLabel(delay) : "score"} delay has passed,
          then stays that far behind the live game.
        </p>
      </div>
      {shown ? (
        <div data-delay-body>
          <DelayAsOf at={shown.at}>{shown.node}</DelayAsOf>
        </div>
      ) : null}
    </div>
  );
}
