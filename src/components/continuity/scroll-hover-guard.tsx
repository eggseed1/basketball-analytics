"use client";

import { useEffect, useRef } from "react";

const SETTLE_MS = 150;

/**
 * While the page scrolls, content slides under a resting cursor and keeps
 * firing hover: tooltips open and glide, cards lift and dim. During page
 * scroll a transparent shield covers the viewport so nothing underneath is
 * hovered until it settles. Only the page scroll counts, so a table or strip
 * scrolling on its own keeps its wheel target.
 *
 * The shield is one element on purpose: toggling an inherited property such
 * as pointer-events on body restyles every element on the page, twice per
 * scroll gesture.
 */
export function ScrollHoverGuard() {
  const shield = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = shield.current;
    if (!el || !window.matchMedia("(hover: hover)").matches) return;
    let timer = 0;
    const settle = () => {
      timer = 0;
      el.removeAttribute("data-active");
    };
    const onScroll = () => {
      if (timer) window.clearTimeout(timer);
      else el.setAttribute("data-active", "");
      timer = window.setTimeout(settle, SETTLE_MS);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.clearTimeout(timer);
      el.removeAttribute("data-active");
    };
  }, []);

  return <div ref={shield} aria-hidden data-scroll-shield />;
}
