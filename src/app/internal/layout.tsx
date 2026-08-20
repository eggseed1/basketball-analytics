import type { ReactNode } from "react";
import { notFound } from "next/navigation";

/**
 * Internal routes — development fixtures only.
 * Never linked from production primary navigation.
 */
export default function InternalLayout({ children }: { children: ReactNode }) {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }
  return (
    <div>
      <div className="border-b border-border/60 bg-muted/40 px-4 py-2 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
        Internal · not a public release surface
      </div>
      {children}
    </div>
  );
}
