"use client";

import type { ComponentProps, ReactNode } from "react";

import { AppLink } from "@/components/ui/app-link";
import { LinkCue } from "@/components/ui/link-cue";
import { sectionLinkClassName } from "@/lib/design-system";
import { cn } from "@/lib/utils";

type Props = {
  href: string;
  children: ReactNode;
  className?: string;
  prefetch?: ComponentProps<typeof AppLink>["prefetch"];
  scroll?: boolean;
};

/** Section header action: "See all schedule". One size, one chevron. */
export function SectionLink({ href, children, className, prefetch, scroll }: Props) {
  return (
    <AppLink href={href} prefetch={prefetch} scroll={scroll} className={cn("type-caption shrink-0", sectionLinkClassName, className)}>
      {children}
      <LinkCue className="size-3" strokeWidth={1.75} />
    </AppLink>
  );
}

/** Page back link: chevron, then the place you return to. */
export function BackLink({ href, children, className, prefetch, scroll }: Props) {
  return (
    <AppLink href={href} prefetch={prefetch} scroll={scroll} className={cn("type-caption shrink-0", sectionLinkClassName, className)}>
      <LinkCue direction="back" className="size-3" strokeWidth={1.75} />
      {children}
    </AppLink>
  );
}
