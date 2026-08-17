"use client";

import type { ComponentProps, MouseEventHandler, ReactNode } from "react";

import { TransitionLink } from "@/components/continuity/query-nav";
import { isHashHref, linkNavigationKind } from "@/lib/navigation";
import { cn } from "@/lib/utils";

type AppLinkProps = {
  href: string;
  children: ReactNode;
  className?: string;
  /**
   * External links open in a new tab by default (news, watch providers).
   * Pass false to navigate in the same tab.
   */
  newTab?: boolean;
  target?: ComponentProps<"a">["target"];
  rel?: ComponentProps<"a">["rel"];
  onClick?: MouseEventHandler<HTMLAnchorElement>;
  /** Optional accessibility label. */
  "aria-label"?: string;
  title?: string;
  prefetch?: ComponentProps<typeof TransitionLink>["prefetch"];
  /** Cross-route default true; in-place query changes pass false. */
  scroll?: boolean;
};

/**
 * Single navigation path for every href:
 * - external → browser <a> only (never Next.js router)
 * - hash → plain <a>
 * - internal → TransitionLink (soft nav, keeps site shell)
 *
 * Does not add a second onClick navigation. Modifier-clicks use the browser.
 */
export function AppLink({
  href,
  children,
  className,
  newTab,
  target,
  rel,
  onClick,
  prefetch,
  scroll = true,
  ...rest
}: AppLinkProps) {
  const kind = linkNavigationKind(href);

  if (kind === "external") {
    const openNew = newTab ?? true;
    return (
      <a
        href={href}
        className={cn(className)}
        target={target ?? (openNew ? "_blank" : undefined)}
        rel={
          rel ??
          (openNew || target === "_blank" ? "noopener noreferrer" : undefined)
        }
        onClick={onClick}
        data-nav="external"
        {...rest}
      >
        {children}
      </a>
    );
  }

  if (kind === "hash" || isHashHref(href)) {
    return (
      <a
        href={href}
        className={cn(className)}
        onClick={onClick}
        data-nav="hash"
        {...rest}
      >
        {children}
      </a>
    );
  }

  // Internal — soft client navigation (one path).
  return (
    <TransitionLink
      href={href}
      className={cn(className)}
      onClick={onClick}
      prefetch={prefetch}
      scroll={scroll}
      data-nav="internal"
      {...rest}
    >
      {children}
    </TransitionLink>
  );
}

/** True when AppLink would render next/link (not a plain <a>). */
export function appLinkUsesNextRouter(href: string): boolean {
  return linkNavigationKind(href) === "internal";
}
