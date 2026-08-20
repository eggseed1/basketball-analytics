import { notFound } from "next/navigation";

import { FrostFloatingSurface } from "@/components/brand/frost-floating-surface";
import { GlassSurface } from "@/components/brand/glass-surface";
import {
  CapabilityStateBadge,
  CapabilityStatePanel,
  NullDisplay,
} from "@/components/design-system/capability-state";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

/**
 * Dev-only design foundation fixture.
 * Not linked from production navigation.
 */
export default function DesignSystemLabPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return (
    <div className="site-shell space-y-8 py-8">
      <header className="space-y-2">
        <p className={cn(type.caption, "text-muted-foreground")}>
          Internal · MERGE.1 foundation
        </p>
        <h1 className={type.display}>Design system lab</h1>
        <p className={cn(type.body, "max-w-2xl text-muted-foreground")}>
          Visual QA for tokens, glass/frost, controls, tables, and capability
          states. Not a public release surface.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className={type.heading}>Surfaces</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-md border border-border bg-background p-4">
            <p className={type.title}>Base</p>
            <p className={type.bodySm}>Page background sample</p>
          </div>
          <div className="sports-card p-4">
            <p className={type.title}>Raised / sports-card</p>
            <p className={cn(type.bodySm, "text-muted-foreground")}>
              Secondary text on glass
            </p>
          </div>
          <GlassSurface className="p-4">
            <p className={type.title}>GlassSurface</p>
            <p className={cn(type.bodySm, "text-muted-foreground")}>
              CSS-only frost panel
            </p>
          </GlassSurface>
        </div>
        <FrostFloatingSurface className="inline-block p-3">
          <span className={type.bodySm}>Frost floating sample</span>
        </FrostFloatingSurface>
      </section>

      <section className="space-y-3">
        <h2 className={type.heading}>Typography</h2>
        <div className="sports-card space-y-1 p-4">
          <p className={type.display}>Display</p>
          <p className={type.page}>Page title</p>
          <p className={type.heading}>Section title</p>
          <p className={type.title}>Title</p>
          <p className={type.body}>Body copy for dense basketball analytics.</p>
          <p className={type.bodySm}>Small body</p>
          <p className={type.caption}>Caption / meta</p>
          <p className="score-num text-[28px]">112.4</p>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className={type.heading}>Controls</h2>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-md bg-foreground px-3 py-1.5 text-[14px] font-semibold text-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Primary
          </button>
          <button
            type="button"
            className="sports-pill focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Pill
          </button>
          <button
            type="button"
            className="glass-pill rounded-md px-3 py-1.5 text-[14px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Glass pill
          </button>
          <span className="glass-pill glass-pill-active rounded-md px-3 py-1.5 text-[14px] font-semibold">
            Active tab
          </span>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className={type.heading}>Table foundation</h2>
        <div className="sports-card board-scroll-host overflow-x-auto">
          <table className="w-full min-w-[28rem] text-left text-[14px]">
            <thead>
              <tr className="border-b border-border/60">
                <th className="board-sticky-frost sticky left-0 px-3 py-2">
                  Player
                </th>
                <th className="px-3 py-2 text-right tabular-nums">PTS</th>
                <th className="px-3 py-2 text-right tabular-nums">DRBL/100</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border/40 hover:bg-secondary/40">
                <td className="board-sticky-frost sticky left-0 px-3 py-2 font-semibold">
                  Sample
                </td>
                <td className="px-3 py-2 text-right tabular-nums">25.8</td>
                <td className="px-3 py-2 text-right">
                  <NullDisplay kind="unavailable" />
                </td>
              </tr>
              <tr>
                <td className="board-sticky-frost sticky left-0 px-3 py-2 font-semibold">
                  Zero vs dash
                </td>
                <td className="px-3 py-2 text-right">
                  <NullDisplay kind="zero" />
                </td>
                <td className="px-3 py-2 text-right">
                  <NullDisplay kind="dash" />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className={type.heading}>Capability states</h2>
        <div className="flex flex-wrap gap-2">
          <CapabilityStateBadge kind="supported" />
          <CapabilityStateBadge kind="partial" />
          <CapabilityStateBadge kind="unavailable" />
          <CapabilityStateBadge kind="empty" />
        </div>
        <CapabilityStatePanel
          kind="partial"
          title="Payroll"
          description="Source horizon 1 season. Guarantees and options UNKNOWN."
        />
        <CapabilityStatePanel
          kind="unavailable"
          title="Draft assets"
          description="Schema ready; product data unavailable — not zero ownership."
        />
      </section>
    </div>
  );
}
