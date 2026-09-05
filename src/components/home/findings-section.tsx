import Link from "next/link";

import type { RecentInsight } from "@/lib/recent-insights";
import { recentInsightDateLabel } from "@/lib/recent-insights";
import { AppLink } from "@/components/ui/app-link";
import { teamProfileHref } from "@/lib/team-identity";

export { AnalyticsDesk } from "@/components/home/analytics-desk";

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Homepage Recent Insights — completed-game cards from baked slate. */
export function FindingsSection({
  insights,
  seasonLabel,
  empty = false,
}: {
  insights: RecentInsight[];
  /** e.g. "2025-26 Finals window" when anchoring offseason. */
  seasonLabel?: string | null;
  empty?: boolean;
}) {
  const asOf = todayIsoDate();

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="type-heading">Recent Insights</h2>
        <p className="type-body-sm text-muted-foreground">
          {empty
            ? "No games in the latest window. Insights will update as new games are completed."
            : seasonLabel
              ? `Notable performances from the latest ${seasonLabel} games.`
              : "Notable performances, trends, and statistical outliers from the latest games."}
        </p>
      </div>
      {insights.length ? (
        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          {insights.map((insight) => (
            <InsightCard key={insight.id} insight={insight} asOf={asOf} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function InsightCard({
  insight,
  asOf,
}: {
  insight: RecentInsight;
  asOf: string;
}) {
  const nightLabel = recentInsightDateLabel(insight.gameDate, asOf);
  const eyebrow = nightLabel
    ? `${nightLabel} · ${insight.category}`
    : insight.category;

  const gameHref = insight.gameId
    ? `/games/${encodeURIComponent(insight.gameId)}`
    : null;
  const playerHref = insight.playerId
    ? `/players/${encodeURIComponent(insight.playerId)}`
    : null;
  const teamHref = insight.teamId
    ? teamProfileHref(insight.teamId)
    : null;

  return (
    <article className="sports-card flex flex-col gap-1.5 p-4">
      <p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
        {eyebrow}
      </p>
      <h3 className="text-[16px] font-bold leading-snug tracking-tight">
        {insight.headline}
      </h3>
      <p className="text-[14px] leading-relaxed text-muted-foreground">
        {insight.description}
      </p>
      <p className="text-[12px] text-muted-foreground">{insight.context}</p>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
        {gameHref ? (
          <AppLink
            href={gameHref}
            className="text-[12px] font-semibold text-foreground underline-offset-4 hover:underline"
          >
            View game
          </AppLink>
        ) : null}
        {playerHref ? (
          <Link
            href={playerHref}
            className="text-[12px] font-semibold text-muted-foreground underline-offset-4 hover:underline"
          >
            View player
          </Link>
        ) : null}
        {teamHref && !playerHref ? (
          <Link
            href={teamHref}
            className="text-[12px] font-semibold text-muted-foreground underline-offset-4 hover:underline"
          >
            View team
          </Link>
        ) : null}
        {teamHref && playerHref ? (
          <Link
            href={teamHref}
            className="text-[12px] font-semibold text-muted-foreground underline-offset-4 hover:underline"
          >
            View team
          </Link>
        ) : null}
      </div>
    </article>
  );
}
