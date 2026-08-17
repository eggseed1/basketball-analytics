"use client";

import Link from "next/link";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { getStatGlossaryEntry } from "@/lib/stat-glossary";
import { cn } from "@/lib/utils";

/**
 * Dotted-underline label with a hover/focus portal tooltip for advanced stats.
 * Renders children unchanged when the key is not in the glossary.
 */
export function StatTooltip({
  stat,
  children,
  className,
  side = "bottom",
  nestable = false,
}: {
  /** Short label or metric key, e.g. "USG%" or "usagePct". */
  stat: string;
  children: ReactNode;
  className?: string;
  side?: "top" | "bottom";
  /**
   * When true, skip tabIndex so this can sit inside a button (sort headers).
   * Hover still opens the tooltip; native title remains for keyboard/context.
   */
  nestable?: boolean;
}) {
  const entry = getStatGlossaryEntry(stat);
  const tipId = useId();
  const triggerRef = useRef<HTMLSpanElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(
    null
  );
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) {
      setCoords(null);
      return;
    }
    const rect = triggerRef.current.getBoundingClientRect();
    const width = 280;
    const left = Math.min(
      Math.max(8, rect.left + rect.width / 2 - width / 2),
      window.innerWidth - width - 8
    );
    setCoords({
      top: side === "top" ? rect.top - 8 : rect.bottom + 8,
      left,
    });
  }, [open, side]);

  if (!entry) {
    return <>{children}</>;
  }

  function scheduleClose() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    // Delay close so the Learn more control stays reachable while moving the pointer.
    closeTimer.current = setTimeout(() => setOpen(false), 220);
  }

  function cancelClose() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(true);
  }

  return (
    <>
      <span
        ref={triggerRef}
        tabIndex={nestable ? undefined : 0}
        className={cn(
          "inline-flex cursor-help border-b border-dotted border-muted-foreground/50 decoration-from-font outline-none focus-visible:ring-2 focus-visible:ring-ring",
          className
        )}
        aria-describedby={open ? tipId : undefined}
        onMouseEnter={cancelClose}
        onMouseLeave={scheduleClose}
        onFocus={nestable ? undefined : cancelClose}
        onBlur={nestable ? undefined : scheduleClose}
      >
        {children}
      </span>
      {mounted &&
        open &&
        coords &&
        createPortal(
          <span
            id={tipId}
            role="tooltip"
            className={cn(
              // Interactive so Learn more is clickable; below Select (z-50).
              "fixed z-40 w-[280px] rounded-md border border-border bg-popover px-3 py-2 text-left text-xs text-popover-foreground shadow-md",
              side === "top" && "-translate-y-full"
            )}
            style={{ top: coords.top, left: coords.left }}
            onMouseEnter={cancelClose}
            onMouseLeave={scheduleClose}
          >
            <span className="block font-semibold text-foreground">
              {entry.title}
            </span>
            <span className="mt-1 block leading-snug text-muted-foreground">
              {entry.body}
            </span>
            {entry.learnMoreHref ? (
              <Link
                href={entry.learnMoreHref}
                className="mt-2 inline-flex rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium text-foreground underline-offset-2 hover:bg-muted hover:underline"
              >
                Learn more
              </Link>
            ) : null}
          </span>,
          document.body
        )}
    </>
  );
}
