"use client";

import { useEffect } from "react";

import { watchTableCrosshair } from "@/components/continuity/table-crosshair";

type Pose = (el: Element, style: CSSStyleDeclaration) => Keyframe;

/* A fading ancestor cuts a frosted surface off from the page behind it, so the
   blur flashes clear until the fade ends. Frosted surfaces fade themselves. */
const FROST = ".sports-card, .glass-surface, .glass-card, .frost-surface, .frost-surface-soft, .frost-surface-muted";
const CARD = ".sports-card, .glass-surface, .glass-card";
/* Marked static, or already running its own entry animation. */
const STATIC = "[data-motion-static], .arcade-pop";
const SECTION = [
  `[data-motion-page] > :not(.hof-page-frame, [data-motion-stack], [data-skeleton], ${STATIC}, :has(${FROST}))`,
  `:is(.hof-page-frame__inner, [data-motion-stack]) > :not([data-motion-stack], [data-skeleton], ${STATIC}, :has(${FROST}))`,
  `:is(${CARD}):not(a, [data-skeleton], [data-motion-tile], ${STATIC}, [data-motion-static] *, :is(${CARD}) *)`,
].join(", ");
const LIST = `:is([data-motion-list] > *, :is(ul, ol):not(nav *, [role]) > li):not(${STATIC}, :has(${FROST})), [data-motion-item]:not(${STATIC})`;
const FROST_ROW = "tbody > tr:has(> .board-sticky-frost)";

/** Start poses, matched in order. They mirror the @starting-style rules in globals.css. */
const POSES: Array<[selector: string, pose: Pose]> = [
  ["[data-motion-tile]", () => ({ opacity: 0, transform: "translateY(14px) scale(0.98)" })],
  [SECTION, () => ({ opacity: 0, translate: "0 14px" })],
  [`tbody > tr:not(:has(> .board-sticky-frost)), [data-frozen-row]`, () => ({ opacity: 0, translate: "0 8px" })],
  [FROST_ROW, () => ({ translate: "0 8px" })],
  [`${FROST_ROW} > td`, () => ({ opacity: 0 })],
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
/** Same beat and cap as the CSS list stagger (`--n * 45ms`, `--n` ≤ 12). */
const BATCH_STEP_MS = 45;
const BATCH_MAX_STEPS = 12;

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
    const root = document.querySelector("[data-motion-page]");
    return root ? watchTableCrosshair(root) : undefined;
  }, []);

  useEffect(() => {
    const root = document.querySelector<HTMLElement>("[data-motion-page]");
    if (!root || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const seen = new WeakSet<Element>();
    const waiting = new Map<Element, Animation[]>();
    // The CSS stagger counts from the top of a list, so row 40 would wait most
    // of a second after scrolling in. Here the stagger restarts with each batch
    // that enters together, and the CSS delay only keeps its first beat. Marks
    // inside one chart share a target and keep their own CSS sequence. Targets
    // on one visual line (a frozen name and its stats row) share a beat.
    const io = new IntersectionObserver(
      (entries) => {
        const entering = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top || a.boundingClientRect.left - b.boundingClientRect.left);
        let k = -1;
        let lineTop = Number.NEGATIVE_INFINITY;
        for (const entry of entering) {
          if (entry.boundingClientRect.top - lineTop > 4) {
            k += 1;
            lineTop = entry.boundingClientRect.top;
          }
          const animations = waiting.get(entry.target) ?? [];
          const batchDelay = Math.min(k, BATCH_MAX_STEPS) * BATCH_STEP_MS;
          const chart = animations.length > 1 && !(entry.target instanceof HTMLTableRowElement);
          for (const animation of animations) {
            const delay = Number(animation.effect?.getTiming().delay ?? 0);
            const own = chart ? delay : Math.min(delay, MAX_DELAY_MS);
            animation.effect?.updateTiming({ delay: own + batchDelay });
            animation.play();
          }
          waiting.delete(entry.target);
          io.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px 64px 0px" },
    );

    // Start poses that collapse to zero size or full clip never intersect,
    // so those elements watch the svg or track that holds them.
    const proxyFor = (el: Element) =>
      el instanceof SVGElement && !(el instanceof SVGSVGElement)
        ? (el.closest("svg") ?? el)
        : el.matches(`[data-motion-bar], [data-motion-dot], [data-motion-mark], [data-motion-shape], ${FROST_ROW} > td`)
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

    // Inside a box that scrolls on its own, an element clipped out of that box
    // would pop in one at a time as the box scrolls, so it is left alone. A
    // table row in a sideways scroller still shows its start, so it is held.
    type Clip = { x: boolean; y: boolean; box: DOMRect };
    const clippedOut = (el: Element, cache: Map<Element, Clip | null>) => {
      let rect: DOMRect | undefined;
      for (let node = el.parentElement; node && node !== root; node = node.parentElement) {
        let clip = cache.get(node);
        if (clip === undefined) {
          const style = getComputedStyle(node);
          const x = style.overflowX !== "visible" && node.scrollWidth > node.clientWidth + 1;
          const y = style.overflowY !== "visible" && node.scrollHeight > node.clientHeight + 1;
          clip = x || y ? { x, y, box: node.getBoundingClientRect() } : null;
          cache.set(node, clip);
        }
        if (!clip) continue;
        rect ??= el.getBoundingClientRect();
        if (clip.x && (rect.right <= clip.box.left || rect.left >= clip.box.right)) return true;
        if (clip.y && (rect.bottom <= clip.box.top || rect.top >= clip.box.bottom)) return true;
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
    // Element.getAnimations() walks every animation in the document, so one
    // document-wide pass per scan is indexed by target instead.
    const transitionsByTarget = () => {
      const out = new Map<Element, Animation[]>();
      for (const a of document.getAnimations()) {
        if (!(a instanceof CSSTransition)) continue;
        const target = (a.effect as KeyframeEffect | null)?.target;
        if (!target) continue;
        const list = out.get(target);
        if (list) list.push(a);
        else out.set(target, [a]);
      }
      return out;
    };
    // All reads first, then all writes: each animate() dirties style, and a
    // read after it would force a fresh style and layout pass per element.
    // On first paint the CSS stagger already runs in order above the fold.
    // Later content (streamed, appended, filtered) is held even in view, so a
    // batch of new rows staggers from its own top, not from row 40's slot. A
    // node React only moved (a sort) gets @starting-style again, so its entry
    // is finished at once.
    const scan = (from: Element[], initial: boolean) => {
      const fold = window.innerHeight;
      const cache = new Map<Element, Clip | null>();
      const plan: Array<[Element, Keyframe, KeyframeAnimationOptions]> = [];
      const settle: Animation[] = [];
      let transitions: Map<Element, Animation[]> | undefined;
      const entryTransitions = (el: Element) => (transitions ??= transitionsByTarget()).get(el) ?? [];
      for (const el of candidates(from)) {
        if (seen.has(el)) {
          if (!initial) settle.push(...entryTransitions(el));
          continue;
        }
        seen.add(el);
        // Hidden elements get their @starting-style entry when they are shown.
        // [data-motion-still] keeps its mount entry but is never held for scroll.
        if (el.closest("[data-motion-still]") || !el.checkVisibility() || (initial && el.getBoundingClientRect().top <= fold) || clippedOut(el, cache)) continue;
        const entry = POSES.find(([selector]) => el.matches(selector));
        if (!entry) continue;
        const style = getComputedStyle(el);
        plan.push([el, entry[1](el, style), timing(style)]);
        settle.push(...entryTransitions(el));
      }
      for (const transition of settle) transition.finish();
      for (const [el, pose, options] of plan) hold(el, pose, options);
    };
    const flush = () => {
      frame = 0;
      const batch = added;
      added = [];
      scan(batch, false);
    };
    const mo = new MutationObserver((records) => {
      for (const record of records) for (const node of record.addedNodes) if (node instanceof Element) added.push(node);
      if (added.length && !frame) frame = requestAnimationFrame(flush);
    });

    scan([root], true);
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
