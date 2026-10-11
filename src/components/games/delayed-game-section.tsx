"use client";

import { useMemo, type ReactNode } from "react";

import {
  DelayAsOf,
  useDelayedValue,
  useHydrated,
  useScoreDelaySeconds,
} from "@/components/sports/use-score-delay";
import { scoreDelayLabel } from "@/lib/score-delay";

/**
 * Server-rendered game sections on the viewer's score delay. Each route
 * refresh arrives as new children; this shows the newest one at least the
 * delay old. CSS shows the placeholder before hydration when a delay is saved.
 */
export function DelayedGameSection({
  risky,
  children,
}: {
  /** Live or recently ended when the server rendered these children. */
  risky: boolean;
  children: ReactNode;
}) {
  const delay = useScoreDelaySeconds();
  const hydrated = useHydrated();
  const snapshot = useMemo(() => ({ node: children, risky }), [children, risky]);
  const { due, earliest, delayMs } = useDelayedValue(snapshot);

  let shown: { node: ReactNode; at: number | undefined } | null;
  if (!delayMs) shown = { node: children, at: undefined };
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
          Box score, plays and charts show here once your {delay ? scoreDelayLabel(delay) : "score"}{" "}
          delay has passed, then stay that far behind the live game.
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
