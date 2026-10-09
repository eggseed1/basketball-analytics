"use client";

import { useEffect } from "react";

const SETTLE_MS = 4_000;

/**
 * Streamed sections land after the browser's one-time fragment jump, so keep
 * the `#section` target aligned while content above it fills in. Any user
 * scroll input hands control back immediately.
 */
export function HashAnchorScroll() {
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (!id) return;

    let done = false;
    const align = () => {
      if (done) return;
      document.getElementById(id)?.scrollIntoView({ block: "start" });
    };
    const stop = () => {
      done = true;
      observer.disconnect();
      window.clearTimeout(timer);
      for (const type of ["wheel", "touchstart", "keydown", "pointerdown"] as const) {
        window.removeEventListener(type, stop);
      }
    };

    const observer = new ResizeObserver(align);
    observer.observe(document.body);
    const timer = window.setTimeout(stop, SETTLE_MS);
    for (const type of ["wheel", "touchstart", "keydown", "pointerdown"] as const) {
      window.addEventListener(type, stop, { passive: true });
    }
    align();
    return stop;
  }, []);

  return null;
}
