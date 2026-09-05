import Link from "next/link";

import { getSentimentBuildHealth } from "@/data/queries/team-sentiment";
import { loadSentimentSnapshot } from "@/sentiment/load-curated";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "Sentiment status (internal)",
  robots: { index: false, follow: false },
};

/**
 * Internal iteration surface for the S1 sentiment prototype.
 * Rebuild: `npm run sentiment:build` (dual-writes data/ + runtime bundle).
 */
export default function InternalSentimentPage() {
  const health = getSentimentBuildHealth();
  const snapshot = loadSentimentSnapshot();
  const observationIds = snapshot?.meta.observationBatchIds ?? [];

  return (
    <main className="site-shell flex flex-col gap-6 py-8">
      <div>
        <p className={cn(type.caption, "text-muted-foreground")}>
          <Link href="/internal/design-system" className="underline">
            Internal
          </Link>{" "}
          / Sentiment
        </p>
        <h1 className={cn(type.heading, "mt-2")}>Sentiment prototype status</h1>
        <p className={cn(type.bodySm, "mt-1 max-w-2xl text-muted-foreground")}>
          Curated S1 snapshot for CF + local. Not live social ingest. Add
          observation batches under{" "}
          <code className="text-[12px]">data/sentiment/observations/v1/</code>,
          then run <code className="text-[12px]">npm run sentiment:build</code>.
        </p>
      </div>

      {!health.available ? (
        <p className={cn(type.bodySm, "text-delta-down")}>
          Runtime snapshot missing. Run{" "}
          <code className="text-[12px]">npm run sentiment:build</code> or{" "}
          <code className="text-[12px]">
            node scripts/build-runtime-sentiment-snapshot.mjs
          </code>
          .
        </p>
      ) : (
        <dl className="sports-card grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className={cn(type.caption, "text-muted-foreground")}>Season</dt>
            <dd className="font-semibold">{health.season}</dd>
          </div>
          <div>
            <dt className={cn(type.caption, "text-muted-foreground")}>Status</dt>
            <dd className="font-semibold">{health.status}</dd>
          </div>
          <div>
            <dt className={cn(type.caption, "text-muted-foreground")}>
              Players
            </dt>
            <dd className="font-semibold tabular-nums">{health.playerCount}</dd>
          </div>
          <div>
            <dt className={cn(type.caption, "text-muted-foreground")}>
              Teams
            </dt>
            <dd className="font-semibold tabular-nums">{health.teamCount}</dd>
          </div>
          <div>
            <dt className={cn(type.caption, "text-muted-foreground")}>
              Observation batches
            </dt>
            <dd className="font-semibold tabular-nums">
              {health.observationBatchCount}
            </dd>
          </div>
          <div>
            <dt className={cn(type.caption, "text-muted-foreground")}>
              Movers (7d)
            </dt>
            <dd className="font-semibold tabular-nums">
              +{health.movers.risers} / −{health.movers.fallers}
            </dd>
          </div>
          <div>
            <dt className={cn(type.caption, "text-muted-foreground")}>
              Fan–media gaps
            </dt>
            <dd className="font-semibold tabular-nums">{health.divergences}</dd>
          </div>
          <div>
            <dt className={cn(type.caption, "text-muted-foreground")}>
              Topic heat rows
            </dt>
            <dd className="font-semibold tabular-nums">{health.topics}</dd>
          </div>
          <div className="sm:col-span-2 lg:col-span-2">
            <dt className={cn(type.caption, "text-muted-foreground")}>
              Team profile sources
            </dt>
            <dd className={cn(type.bodySm, "mt-1")}>
              {Object.entries(health.teamSources)
                .map(([k, v]) => `${k}: ${v}`)
                .join(" · ") || "—"}
            </dd>
          </div>
          <div className="sm:col-span-2 lg:col-span-2">
            <dt className={cn(type.caption, "text-muted-foreground")}>
              Provenance
            </dt>
            <dd className={cn(type.bodySm, "mt-1")}>
              {Object.entries(health.byProvenance)
                .map(([k, v]) => `${k}: ${v}`)
                .join(" · ") || "—"}
            </dd>
          </div>
        </dl>
      )}

      {observationIds.length ? (
        <section className="flex flex-col gap-2">
          <h2 className={cn(type.heading, "text-[18px]")}>Observation batch ids</h2>
          <ul className={cn(type.caption, "list-inside list-disc text-muted-foreground")}>
            {observationIds.map((id) => (
              <li key={id}>
                <code>{id}</code>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="flex flex-col gap-2">
        <h2 className={cn(type.heading, "text-[18px]")}>Product surfaces</h2>
        <ul className={cn(type.bodySm, "flex flex-col gap-1")}>
          <li>
            <Link href="/sentiment" className="font-semibold underline">
              /sentiment
            </Link>{" "}
            — league board + narratives
          </li>
          <li>
            <Link href="/" className="font-semibold underline">
              Home
            </Link>{" "}
            — risers / fallers panel
          </li>
          <li>
            Player{" "}
            <code className="text-[12px]">Sentiment</code> tab on player pages —
            fan/media +
            movement rail
          </li>
          <li>
            <Link href="/api/sentiment/health" className="font-semibold underline">
              /api/sentiment/health
            </Link>{" "}
            — build health JSON
          </li>
          <li>
            Team{" "}
            <code className="text-[12px]">?tab=organization</code> — roster
            sentiment slice
          </li>
        </ul>
      </section>

      <p className={cn(type.caption, "text-muted-foreground")}>
        Policy:{" "}
        <code className="text-[12px]">docs/architecture/sentiment.md</code> ·{" "}
        <code className="text-[12px]">
          docs/architecture/sentiment-s0-policy.md
        </code>
      </p>
    </main>
  );
}
