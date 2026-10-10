import type { ReactNode } from "react";

import { MotionReveal } from "@/components/continuity/motion-reveal";
import { PageHeader } from "@/components/layout/page-header";
import legendPortraits from "@/data/media/legend-portraits.json";
import portraitFallbacks from "@/data/media/portrait-fallbacks.json";
import { type } from "@/lib/design-system";
import { collectPhotoCredits } from "@/lib/photo-credits";
import { SITE_CONTACT_URL } from "@/lib/site-url";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "Sources and credits",
  description: "Where the site's numbers, headlines and photos come from, with photo licenses.",
};

const linkClass = "underline underline-offset-2 hover:text-foreground";

function Section({ id, title, children }: { id?: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="flex max-w-3xl scroll-mt-24 flex-col gap-2">
      <h2 className={type.heading}>{title}</h2>
      <div className={cn(type.bodySm, "flex flex-col gap-2 text-muted-foreground")}>{children}</div>
    </section>
  );
}

function Ext({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} className={linkClass} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}

const DATA_SOURCES: { name: ReactNode; uses: string }[] = [
  {
    name: <Ext href="https://www.nba.com/stats">NBA.com and NBA Stats</Ext>,
    uses: "Box scores, play-by-play, shot charts, play types, on/off, hustle stats, player awards, franchise records, league averages, transactions, schedules, cap figures and key dates.",
  },
  {
    name: <Ext href="https://www.espn.com/nba/">ESPN</Ext>,
    uses: "Scores, schedules, standings, rosters, injury status, transaction notes and player bios.",
  },
  {
    name: <Ext href="https://www.basketball-reference.com/">Basketball-Reference</Ext>,
    uses: "Past-season advanced and per-game tables, careers that ended before 1996-97 and contracts. Some early league averages (before 1983) are kept from an earlier copy.",
  },
  {
    name: <Ext href="https://www.darko.app/">DARKO</Ext>,
    uses: "DARKO player ratings, a model by Kostya Medvedovsky.",
  },
  {
    name: <Ext href="https://github.com/fivethirtyeight/data/tree/master/nba-raptor">FiveThirtyEight RAPTOR</Ext>,
    uses: "Historical RAPTOR ratings, used under CC BY 4.0.",
  },
  {
    name: <Ext href="https://www.spotrac.com/nba/draft/future/">Spotrac</Ext>,
    uses: "Future draft pick ownership and protection terms.",
  },
  {
    name: <Ext href="https://www.wikipedia.org/">Wikipedia and Wikidata</Ext>,
    uses: "Retired numbers, team front office listings and ABA season records.",
  },
  {
    name: "News outlets and team blogs",
    uses: "Headlines on the sentiment and Movement Center pages, each linked to the original story with its outlet.",
  },
  {
    name: "Bluesky and YouTube",
    uses: "Public posts and comments rated for tone. Only scores are kept, never the text or who wrote it.",
  },
];

export default function SourcesPage() {
  const credits = collectPhotoCredits([
    ...Object.values(legendPortraits.portraits as Record<string, string>),
    ...Object.values(portraitFallbacks.portraits as Record<string, string>),
  ]);

  return (
    <main data-motion-page className="site-shell flex flex-col gap-8 py-6 sm:py-8">
      <MotionReveal />
      <PageHeader
        eyebrow="Sources"
        title="Sources and credits"
        subtitle="The site computes its own numbers from public data. These are the places that data comes from."
      />

      <Section title="Data">
        <ul className="flex flex-col gap-2">
          {DATA_SOURCES.map((s, i) => (
            <li key={i}>
              <span className="font-medium text-foreground">{s.name}</span>. {s.uses}
            </li>
          ))}
        </ul>
        <p>
          The sources don&apos;t endorse this site, and numbers here can differ from theirs when the site
          computes them differently.
        </p>
      </Section>

      <Section title="Logos and headshots">
        <p>
          Team logos and most player headshots load from ESPN&apos;s and NBA.com&apos;s image servers. They
          belong to the NBA, its teams and the photographers, and appear only to show which team or player
          a page is about.
        </p>
      </Section>

      <Section id="photo-credits" title="Photo credits">
        <p>
          Some player photos, mostly of older players, come from Wikimedia Commons under the licenses
          listed below. The site crops each one to a circle and sometimes shows it over a blurred copy of
          itself. Those changes are ours, not the photographers&apos;.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[32rem] text-left">
            <thead className={cn(type.caption, "uppercase tracking-wide")}>
              <tr className="border-b border-border">
                <th className="py-1.5 pr-3 font-semibold">Photo</th>
                <th className="py-1.5 pr-3 font-semibold">By</th>
                <th className="py-1.5 font-semibold">License</th>
              </tr>
            </thead>
            <tbody>
              {credits.map((c) => (
                <tr key={c.filePage} className="border-b border-border/60 align-top">
                  <td className="py-1.5 pr-3">
                    {c.filePage ? <Ext href={c.filePage}>{c.fileName}</Ext> : c.fileName}
                  </td>
                  <td className="py-1.5 pr-3">{c.author}</td>
                  <td className="py-1.5 whitespace-nowrap">
                    {c.licenseUrl ? <Ext href={c.licenseUrl}>{c.license}</Ext> : c.license}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Corrections and removal">
        <p>
          If something here is credited wrong, or you own something and want it removed,{" "}
          <Ext href={SITE_CONTACT_URL}>open a request</Ext> and we&apos;ll fix or remove it.
        </p>
      </Section>
    </main>
  );
}
