import Link from "next/link";

import {
  summarizeTeamSeasonEvidenceForProfile,
  type TeamSeasonEvidence,
} from "@/analytics/season-evidence";
import { TeamSeasonEvidenceSection } from "@/components/compare/team-season-evidence-section";
import { MetricHelp } from "@/components/learn/metric-help";

/**
 * Team Profile Season Evidence — compact glimpse; full cards stay behind
 * “See games →” so the profile stays clean. Same analyzer as Rank/Compare.
 */
export function TeamSeasonEvidenceProfileSection({
  evidence,
}: {
  evidence: TeamSeasonEvidence;
}) {
  const summary = summarizeTeamSeasonEvidenceForProfile(evidence);
  const hasGames = evidence.games.length > 0;

  return (
    <section
      id="evidence"
      className="scroll-mt-16 flex flex-col gap-3"
      aria-label="Season Evidence"
    >
      <div className="sports-card flex flex-col gap-3 p-4 sm:p-5">
        <div>
          <h2 className="text-[17px] font-bold tracking-tight">
            <MetricHelp
              conceptId="season_evidence"
              labelClassName="font-bold tracking-tight"
            >
              Season Evidence
            </MetricHelp>
          </h2>
          <p className="text-[13px] text-muted-foreground">
            {evidence.season} · representative regular-season games from
            schedule scores
          </p>
        </div>

        {evidence.error && !hasGames ? (
          <p className="text-[13px] text-muted-foreground">{evidence.error}</p>
        ) : null}

        {summary.length ? (
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {summary.map((item) => (
              <div key={item.categoryId} className="min-w-0">
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {item.shortLabel}
                </dt>
                <dd className="mt-0.5 text-[18px] font-bold tabular-nums tracking-tight">
                  {item.valueDisplay}
                </dd>
              </div>
            ))}
          </dl>
        ) : !evidence.error ? (
          <p className="text-[13px] text-muted-foreground">
            No representative schedule-score games in this season sample yet.
          </p>
        ) : null}

        {hasGames ? (
          <details className="group">
            <summary className="cursor-pointer list-none text-[13px] font-semibold underline-offset-2 hover:underline [&::-webkit-details-marker]:hidden">
              See games →
            </summary>
            <div id="evidence-games" className="mt-3 scroll-mt-16">
              <TeamSeasonEvidenceSection
                evidence={evidence}
                title="Representative games"
                subtitle="Same Season Evidence rules as Team Rank / Compare — open Game Lab for the box."
              />
            </div>
          </details>
        ) : null}

        {hasGames ? (
          <p className="text-[12px] text-muted-foreground">
            Descriptive only — not “most important.” Open a game for Game Lab.
          </p>
        ) : null}
      </div>
    </section>
  );
}

/** Header / arc shortcut when navigating to another season&apos;s evidence. */
export function TeamSeasonEvidenceLink({
  href,
  label = "See season evidence →",
}: {
  href: string;
  label?: string;
}) {
  return (
    <Link
      href={href}
      className="text-[13px] font-semibold underline-offset-2 hover:underline"
    >
      {label}
    </Link>
  );
}
