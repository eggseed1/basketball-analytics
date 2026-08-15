import Link from "next/link";
import type { ComponentProps, MouseEventHandler, ReactNode } from "react";

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
  prefetch?: ComponentProps<typeof Link>["prefetch"];
};

/**
 * Single navigation path for every href:
 * - external → browser <a> only (never Next.js router)
 * - hash → plain <a>
 * - internal → next/link
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

  // Internal — Next.js client navigation only (one path).
  return (
    <Link
      href={href}
      className={cn(className)}
      onClick={onClick}
      prefetch={prefetch}
      data-nav="internal"
      {...rest}
    >
      {children}
    </Link>
  );
}

/** True when AppLink would render next/link (not a plain <a>). */
export function appLinkUsesNextRouter(href: string): boolean {
  return linkNavigationKind(href) === "internal";
}
