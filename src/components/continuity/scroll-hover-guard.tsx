"use client";

import { useEffect } from "react";

const SETTLE_MS = 150;

/**
 * While the page scrolls, content slides under a resting cursor and keeps
 * firing hover: tooltips open and glide, cards lift and dim. This marks the
 * document as scrolling so CSS can drop pointer hit testing until it settles.
 * Only the page scroll counts, so a table or strip scrolling on its own keeps
 * its wheel target.
 */
export function ScrollHoverGuard() {
  useEffect(() => {
    if (!window.matchMedia("(hover: hover)").matches) return;
    const html = document.documentElement;
    let timer = 0;
    const settle = () => {
      timer = 0;
      html.removeAttribute("data-scrolling");
    };
    const onScroll = () => {
      if (timer) window.clearTimeout(timer);
      else html.setAttribute("data-scrolling", "");
      timer = window.setTimeout(settle, SETTLE_MS);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.clearTimeout(timer);
      html.removeAttribute("data-scrolling");
    };
  }, []);

  return null;
}
