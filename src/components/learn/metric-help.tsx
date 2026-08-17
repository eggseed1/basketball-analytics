"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import { explainMetric } from "@/analytics/explanations";
import { getLearnConcept } from "@/content/learn/registry";
import { cn } from "@/lib/utils";

const PANEL_PAD = 8;
const PANEL_WIDTH = 288; // ~18rem

/**
 * Compact Level-1 metric/status help — hover, focus, or tap.
 * Full pedagogy lives on Learn; tooltips stay short.
 * Position is clamped to the viewport so right-edge columns (DARKO, etc.) stay on-screen.
 */
export function MetricHelp({
  conceptId,
  children,
  className,
  labelClassName,
}: {
  /** Registry id or alias (ts, trueShooting, essentially_even, …). */
  conceptId: string;
  /** Visible label; defaults to shortName. */
  children?: ReactNode;
  className?: string;
  labelClassName?: string;
}) {
  const concept = getLearnConcept(conceptId);
  const explanation = explainMetric(conceptId);
  const panelId = useId();
  const rootRef = useRef<HTMLSpanElement>(null);
  const panelRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({
    left: 0,
    top: "100%",
    marginTop: 4,
  });

  const close = useCallback(() => setOpen(false), []);

  const clampPanel = useCallback(() => {
    const root = rootRef.current;
    const panel = panelRef.current;
    if (!root || !panel) return;
    const anchor = root.getBoundingClientRect();
    const height = panel.offsetHeight || 120;
    const width = Math.min(PANEL_WIDTH, window.innerWidth - PANEL_PAD * 2);

    let left = 0;
    const rightOverflow = anchor.left + width + PANEL_PAD - window.innerWidth;
    if (rightOverflow > 0) left = -rightOverflow;
    const leftEdge = anchor.left + left;
    if (leftEdge < PANEL_PAD) left += PANEL_PAD - leftEdge;

    const spaceBelow = window.innerHeight - anchor.bottom - PANEL_PAD;
    const placeAbove = spaceBelow < height + 4 && anchor.top > height + PANEL_PAD;

    setPanelStyle(
      placeAbove
        ? {
            left,
            bottom: "100%",
            top: "auto",
            marginBottom: 4,
            marginTop: 0,
            width,
          }
        : {
            left,
            top: "100%",
            bottom: "auto",
            marginTop: 4,
            marginBottom: 0,
            width,
          }
    );
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    clampPanel();
  }, [open, clampPanel]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) close();
    }
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    function onReposition() {
      clampPanel();
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open, close, clampPanel]);

  if (!concept || !concept.showTooltip || !explanation) {
    return (
      <span className={cn(className, labelClassName)}>{children ?? conceptId}</span>
    );
  }

  const label = children ?? concept.shortName;

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setOpen((v) => !v);
    }
  }

  return (
    <span
      ref={rootRef}
      className={cn("relative inline-flex max-w-full items-center", className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className={cn(
          "inline-flex max-w-full items-baseline gap-0.5 rounded-sm text-left underline decoration-dotted decoration-muted-foreground/70 underline-offset-2 hover:decoration-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          labelClassName
        )}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`Explain ${concept.shortName}`}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onKeyDown}
        onFocus={() => setOpen(true)}
      >
        {label}
      </button>
      {open ? (
        <span
          ref={panelRef}
          id={panelId}
          role="tooltip"
          style={panelStyle}
          className="absolute z-50 max-w-[min(18rem,calc(100vw-1rem))] rounded-lg border border-border bg-card p-3 text-left shadow-md"
        >
          <span className="block text-[12px] font-bold tracking-tight text-foreground">
            {concept.label}
          </span>
          <span className="mt-1 block text-[12px] leading-snug text-muted-foreground">
            {explanation.plain}
          </span>
          {explanation.learnHref ? (
            <Link
              href={explanation.learnHref}
              className="mt-2 inline-block text-[12px] font-semibold underline-offset-2 hover:underline"
              onClick={close}
            >
              Learn more →
            </Link>
          ) : null}
        </span>
      ) : null}
    </span>
  );
}

/** Small “?” control beside a label that already has its own styling. */
export function MetricHelpIcon({
  conceptId,
  className,
}: {
  conceptId: string;
  className?: string;
}) {
  const concept = getLearnConcept(conceptId);
  if (!concept?.showTooltip) return null;
  return (
    <MetricHelp
      conceptId={conceptId}
      className={className}
      labelClassName="text-[11px] font-semibold text-muted-foreground"
    >
      <span aria-hidden>?</span>
    </MetricHelp>
  );
}
