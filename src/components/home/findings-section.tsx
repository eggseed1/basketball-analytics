import Link from "next/link";

import { PlayerHeadshot } from "@/components/brand/player-headshot";
import { TeamLogo } from "@/components/brand/team-logo";
import {
  InsightEventPips,
  InsightLeadByPeriod,
  InsightPeriodScoring,
  InsightScoreboard,
  InsightShootingSplits,
  InsightShotDots,
  InsightStatStrip,
  InsightTrendBars,
  InsightTripleDoubleBars,
  InsightVsSeason,
  teamColor,
} from "@/components/home/insight-visuals";
import { AppLink } from "@/components/ui/app-link";
import type { RecentInsight, RecentInsightGame } from "@/lib/recent-insights";
import { recentInsightDateLabel } from "@/lib/recent-insights";
import { teamProfileHref } from "@/lib/team-identity";
import { cn } from "@/lib/utils";

export { AnalyticsDesk } from "@/components/home/analytics-desk";

/** Game dates are Eastern calendar days, so "today" has to be too. */
function todayIsoDate(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
}

function shortDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** Homepage Recent Insights: cards from the latest completed games. */
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
        <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {insights.map((insight) => (
            <InsightCard key={insight.id} insight={insight} asOf={asOf} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

type Hero = { value: string; label: string };

function tsPct(pts: number, fga: number, fta: number): number | null {
  const denom = 2 * (fga + 0.44 * fta);
  return denom > 0 ? pts / denom : null;
}

/** Trailing margin after three periods for the eventual winner. */
function q3Deficit(game: RecentInsightGame): number | null {
  const h = game.home.periods;
  const a = game.away.periods;
  if (!h || !a || h.length < 3) return null;
  const home3 = h[0]! + h[1]! + h[2]!;
  const away3 = a[0]! + a[1]! + a[2]!;
  const homeWon = game.home.score > game.away.score;
  const d = homeWon ? away3 - home3 : home3 - away3;
  return d > 0 ? d : null;
}

function heroFor(insight: RecentInsight): Hero | null {
  const { line, game, focus, trend } = insight;
  if (line) {
    switch (focus) {
      case "points":
        return { value: String(line.points), label: "PTS" };
      case "efficiency": {
        const ts = tsPct(line.points, line.fga, line.fta);
        return ts != null ? { value: `${(ts * 100).toFixed(1)}%`, label: "True shooting" } : null;
      }
      case "rebounds":
        return { value: String(line.rebounds), label: "REB" };
      case "assists":
        return { value: String(line.assists), label: "AST" };
      case "stocks":
        return { value: String(line.steals + line.blocks), label: "STL + BLK" };
      case "triple_double":
        return { value: `${line.points}/${line.rebounds}/${line.assists}`, label: "PTS/REB/AST" };
      case "trend": {
        if (!trend?.length) return null;
        const avg = trend.reduce((s, p) => s + p.points, 0) / trend.length;
        return { value: avg.toFixed(1), label: "PPG, last 5" };
      }
    }
  }
  if (game) {
    const margin = Math.abs(game.home.score - game.away.score);
    switch (focus) {
      case "margin":
        return { value: `+${margin}`, label: "Margin" };
      case "comeback": {
        const d = q3Deficit(game);
        return d != null ? { value: `−${d}`, label: "After 3 quarters" } : null;
      }
      case "clutch":
        return { value: String(margin), label: "Point margin" };
      case "combined":
        return { value: String(game.home.score + game.away.score), label: "Combined points" };
      case "overtime":
        return { value: "OT", label: "Extra period" };
    }
  }
  return null;
}

function categoryLabel(insight: RecentInsight): string {
  const tail = insight.category.split("·")[1]?.trim() ?? insight.category;
  return tail.charAt(0) + tail.slice(1).toLowerCase();
}

function InsightCard({
  insight,
  asOf,
}: {
  insight: RecentInsight;
  asOf: string;
}) {
  const nightLabel = recentInsightDateLabel(insight.gameDate, asOf);
  const dateLabel = nightLabel
    ? nightLabel.charAt(0) + nightLabel.slice(1).toLowerCase()
    : shortDate(insight.gameDate);

  const gameHref = insight.gameId ? `/games/${encodeURIComponent(insight.gameId)}` : null;
  const playerHref = insight.playerId ? `/players/${encodeURIComponent(insight.playerId)}` : null;
  const teamHref = insight.teamId ? teamProfileHref(insight.teamId) : null;

  const { line, game, focus, trend } = insight;
  const hero = heroFor(insight);
  const accent = teamColor(insight.teamId ?? game?.home.teamId);
  const isPlayer = Boolean(line && insight.playerId);
  const hasVisual = Boolean(line || game?.home.periods);

  const visual = (() => {
    if (line) {
      switch (focus) {
        case "points":
          return (
            <div className="flex flex-col gap-3">
              <InsightVsSeason line={line} color={accent} />
              <InsightShootingSplits line={line} color={accent} />
            </div>
          );
        case "efficiency":
          return <InsightShotDots line={line} color={accent} />;
        case "rebounds":
        case "assists":
        case "stocks":
          return <InsightEventPips line={line} focus={focus} color={accent} />;
        case "triple_double":
          return <InsightTripleDoubleBars line={line} color={accent} />;
        case "trend":
          return trend?.length ? <InsightTrendBars points={trend} color={accent} /> : null;
      }
    }
    if (game?.home.periods) {
      if (focus === "combined") return <InsightPeriodScoring game={game} />;
      return (
        <InsightLeadByPeriod
          game={game}
          highlightPeriod={focus === "comeback" ? 2 : undefined}
        />
      );
    }
    return null;
  })();

  return (
    <article className="sports-card relative flex min-w-0 flex-col overflow-hidden">
      <span aria-hidden className="h-1 w-full" style={{ background: accent }} />
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-center justify-between gap-2 text-[11px]">
          <span className="rounded-full bg-secondary px-2 py-0.5 font-semibold text-foreground">
            {categoryLabel(insight)}
          </span>
          <span className="text-muted-foreground">{dateLabel}</span>
        </div>

        <div className="flex items-center gap-3">
          {isPlayer && line ? (
            <>
              <PlayerHeadshot
                playerId={insight.playerId}
                name={line.playerName}
                teamKey={insight.teamId}
                size="md"
                className="shrink-0"
              />
              <div className="min-w-0 flex-1">
                <Link
                  href={playerHref!}
                  className="block truncate text-[16px] font-bold leading-tight tracking-tight hover:underline"
                >
                  {line.playerName}
                </Link>
                <p className="mt-0.5 flex items-center gap-1.5 text-[12px] text-muted-foreground">
                  {insight.teamId ? <TeamLogo teamKey={insight.teamId} size="2xs" /> : null}
                  <span>
                    {line.teamAbbr} vs {line.opponentAbbr}
                    {line.result ? ` · ${line.result}` : ""}
                  </span>
                </p>
              </div>
            </>
          ) : game ? (
            <>
              <div className="flex shrink-0 -space-x-2">
                <TeamLogo teamKey={game.away.teamId} size="md" />
                <TeamLogo teamKey={game.home.teamId} size="md" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-[15px] font-bold leading-tight tracking-tight">
                  {insight.headline}
                </h3>
                <p className="mt-0.5 text-[12px] text-muted-foreground">
                  {game.away.abbr} at {game.home.abbr}
                </p>
              </div>
            </>
          ) : (
            <h3 className="flex-1 text-[16px] font-bold leading-snug tracking-tight">
              {insight.headline}
            </h3>
          )}
          {hero ? (
            <div className="shrink-0 text-right">
              <p
                className={cn(
                  "font-black leading-none tabular-nums tracking-tight",
                  hero.value.length > 6 ? "text-[20px]" : "text-[30px]"
                )}
                style={{ color: accent }}
              >
                {hero.value}
              </p>
              <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {hero.label}
              </p>
            </div>
          ) : null}
        </div>

        {visual ? <div className="min-w-0">{visual}</div> : null}

        {line && focus !== "points" ? <InsightStatStrip line={line} focus={focus} /> : null}

        <p className={cn("text-[12px] leading-snug text-muted-foreground", hasVisual && "line-clamp-2")}>
          {insight.description}
        </p>

        <div className="mt-auto flex items-end justify-between gap-3 border-t border-border/60 pt-2.5">
          {game ? (
            <div className={cn("w-full", isPlayer ? "max-w-[9rem]" : "max-w-[16rem]")}>
              <InsightScoreboard game={game} compact={isPlayer} />
            </div>
          ) : (
            <p className="text-[12px] text-muted-foreground">{insight.context}</p>
          )}
          <div className="flex shrink-0 flex-col items-end gap-0.5 text-[12px]">
            {gameHref ? (
              <AppLink
                href={gameHref}
                className="font-semibold text-foreground underline-offset-4 hover:underline"
              >
                Box score →
              </AppLink>
            ) : null}
            {teamHref && !isPlayer ? (
              <Link
                href={teamHref}
                className="text-muted-foreground underline-offset-4 hover:underline"
              >
                Team →
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}