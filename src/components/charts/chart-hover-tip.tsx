"use client";

import { useEffect } from "react";

const GAP = 8;
const EDGE = 8;

/**
 * One hover label for hand-built charts. Any element with `data-tip` (first
 * line) and optional `data-tip-sub` (second line) gets it on hover or focus,
 * pinned above its `[data-tip-anchor]` child when it has one. Moving between
 * marks glides the label instead of re-opening it.
 */
export function ChartHoverTip() {
  useEffect(() => {
    const tip = document.createElement("div");
    tip.className = "chart-tooltip chart-hover-tip";
    tip.setAttribute("role", "tooltip");
    tip.setAttribute("aria-hidden", "true");
    const title = document.createElement("p");
    const sub = document.createElement("p");
    sub.className = "text-muted-foreground";
    tip.append(title, sub);
    document.body.append(tip);

    let current: Element | null = null;
    let hideTimer = 0;

    const place = (target: Element) => {
      const anchor = target.querySelector("[data-tip-anchor]") ?? target;
      const rect = anchor.getBoundingClientRect();
      const width = tip.offsetWidth;
      const height = tip.offsetHeight;
      const flip = rect.top - height - GAP < EDGE;
      const x = Math.min(
        window.innerWidth - EDGE - width / 2,
        Math.max(EDGE + width / 2, rect.left + rect.width / 2)
      );
      tip.toggleAttribute("data-flip", flip);
      tip.style.left = `${Math.round(x)}px`;
      tip.style.top = `${Math.round(flip ? rect.bottom + GAP : rect.top - GAP)}px`;
    };

    const show = (target: Element) => {
      window.clearTimeout(hideTimer);
      if (target === current) return;
      const wasOpen = current != null;
      current = target;
      title.textContent = target.getAttribute("data-tip") ?? "";
      const subText = target.getAttribute("data-tip-sub");
      sub.textContent = subText ?? "";
      sub.hidden = !subText;
      tip.toggleAttribute("data-glide", wasOpen);
      place(target);
      tip.setAttribute("data-open", "");
    };

    const hide = (delay = 90) => {
      window.clearTimeout(hideTimer);
      hideTimer = window.setTimeout(() => {
        current = null;
        tip.removeAttribute("data-open");
        tip.removeAttribute("data-glide");
      }, delay);
    };

    const targetOf = (node: EventTarget | null) =>
      node instanceof Element ? node.closest("[data-tip]") : null;

    const onOver = (e: PointerEvent | FocusEvent) => {
      const target = targetOf(e.target);
      if (target) show(target);
    };
    const onOut = (e: PointerEvent | FocusEvent) => {
      if (!current) return;
      if (targetOf(e.relatedTarget) === current) return;
      hide();
    };
    const onScroll = () => {
      if (current) hide(0);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") hide(0);
    };

    document.addEventListener("pointerover", onOver);
    document.addEventListener("pointerout", onOut);
    document.addEventListener("focusin", onOver);
    document.addEventListener("focusout", onOut);
    window.addEventListener("scroll", onScroll, { passive: true, capture: true });
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(hideTimer);
      document.removeEventListener("pointerover", onOver);
      document.removeEventListener("pointerout", onOut);
      document.removeEventListener("focusin", onOver);
      document.removeEventListener("focusout", onOut);
      window.removeEventListener("scroll", onScroll, { capture: true });
      document.removeEventListener("keydown", onKey);
      tip.remove();
    };
  }, []);

  return null;
}
