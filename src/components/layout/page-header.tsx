import type { ReactNode } from "react";

import { MoreInfo } from "@/components/ui/more-info";
import { cn } from "@/lib/utils";
import { type } from "@/lib/design-system";

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  meta,
  about,
  aboutLabel,
  actions,
  tabs,
  className,
  children,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  meta?: ReactNode;
  /** Method and source notes, collapsed until the reader asks for them. */
  about?: ReactNode;
  aboutLabel?: ReactNode;
  actions?: ReactNode;
  tabs?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <header
      data-slot="page-header"
      className={cn("flex flex-col gap-3 sm:gap-4", className)}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex flex-col gap-1.5">
          {eyebrow ? (
            <p className="type-caption font-semibold uppercase tracking-wide text-muted-foreground">
              {eyebrow}
            </p>
          ) : null}
          <h1 className={cn(type.title1, "min-w-0 wrap-break-word")}>
            {title}
          </h1>
          {subtitle ? (
            <p className={cn(type.bodySm, "text-muted-foreground")}>{subtitle}</p>
          ) : null}
          {meta ? (
            <div className={cn(type.caption, "flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground")}>
              {meta}
            </div>
          ) : null}
          {about ? <MoreInfo summary={aboutLabel}>{about}</MoreInfo> : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
      {tabs}
      {children}
    </header>
  );
}

export function SectionHeader({
  title,
  description,
  about,
  aboutLabel,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  about?: ReactNode;
  aboutLabel?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-slot="section-header"
      className={cn(
        "flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between",
        className
      )}
    >
      <div className="min-w-0 flex flex-col gap-1">
        <h2 className={type.heading}>{title}</h2>
        {description ? (
          <p className={cn(type.bodySm, "max-w-2xl text-muted-foreground")}>
            {description}
          </p>
        ) : null}
        {about ? <MoreInfo summary={aboutLabel}>{about}</MoreInfo> : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
