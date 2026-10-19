import { MotionReveal } from "@/components/continuity/motion-reveal";
import Link from "next/link";
import type { ReactNode } from "react";

import { SuggestionBox } from "@/components/about/suggestion-box";
import { PageHeader } from "@/components/layout/page-header";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "About",
  description:
    "Mason Anapolle and Hannah Park made DRBL so NBA analytics are readable and fun for fans. Mason created DRBL, DRBL/100, and WAR1.",
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
        title="About"
        subtitle="Mason Anapolle and Hannah Park made the site and designed it. Mason created the original statistics."
      />

      <Section title="Why this exists">
        <p>
          NBA teams have moved a lot of the job onto numbers. Rotations, trades, and contracts get argued with tracking data, lineup stats, and public ratings. A broadcast will show one of those numbers for a few seconds. Most of the rest still lives in papers and in tools built for people who are paid to read them.
        </p>
        <p>
          We wanted that kind of thinking somewhere a fan can actually use it. A player page should make sense on a Tuesday night, with the definition sitting next to the number. And some of it should be fun to poke at, because arguing about basketball already is.
        </p>
      </Section>

      <Section title="What that looks like here">
        <p>
          Player and team pages put{" "}
          <Link href="/learn/drbl" className={linkClass}>
            DRBL
          </Link>{" "}
          beside the counting stats, and the{" "}
          <Link href="/learn" className={linkClass}>
            Learn
          </Link>{" "}
          pages say what each rating is measuring. If a number is missing, the page says so. It does not print a zero and hope you will not notice.
        </p>
        <p>
          The{" "}
          <Link href="/arcade" className={linkClass}>
            arcade
          </Link>{" "}
          is the same numbers as a game: a daily puzzle, higher or lower, a career you play from scratch.{" "}
          <Link href="/gm" className={linkClass}>
            Franchise Lab
          </Link>{" "}
          is a season you can run with real rosters. You set the minutes, the night comes back as a box score, and the ratings are the ones on the rest of the site.
        </p>
      </Section>

      <Section title="Suggestions">
        <p>
          If something is missing, or a page is hard to use, say so. That is how we decide what to build next.
        </p>
        <SuggestionBox />
      </Section>

      <Section title="Original statistics">
        <p>
          Mason Anapolle created the original statistics published here. That includes{" "}
          <Link href="/learn/drbl" className={linkClass}>DRBL</Link>, DRBL/100, the DRBL
          component splits, and <Link href="/learn/drbl/war1" className={linkClass}>WAR1</Link>.
          The Learn pages spell out the definitions.
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
