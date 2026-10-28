"use client";

import { useEffect } from "react";

import { watchTableCrosshair } from "@/components/continuity/table-crosshair";

type Pose = (el: Element, style: CSSStyleDeclaration) => Keyframe;

/* A fading ancestor cuts a frosted surface off from the page behind it, so the
   blur flashes clear until the fade ends. Frosted surfaces fade themselves. */
const FROST = ".sports-card, .glass-surface, .glass-card, .frost-surface, .frost-surface-soft, .frost-surface-muted";
const CARD = ".sports-card, .glass-surface, .glass-card";
/* Marked static, or already running its own entry animation. */
const STATIC = "[data-motion-static], [data-motion-static] *, .arcade-pop";
const SECTION = [
  `[data-motion-page] > :not(.hof-page-frame, [data-motion-stack], [data-skeleton], ${STATIC}, :has(${FROST}))`,
  `:is(.hof-page-frame__inner, [data-motion-stack]):not([data-motion-static]) > :not([data-motion-stack], [data-skeleton], ${STATIC}, :has(${FROST}))`,
  // Overview / subtab SectionFrame shells — hold whole blocks for scroll even
  // when a frosted chart lives inside (the frost still fades itself).
  `[data-slot="section-frame"]:not(${STATIC})`,
  `:is(${CARD}):not(a, [data-skeleton], [data-motion-tile], ${STATIC}, [data-motion-static] *, :is(${CARD}) *)`,
].join(", ");
/**
 * First paint: anything that intersects the viewport (plus a small lead) plays
 * with CSS @starting-style. A 0.55 band left the lower first screen blank until
 * IntersectionObserver fired, which felt broken on load across engines.
 */
const EAGER_LEAD_PX = 80;
const LIST = `:is([data-motion-list] > *, :is(ul, ol):not(nav *, [role]) > li):not(${STATIC}, :has(${FROST})), [data-motion-item]:not(${STATIC})`;
const FROST_ROW = "tbody > tr:has(> .board-sticky-frost)";
/** Own entry beat — nested page motion would double-fade these. */
const OWN_ENTRY = "[data-motion-still], [data-motion-eager]";
/**
 * Force scroll hold even when the block sits in the eager band (viewport +
 * lead). Used for Overview Comparisons so Style/Impact do not fire on load.
 */
const SCROLL_HOLD = "[data-motion-scroll]";
/**
 * Chart draws (LTR line wipe, bar grow, dots). Never finish these early —
 * settling them under a hero/section shell was killing the load animation
 * that production (drbl.io) still shows.
 */
const CHART_ENTRY = [
  "[data-motion-bar]",
  "[data-motion-dot]",
  "[data-motion-mark]",
  "[data-motion-line]",
  "[data-motion-shape]",
  "[data-motion-wipe]",
  ".recharts-line",
  ".recharts-area",
  ".recharts-bar-rectangle",
  ".recharts-line-dots > *:not([data-motion-static])",
].join(", ");

/** Start poses, matched in order. They mirror the @starting-style rules in globals.css. */
const POSES: Array<[selector: string, pose: Pose]> = [
  ["[data-motion-tile]", () => ({ opacity: 0, transform: "translateY(14px) scale(0.98)" })],
  ['[data-motion="card"]', () => ({ opacity: 0, translate: "0 14px" })],
  [SECTION, () => ({ opacity: 0, translate: "0 14px" })],
  [`tbody > tr:not(:has(> .board-sticky-frost)), [data-frozen-row]`, () => ({ opacity: 0, translate: "0 8px" })],
  [FROST_ROW, () => ({ translate: "0 8px" })],
  [`${FROST_ROW} > td`, () => ({ opacity: 0 })],
  [LIST, () => ({ opacity: 0, translate: "0 8px" })],
  ['[data-motion-bar="x"]', () => ({ scale: "0 1" })],
  ['[data-motion-bar="y"], .recharts-bar-rectangle', () => ({ scale: "1 0" })],
  ["[data-motion-mark]", (_, s) => ({ left: s.getPropertyValue("--mark-from").trim() || "0%" })],
  // Line dots only — dense scatter (game mist) stays put.
  // data-motion-static: chart-owned LTR pop (career-dot-draw).
  ["[data-motion-dot], .recharts-line-dots > *:not([data-motion-static])", () => ({ scale: 0 })],
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

function isShown(el: Element): boolean {
  if (typeof el.checkVisibility === "function") {
    try {
      // Opacity must stay off: @starting-style leaves opacity 0, and treating
      // that as hidden skipped holds forever on some WebKit builds.
      return el.checkVisibility({
        checkOpacity: false,
        checkVisibilityCSS: true,
        contentVisibilityAuto: true,
      });
    } catch {
      return el.checkVisibility();
    }
  }
  const style = getComputedStyle(el);
  return style.display !== "none" && style.visibility !== "hidden";
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
          // Section shells fade first; nested line wipes wait so the LTR draw
          // isn't spent while the block is still opacity 0.
          const sectionProxy =
            entry.target instanceof Element &&
            entry.target.matches('[data-slot="section-frame"]');
          for (const animation of animations) {
            const target = (animation.effect as KeyframeEffect | null)?.target;
            const isChart =
              target instanceof Element && target.matches(CHART_ENTRY);
            const delay = Number(animation.effect?.getTiming().delay ?? 0);
            const own = chart || isChart ? delay : Math.min(delay, MAX_DELAY_MS);
            const chartLead = sectionProxy && isChart ? 280 : 0;
            animation.effect?.updateTiming({ delay: own + batchDelay + chartLead });
            animation.play();
          }
          waiting.delete(entry.target);
          io.unobserve(entry.target);
        }
      },
      { rootMargin: `0px 0px ${EAGER_LEAD_PX}px 0px`, threshold: 0 },
    );

    // Start poses that collapse to zero size or full clip never intersect,
    // so those elements watch the svg or track that holds them.
    const proxyFor = (el: Element) =>
      el instanceof SVGElement && !(el instanceof SVGSVGElement)
        ? (el.closest("svg") ?? el)
        : el.matches(`[data-motion-bar], [data-motion-dot], [data-motion-mark], [data-motion-shape], ${FROST_ROW} > td`)
          ? (el.parentElement ?? el)
          : el;

    const hold = (
      el: Element,
      pose: Keyframe,
      options: KeyframeAnimationOptions,
      proxy = proxyFor(el)
    ) => {
      const animation = el.animate([{ ...pose, offset: 0 }], options);
      animation.pause();
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
    // Viewport + lead: CSS @starting-style (page fade-up + LTR line wipe).
    // Below the fold: hold until scroll. Nested cards under a section shell are
    // finished so they don't double-fade; chart draws are left alone (or held
    // with the shell) so lines still wipe left → right like production.
    const scan = (from: Element[], initial: boolean) => {
      const fold = window.innerHeight + EAGER_LEAD_PX;
      const cache = new Map<Element, Clip | null>();
      const plan: Array<
        [Element, Keyframe, KeyframeAnimationOptions, Element | undefined]
      > = [];
      const settle: Animation[] = [];
      let transitions: Map<Element, Animation[]> | undefined;
      const entryTransitions = (el: Element) => (transitions ??= transitionsByTarget()).get(el) ?? [];
      const planEntry = (el: Element) => {
        const entry = POSES.find(([selector]) => el.matches(selector));
        if (!entry) return null;
        const style = getComputedStyle(el);
        return [el, entry[1](el, style), timing(style)] as const;
      };
      for (const el of candidates(from)) {
        if (seen.has(el)) {
          if (!initial && !el.matches(CHART_ENTRY)) {
            settle.push(...entryTransitions(el));
          }
          continue;
        }
        // Still inside a hidden Suspense slot (or otherwise not shown): leave
        // unmarked so a later reveal can run the entry. Marking them seen here
        // left whole routes at opacity 0 after $RC swapped loading → page.
        if (!isShown(el)) continue;
        // Own draw clocks (career line dots) — don't stack a second scale hold.
        if (el.matches(STATIC) || el.closest("[data-motion-static]")) {
          seen.add(el);
          continue;
        }
        // Career filter wipe owns clip-path; page holds jittered metric switches.
        if (el.closest("[data-career-chart]")) {
          seen.add(el);
          continue;
        }
        seen.add(el);

        const chart = el.matches(CHART_ENTRY);
        const scrollHold = !!el.closest(SCROLL_HOLD);

        // Own-entry shells (hero) — CSS entry on the shell. Nested layout
        // fades are finished; chart wipes keep running.
        // Page-level eager (home) means "don't hold for scroll" only — finishing
        // nested transitions here snapped cards to opacity 1 and killed the
        // @starting-style fade, especially on soft-nav back to /.
        const own = el.closest(OWN_ENTRY);
        if (own) {
          const pageLevelEager = own.matches(
            "[data-motion-page][data-motion-eager]"
          );
          if (own !== el && !chart && !pageLevelEager) {
            settle.push(...entryTransitions(el));
          }
          continue;
        }

        // Section frames fade as one block. Nested cards/rows finish so they
        // do not stack another fade. Chart draws hold with the section when
        // it is below the fold (or marked scroll-hold), or play with CSS when
        // the section is eager.
        const frameEl = el.closest('[data-slot="section-frame"]');
        if (frameEl && frameEl !== el) {
          if (chart) {
            const frameTop = frameEl.getBoundingClientRect().top;
            const frameScrollHold = frameEl.matches(SCROLL_HOLD);
            if (
              (!frameScrollHold && frameTop <= fold) ||
              clippedOut(el, cache)
            ) {
              continue;
            }
            const planned = planEntry(el);
            if (planned) {
              settle.push(...entryTransitions(el));
              plan.push([...planned, frameEl]);
            }
          } else {
            settle.push(...entryTransitions(el));
          }
          continue;
        }

        const top = el.getBoundingClientRect().top;
        // Eager: on-screen (and slightly below) play CSS. Scroll-hold blocks
        // always wait for IntersectionObserver. Clipped horizontal scroller
        // cells are left alone so sideways scroll does not pop rows.
        if ((!scrollHold && top <= fold) || clippedOut(el, cache)) {
          continue;
        }

        const planned = planEntry(el);
        if (!planned) continue;
        settle.push(...entryTransitions(el));
        plan.push([...planned, undefined]);
      }
      for (const transition of settle) transition.finish();
      for (const [el, pose, options, proxy] of plan) {
        hold(el, pose, options, proxy);
      }
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

    // Streamed routes park the real page in <div hidden id="S:…"> until $RC
    // runs. That is an attribute flip, not a childList mutation, so re-scan
    // when hidden ancestors clear.
    let revealFrame = 0;
    const revealMo = new MutationObserver(() => {
      if (!root.isConnected) return;
      if (!revealFrame) {
        revealFrame = requestAnimationFrame(() => {
          revealFrame = 0;
          scan([root], false);
        });
      }
    });
    revealMo.observe(document.documentElement, {
      subtree: true,
      attributes: true,
      attributeFilter: ["hidden"],
    });

    // Resize / rotate can move held nodes into view without an IO delivery on
    // some mobile WebViews — nudge any waiting proxy that is already on screen.
    const onViewport = () => {
      const edge = window.innerHeight + EAGER_LEAD_PX;
      for (const [proxy, animations] of waiting) {
        if (!proxy.isConnected) continue;
        const top = proxy.getBoundingClientRect().top;
        if (top > edge) continue;
        for (const animation of animations) animation.play();
        waiting.delete(proxy);
        io.unobserve(proxy);
      }
    };
    window.addEventListener("resize", onViewport, { passive: true });
    window.addEventListener("orientationchange", onViewport, { passive: true });

    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(revealFrame);
      mo.disconnect();
      revealMo.disconnect();
      io.disconnect();
      window.removeEventListener("resize", onViewport);
      window.removeEventListener("orientationchange", onViewport);
      for (const list of waiting.values()) for (const animation of list) animation.cancel();
    };
  }, []);

  return null;
}
