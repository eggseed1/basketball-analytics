"use client";

import { useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

let signals = 0;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Lights the viewport-wide progress line while mounted. Any number can be mounted at once. */
export function LoadingBarSignal() {
  useEffect(() => {
    signals += 1;
    emit();
    return () => {
      signals -= 1;
      emit();
    };
  }, []);
  return null;
}

/**
 * The one progress line, across the full width of the viewport. Portaled to body because a
 * transformed ancestor would pin a fixed element to itself instead of the viewport.
 */
export function ViewportLoadingBar({ active = false }: { active?: boolean }) {
  const count = useSyncExternalStore(
    subscribe,
    () => signals,
    () => 0
  );
  if (!active && count === 0) return null;
  if (typeof document === "undefined") return null;
  return createPortal(
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-[60]">
      <div className="query-updating-bar" />
    </div>,
    document.body
  );
}
