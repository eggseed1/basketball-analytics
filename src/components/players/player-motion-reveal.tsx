"use client";

import { useEffect } from "react";

type Pose = (el: Element, style: CSSStyleDeclaration) => Keyframe;

const SECTION = ":scope > :not(.hof-page-frame), .hof-page-frame__inner > *";

/** Start poses, matched in order. They mirror the @starting-style rules in globals.css. */
const POSES: Array<[selector: string, pose: Pose]> = [
  [SECTION, () => ({ opacity: 0, translate: "0 14px" })],
  ["[data-motion-list] > *, [data-motion-item]", () => ({ opacity: 0, translate: "0 8px" })],
  ["tbody > tr", () => ({ opacity: 0 })],
  ['[data-motion-bar="x"]', () => ({ scale: "0 1" })],
  ['[data-motion-bar="y"], .recharts-bar-rectangle', () => ({ scale: "1 0" })],
  ["[data-motion-mark]", (_, s) => ({ left: s.getPropertyValue("--mark-from").trim() || "0%" })],
  ["[data-motion-dot], .recharts-line-dots > *, .recharts-scatter-symbol", () => ({ scale: 0 })],
  ["[data-motion-line]", () => ({ strokeDashoffset: 1 })],
  [".recharts-line, .recharts-area", () => ({ clipPath: "inset(-50% 150% -50% -50%)" })],
];

const TARGETS = POSES.map(([selector]) => selector).join(", ");

function seconds(value: string) {
  return value.endsWith("ms") ? parseFloat(value) : parseFloat(value) * 1000;
}

/** Longest transition on the element, with the delay and easing it was given. */
function timing(style: CSSStyleDeclaration): KeyframeAnimationOptions {
  const durations = style.transitionDuration.split(",");
  const delays = style.transitionDelay.split(",");
  const easings = style.transitionTimingFunction.split(/,(?![^(]*\))/);
  let pick = 0;
  durations.forEach((d, i) => {
    if (seconds(d) > seconds(durations[pick]!)) pick = i;
  });
  return {
    duration: seconds(durations[pick] ?? "0.5s") || 500,
    delay: seconds(delays[pick] ?? delays[0] ?? "0s"),
    easing: easings[pick]?.trim() || "ease",
    fill: "backwards",
  };
}

/**
 * Entry motion on the player page runs on @starting-style, which fires the
 * moment an element mounts, often below the fold where nobody sees it. This
 * holds those elements in their start pose with a paused animation and plays
 * it once they scroll into view. Nothing is written to the DOM, so streamed
 * Suspense boundaries still hydrate cleanly.
 */
export function PlayerMotionReveal() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>("[data-player-page]");
    if (!root || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const seen = new WeakSet<Element>();
    const waiting = new Map<Element, Animation[]>();
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        for (const animation of waiting.get(entry.target) ?? []) animation.play();
        waiting.delete(entry.target);
        io.unobserve(entry.target);
      }
    });

    // Start poses that collapse to zero size or full clip never intersect,
    // so those elements watch the svg or track that holds them.
    const proxyFor = (el: Element) =>
      el instanceof SVGElement && !(el instanceof SVGSVGElement)
        ? (el.closest("svg") ?? el)
        : el.matches("[data-motion-bar], [data-motion-dot], [data-motion-mark]")
          ? (el.parentElement ?? el)
          : el;

    const hold = (el: Element) => {
      const entry = POSES.find(([selector]) =>
        selector === SECTION ? el.parentElement === root || el.parentElement?.matches(".hof-page-frame__inner") : el.matches(selector)
      );
      if (!entry) return;
      const style = getComputedStyle(el);
      const animation = el.animate([{ ...entry[1](el, style), offset: 0 }], timing(style));
      animation.pause();
      const proxy = proxyFor(el);
      const list = waiting.get(proxy);
      if (list) list.push(animation);
      else {
        waiting.set(proxy, [animation]);
        io.observe(proxy);
      }
    };

    let frame = 0;
    const scan = () => {
      frame = 0;
      const fold = window.innerHeight;
      for (const el of root.querySelectorAll(TARGETS)) {
        if (seen.has(el)) continue;
        seen.add(el);
        if (el.getBoundingClientRect().top > fold) hold(el);
      }
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(scan);
    };

    scan();
    const mo = new MutationObserver(schedule);
    mo.observe(root, { childList: true, subtree: true });

    return () => {
      cancelAnimationFrame(frame);
      mo.disconnect();
      io.disconnect();
      for (const list of waiting.values()) for (const animation of list) animation.cancel();
    };
  }, []);

  return null;
}
