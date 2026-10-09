"use client";

import { useEffect, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

const BASE_MS = 1600;
const STAGGER_MS = 650;

export function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** How long a spin of `reels` reels takes before the last one stops. */
export function slotSpinMs(reels: number): number {
  return reducedMotion() ? 120 : BASE_MS + STAGGER_MS * (reels - 1) + 150;
}

/** Fill a reel strip with random filler, ending on the landing value. */
export function reelStrip<T>(pool: readonly T[], landing: T, length = 22, rng: () => number = Math.random): T[] {
  const strip: T[] = [];
  for (let i = 0; i < length; i += 1) strip.push(pool[Math.floor(rng() * pool.length)]!);
  strip.push(landing);
  return strip;
}

export function SpinButton({
  spinning,
  onClick,
  className,
  children = "Spin",
}: {
  spinning: boolean;
  onClick: () => void;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={spinning}
      className={cn(
        "h-12 rounded-full bg-[#ffc53d] px-8 text-[15px] font-extrabold uppercase tracking-[0.12em] text-neutral-900 shadow-[0_4px_0_#c98f00] transition-[transform,box-shadow] hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:translate-y-[3px] active:shadow-[0_1px_0_#c98f00] disabled:translate-y-[3px] disabled:shadow-[0_1px_0_#c98f00] disabled:opacity-80",
        className
      )}
    >
      {spinning ? "Spinning…" : children}
    </button>
  );
}

export type SlotReel = {
  /** Cells top to bottom. The last cell is where the reel stops. */
  cells: ReactNode[];
  className?: string;
};

/**
 * A slot machine with one or more vertical reels. Bump `spinId` with fresh
 * cells to spin; each reel decelerates onto its last cell, left to right.
 */
export function SlotMachine({
  reels,
  spinId,
  spinning,
  cellHeight = 64,
  className,
}: {
  reels: SlotReel[];
  spinId: number;
  spinning: boolean;
  cellHeight?: number;
  className?: string;
}) {
  return (
    <div className={cn("slot-machine relative rounded-[22px] p-2.5", className)} data-spinning={spinning || undefined}>
      <span aria-hidden className="slot-machine__lights" />
      <div className="relative flex gap-2">
        {reels.map((reel, i) => (
          <Reel
            key={`${spinId}-${i}`}
            cells={reel.cells}
            animate={spinId > 0}
            durationMs={BASE_MS + STAGGER_MS * i}
            cellHeight={cellHeight}
            className={reel.className}
          />
        ))}
        <span aria-hidden className="slot-machine__payline" style={{ top: cellHeight }} />
        <span aria-hidden className="slot-machine__payline" style={{ top: cellHeight * 2 }} />
      </div>
    </div>
  );
}

function Reel({
  cells,
  animate,
  durationMs,
  cellHeight,
  className,
}: {
  cells: ReactNode[];
  animate: boolean;
  durationMs: number;
  cellHeight: number;
  className?: string;
}) {
  const [go, setGo] = useState(!animate);
  useEffect(() => {
    if (!animate) return;
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setGo(true));
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [animate]);

  const landing = -(cells.length - 2) * cellHeight;
  const quick = !animate || reducedMotion();
  return (
    <div
      className={cn("slot-reel relative min-w-0 flex-1 overflow-hidden rounded-[14px]", className)}
      style={{ height: cellHeight * 3 }}
    >
      <ul
        role="list"
        className="slot-reel__strip"
        style={{
          transform: `translate3d(0, ${go ? landing : 0}px, 0)`,
          transition: quick || !go ? "none" : `transform ${durationMs}ms cubic-bezier(0.16, 0.72, 0.18, 1.015)`,
          animation: quick || !go ? undefined : `slot-blur ${durationMs}ms ease-out`,
        }}
      >
        {[...cells, cells[0]].map((cell, i) => (
          <li
            key={i}
            className="flex items-center justify-center px-2"
            style={{ height: cellHeight }}
            aria-hidden={i !== cells.length - 1 || undefined}
          >
            {cell}
          </li>
        ))}
      </ul>
    </div>
  );
}
