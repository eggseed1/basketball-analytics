import Link from "next/link";
import type { ReactNode } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "Privacy",
  description: "What this site stores about visitors and what it keeps from public posts it reads.",
};

const CONTACT_URL = "https://github.com/eggseed1/basketball-analytics/issues";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex max-w-2xl flex-col gap-2">
      <h2 className={type.heading}>{title}</h2>
      <div className={cn(type.bodySm, "flex flex-col gap-2 text-muted-foreground")}>{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <main className="site-shell flex flex-col gap-8 py-6 sm:py-8">
      <PageHeader
        eyebrow="Privacy"
        title="Privacy"
        subtitle="Updated October 4, 2026. This is a free, non-commercial NBA stats site with no accounts and no ads."
      />

      <Section title="What we collect about you">
        <p>
          No personal information. The site has no sign-in, no analytics or tracking scripts, no ad
          networks and no cookies of its own. Questions you type into Ask DRBL go to the server to
          be answered and are not saved there.
        </p>
        <p>
          A few settings are saved in your browser&apos;s local storage so they survive a reload:
          light or dark theme, your watchlist, your recent Ask DRBL questions and the location you
          typed for game-watch options. They stay on your device, and clearing site data in your
          browser removes them.
        </p>
        <p>
          The site runs on Cloudflare, which handles each request the way any web host does. We
          do not log individual requests. When something breaks, the server keeps the error
          message and the player, team or season involved for up to 7 days so we can fix it. Those
          logs do not include IP addresses or anything you typed.
        </p>
      </Section>

      <Section title="Public posts we read for fan sentiment">
        <p>
          The <Link href="/sentiment" className="underline underline-offset-2">sentiment pages</Link>{" "}
          score the tone of public fan writing about players and teams. A word list scores each item
          when it is fetched. Headlines from news outlets and fan blogs, and the text of Bluesky
          posts and YouTube comments that name a player, are also sent with that player&apos;s name
          to a language model that Cloudflare runs for us (Workers AI), which rates the tone toward
          that player. Only the text and the player name are sent, never the author or handle, and
          the model&apos;s answer is a single positive, neutral or negative rating. Reddit titles are
          not sent. Nothing is used to profile, contact or identify anyone. What we keep depends on
          the source:
        </p>
        <ul className="flex list-disc flex-col gap-1 pl-5">
          <li>
            Team fan blogs and news outlets: the headline and link, so a reader can open the source.
          </li>
          <li>
            Bluesky posts and YouTube comments: a scrambled id, the date, the tone score and any
            model rating, plus the like count for Bluesky. The text, author and handle are not kept.
          </li>
          <li>
            Reddit, if connected: only post titles from the last 24 hours are read, through
            Reddit&apos;s official API. They are scored in memory and thrown away. What we keep is one
            average per player, team and day, with the number of posts behind it. No post ids, links,
            titles, usernames or vote counts are stored.
          </li>
        </ul>
        <p>
          The site shows these as averages. If a platform ends our access or asks us to delete its
          data, we delete everything derived from it, averages included, and rebuild the pages
          without it.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          Questions or deletion requests go to the{" "}
          <a href={CONTACT_URL} className="underline underline-offset-2" target="_blank" rel="noreferrer">
            project&apos;s GitHub issues
          </a>
          .
        </p>
      </Section>
    </main>
  );
}
