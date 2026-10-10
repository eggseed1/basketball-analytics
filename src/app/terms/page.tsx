import { MotionReveal } from "@/components/continuity/motion-reveal";
import Link from "next/link";
import type { ReactNode } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { type } from "@/lib/design-system";
import { SITE_CONTACT_URL } from "@/lib/site-url";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "Terms",
  description: "The ground rules for using this site and what its numbers can and can't tell you.",
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex max-w-2xl flex-col gap-2">
      <h2 className={type.heading}>{title}</h2>
      <div className={cn(type.bodySm, "flex flex-col gap-2 text-muted-foreground")}>{children}</div>
    </section>
  );
}

export default function TermsPage() {
  return (
    <main data-motion-page className="site-shell flex flex-col gap-8 py-6 sm:py-8">
      <MotionReveal />
      <PageHeader
        eyebrow="Terms"
        title="Terms of use"
        subtitle="Updated October 10, 2026. Using the site means you accept these terms."
      />

      <Section title="Using the site">
        <p>
          The site is free and non-commercial, for personal and informational use. Please don&apos;t
          scrape it at volume, overload it or try to get around its rate limits. Automated requests
          that slow the site down for everyone else may be blocked.
        </p>
      </Section>

      <Section title="Accuracy">
        <p>
          Stats, ratings and estimates here are computed automatically. They can be wrong, late or
          incomplete, and models like DRBL are estimates with real uncertainty. When a value is
          missing the site leaves it blank rather than showing 0, and it never invents data to fill
          a gap.
        </p>
        <p>
          Nothing on the site is betting, financial or medical advice. Don&apos;t rely on it for
          decisions where an error would cost you.
        </p>
      </Section>

      <Section title="Trademarks">
        <p>
          This site is not affiliated with or endorsed by the NBA, any of its teams or any player.
          Team names, logos and player images belong to their owners and appear only to identify the
          teams and players being discussed. If you own one of them and want it taken down,{" "}
          <a href={SITE_CONTACT_URL} className="underline underline-offset-2" target="_blank" rel="noreferrer">
            open a removal request
          </a>{" "}
          and we&apos;ll remove it.
        </p>
      </Section>

      <Section title="Fan sentiment">
        <p>
          The <Link href="/sentiment" className="underline underline-offset-2">sentiment pages</Link>{" "}
          show averages of public fan writing. They reflect what fans wrote, not our views, and a
          tone score is not a judgment of any person. The{" "}
          <Link href="/privacy" className="underline underline-offset-2">privacy page</Link> explains
          what is kept.
        </p>
      </Section>

      <Section title="Sharing">
        <p>
          You&apos;re welcome to quote numbers and share charts from the site. Please link back to
          the page you took them from.
        </p>
      </Section>

      <Section title="Availability and liability">
        <p>
          The site is provided as is, with no warranty of any kind. Features and numbers can change,
          and the site can go offline at any time. We are not liable for losses that come from using
          it or from relying on anything it shows.
        </p>
      </Section>

      <Section title="Contact and removal requests">
        <p>
          Questions, corrections and removal requests from rights holders go to the{" "}
          <a href={SITE_CONTACT_URL} className="underline underline-offset-2" target="_blank" rel="noreferrer">
            project&apos;s GitHub issues
          </a>
          . We may update these terms, and the date at the top shows the latest change.
        </p>
      </Section>
    </main>
  );
}
