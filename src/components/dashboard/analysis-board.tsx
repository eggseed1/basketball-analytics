import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Contour/Quiver-style analysis board chrome: flat border, dense header,
 * optional active-filter footer.
 */
export function AnalysisBoard({
  title,
  subtitle,
  active,
  footer,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  active?: boolean;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "flex flex-col border bg-card",
        active ? "border-foreground/60" : "border-border",
        className
      )}
    >
      <header className="flex flex-col gap-0.5 border-b border-border px-3 py-2">
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        {subtitle ? (
          <p className="text-[12px] text-muted-foreground">{subtitle}</p>
        ) : null}
      </header>
      <div className="min-h-0 flex-1 p-2">{children}</div>
      {footer ? (
        <footer className="border-t border-border bg-muted/30 px-3 py-1.5 text-[12px] text-muted-foreground">
          {footer}
        </footer>
      ) : null}
    </section>
  );
}
