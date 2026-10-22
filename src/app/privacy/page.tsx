import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { MotionReveal } from "@/components/continuity/motion-reveal";
import { PageHeader } from "@/components/layout/page-header";
import { type } from "@/lib/design-system";
import { SITE_CONTACT_URL } from "@/lib/site-url";
import { cn } from "@/lib/utils";

export async function generateMetadata() {
  const t = await getTranslations("Legal");
  return {
    alternates: { canonical: "/privacy" },
    title: t("privacyMetaTitle"),
    description: t("privacyMetaDescription"),
  };
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex max-w-2xl flex-col gap-2">
      <h2 className={type.heading}>{title}</h2>
      <div className={cn(type.bodySm, "flex flex-col gap-2 text-muted-foreground")}>{children}</div>
    </section>
  );
}

export default async function PrivacyPage() {
  const t = await getTranslations("Legal");
  return (
    <main data-motion-page className="site-shell flex flex-col gap-8 py-6 sm:py-8">
      <MotionReveal />
      <PageHeader
        title={t("privacyTitle")}
        subtitle={t("privacySubtitle")}
      />

      <Section title={t("privacyCollectTitle")}>
        <p>
          We don&apos;t collect personal information. The site has no sign-in, no analytics or
          tracking scripts, no ad networks and no cookies of its own. Questions you type into Ask
          DRBL go to the server to be answered and are not saved there.
        </p>
        <p>
          Notes from the suggestions box on the about page are saved so we can read them. We store
          the words, the page you sent them from, and the time. We do not ask for a name or an
          email, and we do not attach an IP address. If you type a name or an email into the note,
          that text is stored with it. We delete a note when we are done with it.
        </p>
        <p>Some things are saved in your browser so they survive a reload:</p>
        <ul className="flex list-disc flex-col gap-1 pl-5">
          <li>
            Local storage: light or dark theme and the solid or glass look, your watchlist, your
            recent Ask DRBL questions, the location you typed for game-watch options, arcade best
            scores and One Shot saves.
          </li>
          <li>IndexedDB: leagues you play in GM mode.</li>
          <li>
            Session storage: a flag that stops the page from reloading itself more than once after
            we ship an update. It clears when you close the tab.
          </li>
        </ul>
        <p>We don&apos;t keep a copy of any of it. Clearing site data in your browser removes it.</p>
        <p>
          The site runs on Cloudflare, which handles each request the way any web host does. We
          do not log individual requests. When something breaks, the server keeps the error
          message and the player, team or season involved for up to 7 days so we can fix it. Those
          logs do not include IP addresses or anything you typed.
        </p>
        <p>
          To stop abuse, Cloudflare counts requests to the site&apos;s data API by IP address and
          turns away an address that sends too many in a minute. The count lives in
          Cloudflare&apos;s rate limiter for about a minute and we never see or store it.
          Cloudflare also asks browsers to report failed connections to it (Network Error
          Logging). Those reports go to Cloudflare, not to us, under{" "}
          <a
            href="https://www.cloudflare.com/privacypolicy/"
            className="underline underline-offset-2"
            target="_blank"
            rel="noreferrer"
          >
            its privacy policy
          </a>
          .
        </p>
      </Section>

      <Section title={t("privacyImagesTitle")}>
        <p>
          Player headshots and team logos load straight from ESPN, NBA.com and Wikimedia Commons. Your browser requests each image from that site, so the site sees
          your IP address and browser the same way it would if you visited it, and its own privacy
          policy applies. Some of these sites set their own cookies on those image responses. Your
          browser&apos;s third-party cookie setting controls whether it keeps them.
        </p>
      </Section>

      <Section title={t("privacySentimentTitle")}>
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
            Bluesky posts and YouTube comments: an id made by hashing the post&apos;s id with a
            secret key, the date, the tone score, any model rating, the topics, players and
            teams it names, and which search found it (Bluesky) or which channel it was posted on
            (YouTube). Bluesky rows also keep the like count, and YouTube rows keep a hash of the
            video id so replies under one video are weighed together. The text, author and handle
            are never kept, and without the key nobody can match a row to a post. These rows are
            deleted after 30 days. After that only the daily average tone per player remains.
          </li>
          <li>
            Reddit, if connected: only post titles from the last 24 hours are read, through
            Reddit&apos;s official API. They are scored in memory and thrown away. What we keep is one
            average per player, team and day, with the number of posts behind it. No post ids, links,
            titles, usernames or vote counts are stored.
          </li>
        </ul>
        <p>
          The site shows these as averages. If you want one of your posts or comments dropped
          before the 30 days are up, send us its link and we&apos;ll delete its row by hand. If a
          platform ends our access or asks us to delete its data, we delete what we hold from it,
          averages included, and rebuild the pages without it. The site&apos;s data files live in
          a public GitHub repository, so earlier versions of those files stay in its history.
        </p>
        <p>
          YouTube comments are read through the YouTube API Services. By using the sentiment pages
          you agree to be bound by the{" "}
          <a
            href="https://www.youtube.com/t/terms"
            className="underline underline-offset-2"
            target="_blank"
            rel="noreferrer"
          >
            YouTube Terms of Service
          </a>
          , and Google&apos;s use of data is covered by the{" "}
          <a
            href="https://policies.google.com/privacy"
            className="underline underline-offset-2"
            target="_blank"
            rel="noreferrer"
          >
            Google Privacy Policy
          </a>
          .
        </p>
      </Section>

      <Section title={t("privacyExtensionTitle")}>
        <p>
          The DRBL Live Chrome extension is an optional companion. It talks only to{" "}
          <a href="https://drbl.io" className="underline underline-offset-2">
            drbl.io
          </a>{" "}
          over HTTPS, using the same public scoreboard endpoints as the Scores page (
          <code className="text-foreground">/api/scores/live</code> and{" "}
          <code className="text-foreground">/api/scores/upcoming</code>). It does not scrape other
          sites, read other tabs, or collect browsing history.
        </p>
        <p>What stays on your device (Chrome extension storage):</p>
        <ul className="flex list-disc flex-col gap-1 pl-5">
          <li>Favorite team abbreviations you pick</li>
          <li>Theme preference and whether scores are shown in the popup</li>
          <li>Whether final-game notifications are on</li>
          <li>A short cache of recent scoreboard rows so the popup can open offline for a moment</li>
          <li>Ids of games that already triggered a final alert, so the same final is not notified twice</li>
        </ul>
        <p>
          That data never leaves your browser for DRBL accounts or analytics. There is no extension
          sign-in. Desktop notifications are created by Chrome on your machine when a favorite
          team&apos;s live game becomes final and you have notifications enabled. Removing the
          extension or clearing extension data deletes the local store.
        </p>
        <p>
          The extension&apos;s host permission is limited to{" "}
          <code className="text-foreground">https://drbl.io/*</code>. Cloudflare may still apply the
          same short-lived rate limits described above when the extension refreshes scores.
        </p>
      </Section>

      <Section title={t("privacyCreditsTitle")}>
        <p>
          Data sources, photo credits and licenses are listed on the{" "}
          <Link href="/sources" className="underline underline-offset-2">
            sources page
          </Link>
          .
        </p>
      </Section>

      <Section title={t("privacyContactTitle")}>
        <p>
          Questions or deletion requests go to the{" "}
          <a href={SITE_CONTACT_URL} className="underline underline-offset-2" target="_blank" rel="noreferrer">
            project&apos;s GitHub issues
          </a>
          .
        </p>
      </Section>
    </main>
  );
}
