"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import { explainMetric } from "@/analytics/explanations";
import { getLearnConcept } from "@/content/learn/registry";
import { cn } from "@/lib/utils";

/**
 * Compact Level-1 metric/status help — hover, focus, or tap.
 * Full pedagogy lives on Learn; tooltips stay short.
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
  const [open, setOpen] = useState(false);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) close();
    }
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

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
          id={panelId}
          role="tooltip"
          className="absolute left-0 top-full z-40 mt-1 w-[min(18rem,calc(100vw-2rem))] rounded-lg border border-border bg-card p-3 text-left shadow-md"
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
    <MetricHelp conceptId={conceptId} className={className} labelClassName="text-[11px] font-semibold text-muted-foreground">
      <span aria-hidden>?</span>
    </MetricHelp>
  );
}
