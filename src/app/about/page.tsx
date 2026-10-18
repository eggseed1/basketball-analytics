import { MotionReveal } from "@/components/continuity/motion-reveal";
import Link from "next/link";
import type { ReactNode } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "About",
  description: "Mason Anapolle and Hannah Park made and designed this site. Mason Anapolle created the original statistics.",
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex max-w-2xl flex-col gap-2">
      <h2 className={type.heading}>{title}</h2>
      <div className={cn(type.bodySm, "flex flex-col gap-2 text-muted-foreground")}>{children}</div>
    </section>
  );
}

const linkClass = "underline underline-offset-2 hover:text-foreground";

export default function AboutPage() {
  return (
    <main data-motion-page className="site-shell flex flex-col gap-8 py-6 sm:py-8">
      <MotionReveal />
      <PageHeader
        title="How this site was made"
        subtitle="Mason Anapolle and Hannah Park made the site and designed it."
      />

      <Section title="Original statistics">
        <p>
          Mason Anapolle created the original statistics published here. That includes{" "}
          <Link href="/learn/drbl" className={linkClass}>
            DRBL
          </Link>
          , DRBL/100, the DRBL component splits, and{" "}
          <Link href="/learn/drbl/war1" className={linkClass}>
            WAR1
          </Link>
          . The Learn pages spell out the definitions.
        </p>
        <p>
          DARKO, RAPTOR, and the league tables the site uses are other people&apos;s work. The{" "}
          <Link href="/sources" className={linkClass}>
            sources page
          </Link>{" "}
          lists where those come from.
        </p>
      </Section>
    </main>
  );
}
