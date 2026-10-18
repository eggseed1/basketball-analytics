"use client";

import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, type MouseEvent, type ReactNode } from "react";

import { AppLink } from "@/components/ui/app-link";

const FLIP_KEY = "insight-flip";

type Flip = {
  name: string;
  left: number;
  top: number;
  width: number;
  height: number;
  t: number;
};

function readFlip(name: string): Flip | null {
  const raw = sessionStorage.getItem(FLIP_KEY);
  if (!raw) return null;
  try {
    const flip = JSON.parse(raw) as Flip;
    if (flip.name !== name || Date.now() - flip.t > 5000) return null;
    return flip;
  } catch {
    return null;
  }
}

function rememberFlip(name: string) {
  const node = document.querySelector<HTMLElement>(`[data-insight-morph="${CSS.escape(name)}"]`);
  const rect = node?.getBoundingClientRect();
  if (!rect || rect.width < 2 || rect.height < 2) return;
  const flip: Flip = {
    name,
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
    t: Date.now(),
  };
  sessionStorage.setItem(FLIP_KEY, JSON.stringify(flip));
}

/** The chart grows from the card's rectangle into the detail page, and back. */
export function InsightMorph({ name, children }: { name: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const flip = readFlip(name);
    if (!flip || reduced) return;
    sessionStorage.removeItem(FLIP_KEY);
    const next = node.getBoundingClientRect();
    if (next.width < 2 || next.height < 2) return;
    const scale = flip.width / next.width;
    if (!Number.isFinite(scale) || scale <= 0) return;
    const dx = flip.left - next.left;
    const dy = flip.top - next.top;
    node.style.transformOrigin = "0 0";
    const animation = node.animate(
      [
        { transform: `translate(${dx}px, ${dy}px) scale(${scale})` },
        { transform: "translate(0px, 0px) scale(1)" },
      ],
      { duration: 560, easing: "cubic-bezier(0.16, 1, 0.3, 1)", fill: "both" }
    );
    const finish = () => {
      node.style.transformOrigin = "";
    };
    animation.finished.then(finish, finish);
  }, [name]);
  return (
    <div ref={ref} data-insight-morph={name} className="min-w-0">
      {children}
    </div>
  );
}

function morphClick(name: string, href: string, push: (href: string) => void) {
  return (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) rememberFlip(name);
    push(href);
  };
}

export function InsightCardLink({
  href,
  name,
  label,
}: {
  href: string;
  name: string;
  label: string;
}) {
  const router = useRouter();
  useEffect(() => {
    void router.prefetch(href);
  }, [href, router]);
  return (
    <AppLink
      href={href}
      aria-label={label}
      className="absolute inset-0 z-[1] rounded-[8px]"
      onClick={morphClick(name, href, (next) => router.push(next))}
    >
      {null}
    </AppLink>
  );
}

export function InsightReturnLink({
  href,
  name,
  className,
  children,
}: {
  href: string;
  name: string;
  className?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  useEffect(() => {
    void router.prefetch(href);
  }, [href, router]);
  return (
    <AppLink href={href} className={className} onClick={morphClick(name, href, (next) => router.push(next))}>
      {children}
    </AppLink>
  );
}
