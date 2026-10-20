import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { MotionReveal } from "@/components/continuity/motion-reveal";
import { PageHeader } from "@/components/layout/page-header";
import legendPortraits from "@/data/media/legend-portraits.json";
import portraitFallbacks from "@/data/media/portrait-fallbacks.json";
import { type } from "@/lib/design-system";
import { collectPhotoCredits } from "@/lib/photo-credits";
import { SITE_CONTACT_URL } from "@/lib/site-url";
import { cn } from "@/lib/utils";

export async function generateMetadata() {
  const t = await getTranslations("Legal");
  return {
    alternates: { canonical: "/sources" },
    title: t("sourcesMetaTitle"),
    description: t("sourcesMetaDescription"),
  };
}

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
    uses: "Box scores, play-by-play, shot charts, play types, on/off, hustle stats, player awards, franchise records, the record book lines that are counted from game logs since 1996-97, league averages, careers that ended before 1996-97, transactions, schedules, cap figures and key dates.",
  },
  {
    name: <Ext href="https://www.espn.com/nba/">ESPN</Ext>,
    uses: "Scores, schedules, standings, rosters, injury status, transaction notes and player bios.",
  },
  {
    name: <Ext href="https://www.basketball-reference.com/">Basketball-Reference</Ext>,
    uses: "Past-season advanced and per-game tables, contracts, and the record book leader lists for single games, seasons, careers, and team seasons. Kept from an earlier copy: ABA seasons and advanced tables for careers that ended before 1996-97, a few early players NBA Stats has no record of, and some league averages before 1983.",
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
    uses: "Retired numbers, team front office listings, ABA season records, and the longest winning streaks in the record book.",
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

export default async function SourcesPage() {
  const t = await getTranslations("Legal");
  const credits = collectPhotoCredits([
    ...Object.values(legendPortraits.portraits as Record<string, string>),
    ...Object.values(portraitFallbacks.portraits as Record<string, string>),
  ]);

  return (
    <main data-motion-page className="site-shell flex flex-col gap-8 py-6 sm:py-8">
      <MotionReveal />
      <PageHeader
        title={t("sourcesTitle")}
        subtitle={t("sourcesSubtitle")}
      />

      <Section title={t("sourcesWhoTitle")}>
        <p>
          {t("sourcesWhoP1Before")}
          <Link href="/about" className={linkClass}>
            {t("sourcesAboutLink")}
          </Link>
          {t("sourcesWhoP1After")}
        </p>
      </Section>

      <Section title={t("sourcesDataTitle")}>
        <ul className="flex flex-col gap-2">
          {DATA_SOURCES.map((s, i) => (
            <li key={i}>
              <span className="font-medium text-foreground">{s.name}</span>. {s.uses}
            </li>
          ))}
        </ul>
        <p>{t("sourcesDataFooter")}</p>
        <p className="text-[13px]">{t("sourcesDataUsesGap")}</p>
      </Section>

      <Section title={t("sourcesLogosTitle")}>
        <p>{t("sourcesLogosP1")}</p>
      </Section>

      <Section id="photo-credits" title={t("sourcesPhotosTitle")}>
        <p>{t("sourcesPhotosP1")}</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[32rem] text-left">
            <thead className={cn(type.caption, "uppercase tracking-wide")}>
              <tr className="border-b border-border">
                <th className="py-1.5 pr-3 font-semibold">{t("sourcesColPhoto")}</th>
                <th className="py-1.5 pr-3 font-semibold">{t("sourcesColBy")}</th>
                <th className="py-1.5 font-semibold">{t("sourcesColLicense")}</th>
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

      <Section title={t("sourcesCorrectionsTitle")}>
        <p>
          {t("sourcesCorrectionsP1Before")}
          <Ext href={SITE_CONTACT_URL}>{t("sourcesOpenRequest")}</Ext>
          {t("sourcesCorrectionsP1After")}
        </p>
      </Section>
    </main>
  );
}
