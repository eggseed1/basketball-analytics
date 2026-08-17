import type { ReactNode } from "react";
import Link from "next/link";
import type { Metadata } from "next";

import { P1_POINTS_PER_WIN } from "@/lib/drbl-public-labels";

export const metadata: Metadata = {
  title: "What is DRBL?",
  description:
    "Differential Replacement Basketball Level — DRBL/100 ability rate and Wins Above R1 realized season value.",
};

function Card({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="sports-card border border-border px-4 py-4">
      <h3 className="text-[15px] font-semibold tracking-tight">{title}</h3>
      <div className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
        {children}
      </div>
    </div>
  );
}

export default function LearnDrblPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-10 sm:px-6">
      <p>
        <Link
          href="/explore/players"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← Back to players
        </Link>
      </p>

      <header className="flex flex-col gap-3 border-b border-border pb-6">
        <p className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Learn
        </p>
        <h1 className="text-4xl font-semibold tracking-tight">DRBL</h1>
        <p className="text-lg text-muted-foreground">
          Differential Replacement Basketball Level — player impact relative to a
          contextual, role-matched R1 reference, measured in expected-possession
          value.
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">What is DRBL?</h2>
        <p className="text-muted-foreground">
          DRBL reconstructs possessions from public play-by-play, attributes
          Approach-B residuals versus a cutoff-frozen R1 expected-points
          baseline, and publishes a validated ability rate plus realized season
          value. It is not optical tracking and not a claim about roster
          replacement causality.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Two main numbers</h2>
        <div className="grid gap-3">
          <Card title="DRBL/100">
            How strong was the player&apos;s estimated impact rate? Ability rate —
            estimated impact per 100 combined possession appearances versus the
            role-matched R1 reference. Canonical ranking statistic.
            <p className="mt-2 font-mono text-[12px] text-foreground/80">
              validatedDRBL100 = EB<sub>1600</sub>(rawAbilityRate) toward 0
              (prior mean 0, k = 1600)
            </p>
          </Card>
          <Card title="Wins Above R1">
            How much value did that player accumulate over the season? Realized
            season value in win-equivalent units. Not traditional WAR — R1 is a
            contextual role-matched reference, not a conventional fringe-player
            replacement baseline. Not traditional WAR.
          </Card>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Ability vs value</h2>
        <p className="text-muted-foreground">
          <strong className="text-foreground">DRBL/100</strong> answers “how
          strong was the rate?”{" "}
          <strong className="text-foreground">Wins Above R1</strong> answers
          “how much realized value accrued this season?” A large Wins Above R1
          total does not imply a higher ability rate than another player.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">R1 reference</h2>
        <p className="text-muted-foreground">
          R1 is a contextual, role-matched expected-points baseline used for
          Approach-B attribution. It is not currently claimed to equal
          conventional NBA fringe-player replacement level.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">DRBL-O and DRBL-D</h2>
        <p className="text-muted-foreground">
          Offensive and defensive halves of the possession component (DRBL-P).
          Higher is better on both sides. They are diagnostics —{" "}
          <strong className="text-foreground">
            DRBL-O + DRBL-D ≠ DRBL/100
          </strong>
          .
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Diagnostics: P / LN / B</h2>
        <p className="text-muted-foreground">
          DRBL-P, DRBL-LN, and DRBL-B are{" "}
          <strong className="text-foreground">non-additive</strong> diagnostics.
          They do not sum to DRBL/100. See the player page advanced disclosure for
          component readouts.
        </p>
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
            <strong className="text-foreground">Wins Above R1</strong> is a
            fixed linear conversion of the same quantity:
          </p>
          <p className="font-mono text-[12px] text-foreground/85">
            Wins Above R1 = R1 Points / {P1_POINTS_PER_WIN}
          </p>
          <p>
            Because the denominator is a fixed positive constant,{" "}
            <strong className="text-foreground">
              rank(R1 Points) = rank(Wins Above R1)
            </strong>{" "}
            exactly. The product surface prefers Wins Above R1 so casual readers
            see interpretable win-equivalent units without needing residual
            accounting.
          </p>
          <p>
            Wins Above R1 is <strong className="text-foreground">not</strong>{" "}
            traditional WAR.
          </p>
        </div>
      </details>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Limitations</h2>
        <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
          <li>
            Player attribution is not exhaustive of full team scoreboard value;
            the R1 baseline and unassigned residual remain separate.
          </li>
          <li>
            Wins Above R1 are not causal roster-replacement effects.
          </li>
          <li>
            Predictive intervals for validated DRBL/100 remain unresolved;
            legacy ± fields are diagnostic-only.
          </li>
          <li>Cross-era comparability is not fully established.</li>
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Retired: WAR & uncertainty framing</h2>
        <p className="text-muted-foreground">
          Legacy DRBL WAR and calibrated uncertainty framing are retired from
          public ranking. Prefer DRBL/100 and Wins Above R1. R1 Points remain
          available in methodology and accounting.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Research boundary: UIR</h2>
        <p className="text-muted-foreground">
          Uniform Impact Residual (UIR) and related off-ball research (including
          M16j / M17b lineage) live behind the research boundary — not a public
          product metric on player boards.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Glossary formulas</h2>
        <div className="sports-card border border-border px-4 py-4 font-mono text-[12px] leading-relaxed text-foreground/85">
          <p>
            rawAbilityRate = attributedValue / combinedPossessionAppearances ×
            100
          </p>
          <p className="mt-2">
            validatedDRBL100 = (N / (N + k)) × rawAbilityRate + (k / (N + k)) ×
            0
          </p>
          <p className="mt-1 text-muted-foreground">
            k = 1600 · prior mean = 0 · P1 exact EB shrinkage
          </p>
          <p className="mt-2">
            Wins Above R1 = R1 Points / {P1_POINTS_PER_WIN}
          </p>
        </div>
      </section>

      <section className="sports-card border border-border bg-card px-4 py-4">
        <h2 className="text-lg font-semibold">Explore the numbers</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Sort the player explorer by DRBL/100 (ability) or Wins Above R1
          (realized value). Canonical overall ranking remains DRBL/100.
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
            Wins Above R1
          </Link>
          <Link
            href="/explore/players"
            className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted"
          >
            Explore players
          </Link>
        </div>
      </section>
    </main>
  );
}
