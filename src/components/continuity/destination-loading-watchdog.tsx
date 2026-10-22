"use client";

import { useEffect } from "react";

/**
 * If the Worker HTML stream dies while loading.tsx is still the painted shell
 * (truncated RSC leaves main[aria-busy] forever), force one reload.
 */
const KEY = "drbl:dest-load-watch";

export function DestinationLoadingWatchdog({ waitMs = 5_000 }: { waitMs?: number }) {
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!document.querySelector("main[aria-busy='true']")) return;
      try {
        const raw = sessionStorage.getItem(KEY);
        const at = raw ? Number(raw) : 0;
        if (Number.isFinite(at) && Date.now() - at < 30_000) return;
        sessionStorage.setItem(KEY, String(Date.now()));
      } catch {
        /* private mode */
      }
      window.location.reload();
    }, waitMs);
    return () => window.clearTimeout(timer);
  }, [waitMs]);

  return null;
}
