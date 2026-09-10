"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { FrostFloatingSurface } from "@/components/brand/frost-floating-surface";
import { explainMetric } from "@/analytics/explanations";
import { getLearnConcept } from "@/content/learn/registry";
import { cn } from "@/lib/utils";

const PANEL_PAD = 8;
const PANEL_WIDTH = 288; // ~18rem

/**
 * Compact Level-1 metric/status help - hover, focus, or tap.
 * Full pedagogy lives on Learn; tooltips stay short.
 * Position is clamped to the viewport so right-edge columns (DARKO, etc.) stay on-screen.
 */
export function MetricHelp({
  conceptId,
  children,
  className,
  labelClassName,
  nestable = false,
}: {
  /** Registry id or alias (ts, trueShooting, essentially_even, …). */
  conceptId: string;
  /** Visible label; defaults to shortName. */
  children?: ReactNode;
  className?: string;
  labelClassName?: string;
  /** When true, skip focus ring behavior for use inside buttons (sort headers). */
  nestable?: boolean;
}) {
  const concept = getLearnConcept(conceptId);
  const explanation = explainMetric(conceptId);
  const panelId = useId();
  const rootRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [panelStyle, setPanelStyle] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  const close = useCallback(() => setOpen(false), []);

  function scheduleClose() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 180);
  }

  function cancelClose() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(true);
  }

  const clampPanel = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    const anchor = root.getBoundingClientRect();
    const height = 120;
    const width = Math.min(PANEL_WIDTH, window.innerWidth - PANEL_PAD * 2);

    let left = anchor.left;
    left = Math.min(
      Math.max(PANEL_PAD, left),
      window.innerWidth - width - PANEL_PAD
    );

    const spaceBelow = window.innerHeight - anchor.bottom - PANEL_PAD;
    const placeAbove =
      spaceBelow < height + 4 && anchor.top > height + PANEL_PAD;

    setPanelStyle({
      left,
      width,
      top: placeAbove
        ? Math.max(PANEL_PAD, anchor.top - 4 - height)
        : anchor.bottom + 4,
    });
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
      onMouseEnter={cancelClose}
      onMouseLeave={scheduleClose}
    >
      <button
        type="button"
        tabIndex={nestable ? -1 : undefined}
        className={cn(
          "inline-flex max-w-full items-baseline gap-0.5 rounded-sm text-left underline decoration-dotted decoration-muted-foreground/70 underline-offset-2 hover:decoration-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          nestable && "pointer-events-auto cursor-help",
          labelClassName
        )}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`Explain ${concept.shortName}`}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onKeyDown}
        onFocus={nestable ? undefined : () => setOpen(true)}
      >
        {label}
      </button>
      {open && panelStyle
        ? createPortal(
            <FrostFloatingSurface
              id={panelId}
              role="tooltip"
              className="z-50 max-w-[min(18rem,calc(100vw-1rem))] p-3 text-left"
              style={{
                position: "fixed",
                top: panelStyle.top,
                left: panelStyle.left,
                width: panelStyle.width,
              }}
              onMouseEnter={cancelClose}
              onMouseLeave={scheduleClose}
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
            </FrostFloatingSurface>,
            document.body
          )
        : null}
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
      labelClassName="text-[12px] font-semibold text-muted-foreground"
    >
      <span aria-hidden>?</span>
    </MetricHelp>
  );
}
