"use client";

import { useEffect } from "react";

type Pose = (el: Element, style: CSSStyleDeclaration) => Keyframe;

/* A fading ancestor cuts a frosted surface off from the page behind it, so the
   blur flashes clear until the fade ends. Frosted surfaces fade themselves. */
const FROST = ".sports-card, .glass-surface, .glass-card, .frost-surface, .frost-surface-soft, .frost-surface-muted";
const CARD = ".sports-card, .glass-surface, .glass-card";
const SECTION = [
  `[data-motion-page] > :not(.hof-page-frame, [data-motion-stack], [data-skeleton], [data-motion-static], :has(${FROST}))`,
  `:is(.hof-page-frame__inner, [data-motion-stack]) > :not([data-motion-stack], :has(${FROST}))`,
  `:is(${CARD}):not(a, [data-skeleton], [data-motion-tile], [data-motion-static] *, :is(${CARD}) *)`,
].join(", ");
const LIST = `:is([data-motion-list] > *, :is(ul, ol):not(nav *, [role]) > li):not(:has(${FROST})), [data-motion-item]`;

/** Start poses, matched in order. They mirror the @starting-style rules in globals.css. */
const POSES: Array<[selector: string, pose: Pose]> = [
  ["[data-motion-tile]", () => ({ opacity: 0, transform: "translateY(14px) scale(0.98)" })],
  [SECTION, () => ({ opacity: 0, translate: "0 14px" })],
  [LIST, () => ({ opacity: 0, translate: "0 8px" })],
  ['[data-motion-bar="x"]', () => ({ scale: "0 1" })],
  ['[data-motion-bar="y"], .recharts-bar-rectangle', () => ({ scale: "1 0" })],
  ["[data-motion-mark]", (_, s) => ({ left: s.getPropertyValue("--mark-from").trim() || "0%" })],
  ["[data-motion-dot], .recharts-line-dots > *, .recharts-scatter-symbol", () => ({ scale: 0 })],
  ["[data-motion-line]", () => ({ strokeDashoffset: 1 })],
  [".recharts-line, .recharts-area, [data-motion-wipe]", () => ({ clipPath: "inset(-50% 150% -50% -50%)" })],
  ["[data-motion-shape]", () => ({ opacity: 0, scale: 0.4, rotate: "-30deg" })],
];

const TARGETS = POSES.map(([selector]) => selector).join(", ");

const MAX_DELAY_MS = 120;
const BATCH_STEP_MS = 30;

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
 * Entry motion on a [data-motion-page] runs on @starting-style, which fires the
 * moment an element mounts, often below the fold where nobody sees it. This
 * holds those elements in their start pose with a paused animation and plays
 * it once they scroll into view. Nothing is written to the DOM, so streamed
 * Suspense boundaries still hydrate cleanly.
 */
export function MotionReveal() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>("[data-motion-page]");
    if (!root || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const seen = new WeakSet<Element>();
    const waiting = new Map<Element, Animation[]>();
    // The CSS stagger counts from the top of a list, so row 40 would wait most
    // of a second after scrolling in. Here the stagger restarts with each batch
    // that enters together, and the CSS delay only keeps its first beat.
    const io = new IntersectionObserver(
      (entries) => {
        const entering = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top || a.boundingClientRect.left - b.boundingClientRect.left);
        entering.forEach((entry, k) => {
          for (const animation of waiting.get(entry.target) ?? []) {
            const delay = Number(animation.effect?.getTiming().delay ?? 0);
            animation.effect?.updateTiming({ delay: Math.min(delay, MAX_DELAY_MS) + Math.min(k, 10) * BATCH_STEP_MS });
            animation.play();
          }
          waiting.delete(entry.target);
          io.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px 64px 0px" },
    );

    // Start poses that collapse to zero size or full clip never intersect,
    // so those elements watch the svg or track that holds them.
    const proxyFor = (el: Element) =>
      el instanceof SVGElement && !(el instanceof SVGSVGElement)
        ? (el.closest("svg") ?? el)
        : el.matches("[data-motion-bar], [data-motion-dot], [data-motion-mark], [data-motion-shape]")
          ? (el.parentElement ?? el)
          : el;

    const hold = (el: Element, pose: Keyframe, options: KeyframeAnimationOptions) => {
      const animation = el.animate([{ ...pose, offset: 0 }], options);
      animation.pause();
      const proxy = proxyFor(el);
      const list = waiting.get(proxy);
      if (list) list.push(animation);
      else {
        waiting.set(proxy, [animation]);
        io.observe(proxy);
      }
    };

    // Inside a box that scrolls on its own, an element can sit in the viewport
    // while clipped, so it would pop in one at a time as that box scrolls.
    const scrolls = (el: Element, cache: Map<Element, boolean>) => {
      for (let node = el.parentElement; node && node !== root; node = node.parentElement) {
        let clips = cache.get(node);
        if (clips === undefined) {
          const style = getComputedStyle(node);
          clips =
            (style.overflowX !== "visible" && node.scrollWidth > node.clientWidth + 1) ||
            (style.overflowY !== "visible" && node.scrollHeight > node.clientHeight + 1);
          cache.set(node, clips);
        }
        if (clips) return true;
      }
      return false;
    };

    let frame = 0;
    let added: Element[] = [];
    const candidates = (from: Element[]) => {
      const out: Element[] = [];
      for (const node of from) {
        if (!node.isConnected) continue;
        if (node.matches(TARGETS)) out.push(node);
        out.push(...node.querySelectorAll(TARGETS));
      }
      return out;
    };
    // All reads first, then all writes: each animate() dirties style, and a
    // read after it would force a fresh style and layout pass per element.
    const scan = (from: Element[]) => {
      const fold = window.innerHeight;
      const cache = new Map<Element, boolean>();
      const plan: Array<[Element, Keyframe, KeyframeAnimationOptions]> = [];
      for (const el of candidates(from)) {
        if (seen.has(el)) continue;
        seen.add(el);
        // Hidden elements get their @starting-style entry when they are shown.
        if (!el.checkVisibility() || el.getBoundingClientRect().top <= fold || scrolls(el, cache)) continue;
        const entry = POSES.find(([selector]) => el.matches(selector));
        if (!entry) continue;
        const style = getComputedStyle(el);
        plan.push([el, entry[1](el, style), timing(style)]);
      }
      for (const [el, pose, options] of plan) hold(el, pose, options);
    };
    const flush = () => {
      frame = 0;
      const batch = added;
      added = [];
      scan(batch);
    };
    const mo = new MutationObserver((records) => {
      for (const record of records) for (const node of record.addedNodes) if (node instanceof Element) added.push(node);
      if (added.length && !frame) frame = requestAnimationFrame(flush);
    });

    scan([root]);
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
