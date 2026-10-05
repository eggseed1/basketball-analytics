"use client";

import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const SLICE_COLORS = ["var(--chart-1)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "#ff375f"];
const SPIN_MS = 3200;

function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** A prize wheel that lands on a random slice. The pointer sits at the top. */
export function SpinWheel({
  labels,
  onResult,
  disabled,
  className,
}: {
  labels: string[];
  onResult: (index: number) => void;
  disabled?: boolean;
  className?: string;
}) {
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const slice = 360 / labels.length;
  const gradient = labels
    .map((_, i) => `${SLICE_COLORS[i % SLICE_COLORS.length]} ${i * slice}deg ${(i + 1) * slice}deg`)
    .join(", ");

  function spin() {
    if (spinning || disabled) return;
    const index = Math.floor(Math.random() * labels.length);
    const landing = (360 - (index * slice + slice / 2)) % 360;
    const current = ((rotation % 360) + 360) % 360;
    const quick = reducedMotion();
    setRotation(rotation + (quick ? 0 : 360 * 5) + ((landing - current + 360) % 360));
    setSpinning(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(
      () => {
        setSpinning(false);
        onResult(index);
      },
      quick ? 150 : SPIN_MS
    );
  }

  return (
    <div className={cn("flex flex-col items-center gap-4", className)}>
      <div className="relative size-60 sm:size-72">
        <span
          aria-hidden
          className="absolute left-1/2 top-[-6px] z-10 size-0 -translate-x-1/2 border-x-[11px] border-t-[18px] border-x-transparent border-t-foreground"
        />
        <div
          aria-hidden
          className="size-full rounded-full border-4 border-background shadow-[0_0_0_1px_var(--border)] transition-transform ease-[cubic-bezier(0.17,0.67,0.21,1)] motion-reduce:transition-none"
          style={{
            background: `conic-gradient(${gradient})`,
            transform: `rotate(${rotation}deg)`,
            transitionDuration: `${SPIN_MS}ms`,
          }}
        >
          {labels.map((label, i) => (
            <span
              key={label}
              className="absolute inset-0"
              style={{ transform: `rotate(${i * slice + slice / 2}deg)` }}
            >
              <span className="absolute left-1/2 top-[13%] -translate-x-1/2 text-[13px] font-bold tracking-wide text-white drop-shadow-sm sm:text-[15px]">
                {label}
              </span>
            </span>
          ))}
        </div>
        <span
          aria-hidden
          className="absolute left-1/2 top-1/2 size-10 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-background bg-foreground"
        />
      </div>
      <Button size="lg" className="min-w-36" onClick={spin} disabled={spinning || disabled}>
        {spinning ? "Spinning…" : "Spin"}
      </Button>
    </div>
  );
}
