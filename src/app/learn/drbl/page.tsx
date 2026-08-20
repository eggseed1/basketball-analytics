import type { ReactNode } from "react";
import Link from "next/link";
import type { Metadata } from "next";

import { P1_POINTS_PER_WIN } from "@/lib/drbl-public-labels";

export const metadata: Metadata = {
  title: "What is DRBL?",
  description:
    "DRBL/100 answers how good. WAR1 answers how much. Go deeper only when you want to.",
};

function Card({
  title,
  href,
  children,
}: {
  title: string;
  href?: string;
  children: ReactNode;
}) {
  return (
    <div className="sports-card border border-border px-4 py-4">
      <h3 className="text-[16px] font-semibold tracking-tight">
        {href ? (
          <Link href={href} className="underline-offset-2 hover:underline">
            {title}
          </Link>
        ) : (
          title
        )}
      </h3>
      <div className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
        {children}
      </div>
    </div>
  );
}

const DEEPER: Array<{ href: string; label: string; blurb: string }> = [
  {
    href: "/learn/drbl-100",
    label: "DRBL/100",
    blurb: "Impact rate - how good on a per-100 scale.",
  },
  {
    href: "/learn/drbl/war1",
    label: "WAR1",
    blurb: "Season value accumulated in win-equivalent units.",
  },
  {
    href: "/learn/drbl-o",
    label: "Offense (DRBL-O)",
    blurb: "Offensive half of the possession diagnostic.",
  },
  {
    href: "/learn/drbl-d",
    label: "Defense (DRBL-D)",
    blurb: "Defensive half of the possession diagnostic.",
  },
  {
    href: "/learn/drbl-p",
    label: "DRBL-P",
    blurb: "Possession attribution diagnostic.",
  },
  {
    href: "/learn/drbl-ln",
    label: "DRBL-LN",
    blurb: "Lineup-context diagnostic - not proven off-ball value.",
  },
  {
    href: "/learn/drbl-b",
    label: "DRBL-B",
    blurb: "Box/behavior diagnostic - not optical tracking.",
  },
  {
    href: "/learn/r1",
    label: "R1",
    blurb: "What “Above R1” compares against.",
  },
  {
    href: "/learn/r1-points",
    label: "R1 Points",
    blurb: "Advanced accounting behind WAR1.",
  },
  {
    href: "/learn/how-drbl-works",
    label: "How DRBL works",
    blurb: "Follow one possession through attribution.",
  },
  {
    href: "/learn/drbl-validation",
    label: "Validation",
    blurb: "Reserved tests, M16j / M17b lineage - no external superiority claim.",
  },
  {
    href: "/learn/drbl-historical-data",
    label: "Historical data",
    blurb: "Why raw older seasons ≠ published DRBL.",
  },
  {
    href: "/learn/drbl-limitations",
    label: "Limitations",
    blurb: "Causality, off-ball, uncertainty, cross-era caveats.",
  },
];

export default function LearnDrblPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-10 sm:px-6">
      <p>
        <Link
          href="/learn"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← All concepts
        </Link>
      </p>

      <header className="flex flex-col gap-3 border-b border-border pb-6">
        <p className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Learn
        </p>
        <h1 className="text-4xl font-semibold tracking-tight">DRBL</h1>
        <p className="text-lg text-muted-foreground">
          Two numbers tell most of the story. Everything else is optional depth.
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">What is DRBL?</h2>
        <p className="text-muted-foreground">
          DRBL estimates how much a player helped or hurt expected scoring -
          using public play-by-play - relative to a fair role-matched baseline.
          You do not need the model vocabulary to use the player page.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Two main numbers</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Card title="DRBL/100" href="/learn/drbl-100">
            <p className="font-medium text-foreground">How good?</p>
            <p className="mt-1">
              Estimated impact per 100 possessions. Canonical ranking rate.
            </p>
          </Card>
          <Card title="WAR1" href="/learn/drbl/war1">
            <p className="font-medium text-foreground">How much?</p>
            <p className="mt-1">
              Realized season value in win-equivalent units. Not traditional WAR.
            </p>
          </Card>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">How to read them</h2>
        <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
          <li>
            <strong className="text-foreground">DRBL/100</strong> - positive is
            above the reference rate; near zero is roughly even; negative is
            below.
          </li>
          <li>
            <strong className="text-foreground">WAR1</strong> - how much
            value stacked up this season (minutes and volume matter).
          </li>
          <li>
            Offense and Defense on the player page are intuitive splits - deeper
            labels are DRBL-O and DRBL-D.
          </li>
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Go deeper</h2>
        <p className="text-muted-foreground">
          Diagnostics DRBL-P, DRBL-LN, and DRBL-B are{" "}
          <strong className="text-foreground">non-additive</strong> - they do
          not sum to DRBL/100. Research lineage includes UIR, M16j, and M17b
          behind the research boundary.
        </p>
        <ul className="divide-y divide-border rounded-lg border border-border">
          {DEEPER.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="flex flex-col gap-0.5 px-4 py-3 hover:bg-muted/40"
              >
                <span className="text-[14px] font-semibold text-foreground">
                  {item.label} →
                </span>
                <span className="text-[12px] text-muted-foreground">
                  {item.blurb}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <details className="flex flex-col gap-3 rounded-lg border border-border px-4 py-4">
        <summary className="cursor-pointer text-xl font-semibold tracking-tight">
          Deep rabbit hole · R1 Points &amp; P1
        </summary>
        <div className="mt-3 flex flex-col gap-3 text-muted-foreground">
          <p>
            <strong className="text-foreground">R1 Points</strong> are the
            underlying point-equivalent accumulated attribution above R1. They
            remain canonical for accounting, additivity, stint conservation,
            team decomposition, and research.
          </p>
          <p>
            <strong className="text-foreground">WAR1</strong> is a
            fixed linear conversion of the same quantity:
          </p>
          <p className="font-mono text-[12px] text-foreground/85">
            WAR1 = R1 Points / {P1_POINTS_PER_WIN}
          </p>
          <p>
            Because the denominator is a fixed positive constant,{" "}
            <strong className="text-foreground">
              rank(R1 Points) = rank(WAR1)
            </strong>{" "}
            exactly. The product surface prefers WAR1 so casual readers
            see interpretable win-equivalent units without needing residual
            accounting.
          </p>
          <p>
            WAR1 is <strong className="text-foreground">not</strong>{" "}
            traditional WAR. The name is intended as “Wins Above R1,” but the
            public product label is WAR1 - and R1 is a contextual role-matched
            reference, not conventional replacement level.
          </p>
          <p className="font-mono text-[12px] text-foreground/85">
            validatedDRBL100 = EB<sub>1600</sub>(rawAbilityRate) toward 0 · k = 1600
          </p>
        </div>
      </details>

      <section className="sports-card border border-border bg-card px-4 py-4">
        <h2 className="text-lg font-semibold">Explore the numbers</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Sort by DRBL/100 (ability) or WAR1 (realized value).
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href="/explore/players?sort=drbl100&dir=desc"
            className="rounded-md border border-foreground bg-foreground px-3 py-1.5 text-sm font-medium text-background"
          >
            Ability rate
          </Link>
          <Link
            href="/explore/players?sort=r1WinEquivalents&dir=desc"
            className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted"
          >
            WAR1
          </Link>
        </div>
      </section>
    </main>
  );
}
