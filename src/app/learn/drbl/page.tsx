import { MotionReveal } from "@/components/continuity/motion-reveal";
import type { ReactNode } from "react";
import Link from "next/link";
import type { Metadata } from "next";

import { P1_POINTS_PER_WIN } from "@/lib/drbl-public-labels";

export const metadata: Metadata = {
  title: "What is DRBL?",
  description:
    "DRBL/100 answers how good. WAR1 answers how much. Everything else is optional context.",
};

type DeeperLink = { href: string; label: string; blurb: string };

const DEEPER: Array<{ title: string; note?: string; links: DeeperLink[] }> = [
  {
    title: "Offense and defense",
    links: [
      {
        href: "/learn/drbl-o",
        label: "DRBL-O",
        blurb: "Value added on offense. Shown as Offense on player pages.",
      },
      {
        href: "/learn/drbl-d",
        label: "DRBL-D",
        blurb: "Value added on defense. Higher is better.",
      },
    ],
  },
  {
    title: "How it works",
    links: [
      {
        href: "/learn/how-drbl-works",
        label: "How DRBL works",
        blurb: "Follow one possession from play-by-play to player credit.",
      },
      {
        href: "/learn/r1",
        label: "R1",
        blurb: "The role-matched baseline every DRBL number is measured against.",
      },
    ],
  },
  {
    title: "Limits and coverage",
    links: [
      {
        href: "/learn/drbl-limitations",
        label: "Limitations",
        blurb: "What DRBL can't see and what it doesn't claim.",
      },
      {
        href: "/learn/drbl-historical-data",
        label: "Historical data",
        blurb: "Why older seasons can have box scores but no DRBL.",
      },
      {
        href: "/learn/drbl-validation",
        label: "Validation",
        blurb: "How the estimates were tested on seasons the model never saw.",
      },
    ],
  },
  {
    title: "Diagnostics",
    note: "These appear only in season compare. They are non-additive: DRBL-P, DRBL-LN, and DRBL-B do not sum to DRBL/100.",
    links: [
      {
        href: "/learn/drbl-p",
        label: "DRBL-P",
        blurb: "Possession credit, the parent of DRBL-O and DRBL-D.",
      },
      {
        href: "/learn/drbl-ln",
        label: "DRBL-LN",
        blurb: "Lineup context. Association with teammates, not proven off-ball value.",
      },
      {
        href: "/learn/drbl-b",
        label: "DRBL-B",
        blurb: "Box score and play-by-play habits such as usage and shot mix.",
      },
    ],
  },
];

function Card({
  title,
  href,
  question,
  children,
}: {
  title: string;
  href: string;
  question: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="sports-card flex flex-col gap-1 px-4 py-4 hover:bg-secondary/50"
    >
      <span className="text-[18px] font-bold tracking-tight">{title}</span>
      <span className="text-[14px] font-semibold text-foreground">{question}</span>
      <span className="text-[14px] leading-relaxed text-muted-foreground">
        {children}
      </span>
    </Link>
  );
}

export default function LearnDrblPage() {
  return (
    <main data-motion-page className="site-shell flex flex-col gap-8 py-6 sm:py-8">
      <MotionReveal />
      <div data-motion-stack className="site-prose flex w-full flex-col gap-8 lg:mx-0 lg:max-w-4xl">
        <Link
          href="/learn"
          className="text-[14px] font-semibold text-muted-foreground underline-offset-4 hover:underline"
        >
          ← Learn
        </Link>

        <header className="flex flex-col gap-3">
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            DRBL numbers
          </p>
          <h1 className="text-[2rem] font-bold tracking-tight sm:text-[2.25rem]">
            What is DRBL?
          </h1>
          <p className="max-w-2xl text-[16px] leading-relaxed text-muted-foreground">
            DRBL reads public play-by-play and estimates how much each player
            helped or hurt his team&apos;s expected scoring, compared with a
            role-matched baseline. Two numbers carry almost all of it.
          </p>
        </header>

        <section className="flex flex-col gap-3">
          <h2 className="text-[18px] font-bold">Two main numbers</h2>
          <div data-motion-list className="grid gap-3 sm:grid-cols-2">
            <Card title="DRBL/100" href="/learn/drbl-100" question="How good?">
              Impact per 100 possessions. Positive is above the baseline, near
              zero is about even, negative is below. This is the main ranking
              number.
            </Card>
            <Card title="WAR1" href="/learn/drbl/war1" question="How much?">
              Season value in wins. Minutes matter, so a starter usually beats
              an equally good bench player. This is not traditional WAR.
            </Card>
          </div>
          <p className="text-[14px] text-muted-foreground">
            Offense and Defense on player pages are DRBL-O and DRBL-D, one for
            each side of the ball. They add context and are not a second
            ranking. A blank means DRBL isn&apos;t published for that season, not that the
            player was average.
          </p>
        </section>

        <section className="flex flex-col gap-5">
          <h2 className="text-[18px] font-bold">Go deeper</h2>
          {DEEPER.map((group) => (
            <div key={group.title} className="flex flex-col gap-2">
              <h3 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                {group.title}
              </h3>
              {group.note ? (
                <p className="text-[14px] text-muted-foreground">{group.note}</p>
              ) : null}
              <ul className="sports-card divide-y divide-black/5 dark:divide-white/10">
                {group.links.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="flex flex-col gap-0.5 px-4 py-3 hover:bg-secondary/50"
                    >
                      <span className="text-[15px] font-semibold">{item.label}</span>
                      <span className="text-[14px] text-muted-foreground">
                        {item.blurb}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>

        <details className="sports-card px-4 py-4">
          <summary className="cursor-pointer text-[16px] font-semibold">
            R1 Points and the WAR1 conversion
          </summary>
          <div className="mt-3 flex flex-col gap-3 text-[14px] leading-relaxed text-muted-foreground">
            <p>
              <strong className="text-foreground">R1 Points</strong> are the
              same season credit in points instead of wins. We keep them for
              accounting checks; the site shows WAR1.
            </p>
            <p className="font-mono text-[13px] text-foreground/85">
              WAR1 = R1 Points / {P1_POINTS_PER_WIN.toFixed(2)}
            </p>
            <p>
              The divisor is a fixed number of points per win (shown rounded),
              so ranking players by R1 Points or by WAR1 gives the same order.
            </p>
            <p>
              WAR1 is not traditional WAR. The name is intended as Wins Above R1, and R1 is a role-matched baseline, not classic replacement level.
            </p>
            <p>
              DRBL/100 itself is the raw rate pulled toward zero by an
              empirical-Bayes prior, so small samples can&apos;t dominate:
            </p>
            <p className="font-mono text-[13px] text-foreground/85">
              validatedDRBL100 = EB<sub>1600</sub>(rawAbilityRate) toward 0 · k = 1600
            </p>
          </div>
        </details>

        <section className="sports-card mb-8 px-4 py-4">
          <h2 className="text-[16px] font-semibold">See it on the board</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href="/explore/players?sort=drbl100&dir=desc"
              className="rounded-md border border-foreground bg-foreground px-3 py-1.5 text-[14px] font-medium text-background"
            >
              Sort by DRBL/100
            </Link>
            <Link
              href="/explore/players?sort=r1WinEquivalents&dir=desc"
              className="rounded-md border border-border px-3 py-1.5 text-[14px] font-medium hover:bg-secondary"
            >
              Sort by WAR1
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
