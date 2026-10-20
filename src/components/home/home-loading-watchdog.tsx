"use client";

import { useEffect } from "react";

/**
 * If streamed Suspense never swaps the loading shell for the real page (or
 * MotionReveal left it invisible), force one reload. Guards against a loop.
 */
const KEY = "drbl:home-load-watch";
const WAIT_MS = 4_000;

export function HomeLoadingWatchdog() {
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const busy = document.querySelector("main[aria-busy='true']");
      const real = document.querySelector("main[data-home-stack][data-motion-page]");
      const stuckLoading = Boolean(busy);
      const realInvisible =
        real instanceof HTMLElement &&
        real.getBoundingClientRect().height < 40 &&
        (real.textContent?.length ?? 0) > 200;
      if (!stuckLoading && !realInvisible) return;
      try {
        const raw = sessionStorage.getItem(KEY);
        const at = raw ? Number(raw) : 0;
        if (Number.isFinite(at) && Date.now() - at < 30_000) return;
        sessionStorage.setItem(KEY, String(Date.now()));
      } catch {
        /* private mode */
      }
      window.location.reload();
    }, WAIT_MS);
    return () => window.clearTimeout(timer);
  }, []);

  return null;
}
