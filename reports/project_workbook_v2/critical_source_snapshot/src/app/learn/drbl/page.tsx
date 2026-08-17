import type { ReactNode } from "react";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "What is DRBL?",
  description:
    "Differential Replacement Basketball Level — ability rate, R1 Points, and R1 Win Equivalents.",
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
          accounting. It is not optical tracking and not a claim about roster
          replacement causality.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Three headline numbers</h2>
        <div className="grid gap-3">
          <Card title="DRBL/100">
            Ability rate — estimated impact per 100 combined possession
            appearances versus the role-matched R1 reference. Canonical ranking
            statistic.
            <p className="mt-2 font-mono text-[12px] text-foreground/80">
              validatedDRBL100 = EB<sub>1600</sub>(rawAbilityRate) toward 0
              (prior mean 0, k = 1600)
            </p>
          </Card>
          <Card title="R1 Points">
            Realized attributed point residual above R1 over the player’s actual
            season exposure. Accounting value — not latent ability.
          </Card>
          <Card title="R1 Win Equivalents">
            R1 Points converted with a frozen points-per-win factor. Not
            traditional WAR; not “wins a team would lose if removed.”
          </Card>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Ability vs value</h2>
        <p className="text-muted-foreground">
          <strong className="text-foreground">DRBL/100</strong> answers “how
          good is the rate?”{" "}
          <strong className="text-foreground">R1 Points</strong> /{" "}
          <strong className="text-foreground">R1 Win Equivalents</strong> answer
          “how much realized value accrued this season?” A large R1 total does
          not imply a higher ability rate than another player.
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
          DRBL-P (possession), DRBL-LN (lineup), and DRBL-B (behavior) are
          companion diagnostics on different scales.{" "}
          <strong className="text-foreground">
            They are non-additive — do not sum them into DRBL/100.
          </strong>{" "}
          DRBL-B is a behavioral box/PBP diagnostic, not optical tracking and not
          measured gravity.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Historical seasons</h2>
        <p className="text-muted-foreground">
          Historical DRBL applies the frozen v1 model retrospectively when
          play-by-play support gates pass. Support tiers vary by season. Within-
          season ranks are not an all-time GOAT scale. Career cumulative R1 value
          is not published as a canonical metric yet.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Validation</h2>
        <p className="text-muted-foreground">
          Product DRBL/100 follows the sealed validated ability lineage (M16j /
          M17b evidence packages). Those milestones document stability and
          predictive checks for the published rate — they are not superiority
          claims against other public impact models.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Limitations</h2>
        <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
          <li>
            Player attribution is not exhaustive of full team scoreboard value;
            the R1 baseline and unassigned residual remain separate.
          </li>
          <li>
            R1 Win Equivalents are not causal roster-replacement effects.
          </li>
          <li>
            Predictive intervals for validated DRBL/100 remain unresolved;
            legacy ± fields are diagnostic-only.
          </li>
          <li>
            Cross-era comparability is not fully established.
          </li>
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Retired: WAR & uncertainty framing</h2>
        <p className="text-muted-foreground">
          Legacy DRBL WAR and calibrated uncertainty framing are retired from
          public ranking. Prefer DRBL/100, R1 Points, and R1 Win Equivalents.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Research boundary: UIR</h2>
        <p className="text-muted-foreground">
          Uniform Impact Residual (UIR) and related off-ball research live behind
          the research boundary — not a public product metric on player boards.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Glossary formulas</h2>
        <div className="sports-card border border-border px-4 py-4 font-mono text-[12px] leading-relaxed text-foreground/85">
          <p>rawAbilityRate = attributedValue / combinedPossessionAppearances × 100</p>
          <p className="mt-2">
            validatedDRBL100 = (N / (N + k)) × rawAbilityRate + (k / (N + k)) × 0
          </p>
          <p className="mt-1 text-muted-foreground">k = 1600 · prior mean = 0 · P1 exact EB shrinkage</p>
        </div>
      </section>

      <section className="sports-card border border-border bg-card px-4 py-4">
        <h2 className="text-lg font-semibold">Explore the numbers</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Sort the player explorer by DRBL/100 (ability), R1 Points, or R1 Win
          Equivalents. Canonical overall ranking remains DRBL/100.
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
            R1 Win Equivalents
          </Link>
          <Link
            href="/explore/players?sort=r1Points&dir=desc"
            className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted"
          >
            R1 Points
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
