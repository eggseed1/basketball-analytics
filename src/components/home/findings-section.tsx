import Link from "next/link";

import { PlayerHeadshot } from "@/components/brand/player-headshot";
import { TeamLogo } from "@/components/brand/team-logo";
import {
  InsightContributorBars,
  InsightEventPips,
  InsightFlowChart,
  InsightLeadWorm,
  InsightPeriodBars,
  InsightPointsMix,
  InsightQuarterStack,
  InsightShootingSplits,
  InsightShotDots,
  InsightStatLine,
  InsightTrendBars,
  InsightTripleDoubleRings,
  InsightVsNorm,
  pointsAddUp,
  teamColor,
} from "@/components/home/insight-visuals";
import { AppLink } from "@/components/ui/app-link";
import type { RecentInsight, RecentInsightGame } from "@/lib/recent-insights";
import { recentInsightDateLabel, surpriseRule } from "@/lib/recent-insights";
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
  const stories = insights.filter((x) => x.focus !== "surprise");
  // Two columns, so an odd last card would leave a hole; drop it instead.
  const cards = stories.length > 1 && stories.length % 2 ? stories.slice(0, -1) : stories;

  return (
    <section className="sports-card flex flex-col gap-3 p-4 sm:p-[21px]">
      <div>
        <h2 className="type-heading">Recent Insights</h2>
        <p className="type-body-sm text-muted-foreground">
          {empty
            ? "No games in the latest window. Insights will update as new games are completed."
            : seasonLabel
              ? `What stood out in the latest ${seasonLabel} games.`
              : "What stood out in the latest games."}
        </p>
      </div>
      {cards.length ? (
        <div data-motion-list className="grid min-w-0 gap-3 sm:grid-cols-2">
          {cards.map((insight) => (
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
  if (insight.hero) return insight.hero;
  const { line, game, focus, trend } = insight;
  if (line) {
    switch (focus) {
      case "surprise": {
        const stat = line.surpriseStat;
        if (!stat || !line.baseline) return null;
        const rule = surpriseRule(stat);
        return {
          value: `+${Math.round(line[stat] - line.baseline[stat])}`,
          label: `${rule.label} over avg`,
        };
      }
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

/** "DET 109, PHX 107 · W", the player's team first. */
function playerScoreLabel(insight: RecentInsight): string {
  const { line, game } = insight;
  if (!line) return insight.context;
  if (!game) return `${line.teamAbbr} vs ${line.opponentAbbr}${line.result ? ` · ${line.result}` : ""}`;
  const mine = game.home.teamId === insight.teamId ? game.home : game.away;
  const theirs = mine === game.home ? game.away : game.home;
  return `${mine.abbr} ${mine.score}, ${theirs.abbr} ${theirs.score}${line.result ? ` · ${line.result}` : ""}`;
}

function gameScoreLabel(game: RecentInsightGame): string {
  return `Final: ${game.away.abbr} ${game.away.score}, ${game.home.abbr} ${game.home.score}`;
}

function ScoreLink({ href, label }: { href: string | null; label: string }) {
  if (!href) return <span>{label}</span>;
  return (
    <AppLink
      href={href}
      className="relative z-[2] tabular-nums underline-offset-4 hover:text-foreground hover:underline"
      title="Open box score"
    >
      {label}
    </AppLink>
  );
}

function categoryLabel(insight: RecentInsight): string {
  const tail = insight.category.split("·")[1]?.trim() ?? insight.category;
  return tail.charAt(0) + tail.slice(1).toLowerCase();
}

function InsightCard({ insight, asOf }: { insight: RecentInsight; asOf: string }) {
  const nightLabel = recentInsightDateLabel(insight.gameDate, asOf);
  const dateLabel = nightLabel
    ? nightLabel.charAt(0) + nightLabel.slice(1).toLowerCase()
    : shortDate(insight.gameDate);

  const gameHref = insight.gameId ? `/games/${encodeURIComponent(insight.gameId)}` : null;
  const playerHref = insight.playerId ? `/players/${encodeURIComponent(insight.playerId)}` : null;

  const { line, game, focus, trend } = insight;
  const hero = heroFor(insight);
  const accent = teamColor(insight.teamId ?? game?.home.teamId);
  const isPlayer = Boolean(line && insight.playerId);
  const cardHref = isPlayer ? playerHref : (gameHref ?? playerHref);
  const visual = (() => {
    if (line) {
      switch (focus) {
        case "surprise":
          return <InsightVsNorm line={line} color={accent} />;
        case "points":
          return pointsAddUp(line) ? (
            <InsightPointsMix line={line} color={accent} />
          ) : (
            <InsightShootingSplits line={line} color={accent} />
          );
        case "efficiency":
          return <InsightShotDots line={line} color={accent} />;
        case "rebounds":
        case "assists":
        case "stocks":
          return <InsightEventPips line={line} focus={focus} color={accent} />;
        case "triple_double":
          return <InsightTripleDoubleRings line={line} color={accent} />;
        case "trend":
          return trend?.length ? <InsightTrendBars points={trend} color={accent} /> : null;
        case "takeover":
          return insight.periodPoints ? (
            <InsightPeriodBars
              periodPoints={insight.periodPoints}
              focusPeriod={insight.focusPeriod}
              color={accent}
            />
          ) : null;
      }
    }
    if (focus === "threes" && insight.contributors?.length) {
      return <InsightContributorBars items={insight.contributors.slice(0, 4)} color={accent} />;
    }
    if (game && focus === "quarter") {
      return <InsightQuarterStack game={game} focusPeriod={insight.focusPeriod} />;
    }
    if (game?.flow) return <InsightFlowChart game={game} />;
    if (game?.home.periods) {
      if (focus === "combined") return <InsightQuarterStack game={game} />;
      return <InsightLeadWorm game={game} focus={focus} />;
    }
    return null;
  })();

  return (
    <article
      data-motion={cardHref ? "card" : undefined}
      className={cn(
        "relative flex min-w-0 flex-col overflow-hidden rounded-[11px] bg-foreground/[0.035] ring-1 ring-inset ring-foreground/[0.06]",
        cardHref &&
          "transition-[background-color,box-shadow] hover:bg-foreground/[0.06] hover:ring-foreground/[0.14] has-[a[data-card-link]:focus-visible]:ring-2 has-[a[data-card-link]:focus-visible]:ring-ring"
      )}
    >
      {cardHref ? (
        <Link
          href={cardHref}
          data-card-link
          aria-label={
            isPlayer && line
              ? `${line.playerName}: ${insight.headline}`
              : `${insight.headline}. Open the game`
          }
          className="absolute inset-0 z-[1] rounded-[11px] outline-none"
        />
      ) : null}
      <span aria-hidden className="h-[3px] w-full" style={{ background: accent }} />
      <div className="flex flex-1 flex-col gap-2 px-3.5 pb-3 pt-2.5">
        <div className="flex items-center justify-between gap-2 text-[11px]">
          <span className="font-bold uppercase tracking-[0.1em]" style={{ color: accent }}>
            {categoryLabel(insight)}
          </span>
          <span className="text-muted-foreground">{dateLabel}</span>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {isPlayer && line ? (
            <>
              <PlayerHeadshot
                playerId={insight.playerId}
                name={line.playerName}
                teamKey={insight.teamId}
                size="sm"
                className="shrink-0"
              />
              <div className="min-w-[8rem] flex-1">
                <Link
                  href={playerHref!}
                  className="relative z-[2] block truncate text-[15px] font-bold leading-tight tracking-tight hover:underline"
                >
                  {line.playerName}
                </Link>
                <p className="mt-0.5 flex items-center gap-1.5 text-[12px] text-muted-foreground">
                  {insight.teamId ? <TeamLogo teamKey={insight.teamId} size="2xs" /> : null}
                  <ScoreLink href={gameHref} label={playerScoreLabel(insight)} />
                </p>
              </div>
            </>
          ) : game ? (
            <>
              {hero ? (
                <div className="min-w-0 flex-1">
                  <h3 className="sr-only">{insight.headline}</h3>
                  <p
                    className="text-[30px] font-black leading-none tabular-nums tracking-tight"
                    style={{ color: accent }}
                  >
                    {hero.value}
                  </p>
                  <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {hero.label}
                  </p>
                </div>
              ) : (
                <h3 className="min-w-[8rem] flex-1 text-[16px] font-bold leading-snug tracking-tight">
                  {insight.headline}
                </h3>
              )}
              <div className="ml-auto flex shrink-0 flex-col items-end gap-1">
                <div className="flex -space-x-2">
                  <TeamLogo teamKey={game.away.teamId} size="sm" />
                  <TeamLogo teamKey={game.home.teamId} size="sm" />
                </div>
                <p className="text-[12px] text-muted-foreground">
                  <ScoreLink href={gameHref} label={gameScoreLabel(game)} />
                </p>
              </div>
            </>
          ) : (
            <h3 className="min-w-[8rem] flex-1 text-[16px] font-bold leading-snug tracking-tight">
              {insight.headline}
            </h3>
          )}
          {hero && (isPlayer || !game) ? (
            <div className="ml-auto shrink-0 text-right">
              <p
                className={cn(
                  "font-black leading-none tabular-nums tracking-tight",
                  hero.value.length > 6 ? "text-[22px]" : "text-[30px]"
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

        <p className="line-clamp-2 text-[12px] leading-snug text-muted-foreground" title={insight.description}>
          {insight.description}
        </p>

        {visual || (line && focus !== "surprise") ? (
          <div className="mt-auto flex min-w-0 flex-col gap-2">
            {visual}
            {line && focus !== "surprise" ? <InsightStatLine line={line} focus={focus} /> : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}