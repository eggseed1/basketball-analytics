import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "What is DRBL?",
  description:
    "Differential Replacement Basketball Level — ability rate, R1 Points, and R1 Win Equivalents.",
};

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
        <h2 className="text-xl font-semibold">Three distinct numbers</h2>
        <dl className="grid gap-4 sm:grid-cols-1">
          {[
            {
              term: "DRBL/100",
              def: "Estimated player impact rate relative to a contextual, role-matched R1 reference, per 100 combined possession appearances. Canonical ability / ranking statistic.",
            },
            {
              term: "R1 Points",
              def: "Realized player-attributed point residual above that R1 reference over the player’s actual season exposure. Accounting value — not latent ability.",
            },
            {
              term: "R1 Win Equivalents",
              def: "R1 Points expressed in marginal win-equivalent units using a frozen development points-per-win conversion. Not traditional WAR.",
            },
          ].map((item) => (
            <div key={item.term} className="rounded-lg border border-border p-3">
              <dt className="font-semibold">{item.term}</dt>
              <dd className="mt-1 text-sm text-muted-foreground">{item.def}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Important limitations</h2>
        <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
          <li>
            R1 is a contextual role-matched reference and is not currently claimed
            to equal conventional NBA fringe-player replacement level.
          </li>
          <li>
            R1 Win Equivalents should not be interpreted as the literal number of
            wins a team would lose if the player were removed or replaced.
          </li>
          <li>
            Player attribution is not exhaustive of full team scoreboard value;
            the R1 baseline and unassigned residual remain separate accounting
            terms.
          </li>
          <li>
            A high R1 Points total does not necessarily imply a higher underlying
            ability rate than another player — DRBL/100 is the preferred rate
            estimate.
          </li>
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Historical seasons</h2>
        <p className="text-muted-foreground">
          Historical DRBL applies the frozen v1 model retrospectively to seasons
          whose play-by-play data satisfy the required support and accounting
          checks. Historical support varies by season.
        </p>
        <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
          <li>
            R1 Win Equivalents use the same frozen v1 points-per-win conversion
            and should not be interpreted as era-specific re-estimates of wins
            per point.
          </li>
          <li>R1 is not conventional replacement.</li>
          <li>
            Historical cross-era comparability is not yet fully established.
            Season ranks are within-season only — not an all-time GOAT scale.
          </li>
          <li>
            Career cumulative R1 value is not published as a canonical metric
            until continuous Tier A/B support and cross-era semantics are
            audited.
          </li>
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">How DRBL/100 is estimated</h2>
        <ol className="list-decimal space-y-2 pl-5 text-muted-foreground">
          <li>
            Reconstruct possessions from NBA play-by-play and box scores.
          </li>
          <li>
            Attribute Approach-B residuals versus a cutoff-frozen, role-matched
            R1 expected-points baseline.
          </li>
          <li>
            Form a raw ability rate from attributed value over combined
            possession appearances.
          </li>
          <li>
            Publish validated DRBL/100 as an EB1600 posterior of that rate toward
            zero (prior mean 0, k = 1600).
          </li>
        </ol>
      </section>

      <section className="rounded-xl border border-border bg-card p-4">
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
