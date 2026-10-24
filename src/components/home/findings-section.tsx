import Link from "next/link";

import { PlayerHeadshot } from "@/components/brand/player-headshot";
import { TeamLogo } from "@/components/brand/team-logo";
import {
  InsightContributorBars,
  InsightEventPips,
  InsightMomentChart,
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
import { InsightCardLink, InsightMorph } from "@/components/home/insight-morph";
import { AppLink } from "@/components/ui/app-link";
import { Badge } from "@/components/ui/badge";
import { SectionLink } from "@/components/ui/section-link";
import type { RecentInsight, RecentInsightGame } from "@/lib/recent-insights";
import { findingHref, insightMorphName } from "@/lib/finding-href";
import {
  insightCategoryLabel,
  insightTagColor,
} from "@/lib/insight-category";
import { surpriseRule } from "@/lib/recent-insights";
import { formatGameCalendarDate } from "@/i18n/format-date";
import { cn } from "@/lib/utils";
import { useLocale, useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";

export { AnalyticsDesk } from "@/components/home/analytics-desk";
export { insightCategoryLabel, insightTagColor } from "@/lib/insight-category";

/** Game dates are Eastern calendar days, so "today" has to be too. */
function todayIsoDate(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
}

function writtenDate(iso: string, locale: string): string {
  return formatGameCalendarDate(iso, locale, "monthDayYear") ?? iso;
}

/**
 * Estimated content height in px. Tuned to the rendered cards: a two-mark meter
 * is the short one, period bars and the lead chart sit together, and a quarter
 * stack with its caption runs taller.
 */
function visualWeight(insight: RecentInsight): number {
  const { line, game, focus, trend, moment } = insight;
  const header = line && insight.playerId ? 96 : 80;

  if (moment) {
    if (moment.kind === "share" || moment.kind === "threes") return header + 40;
    if (moment.kind === "clean") {
      const rows = moment.marks.filter((m) => m.label !== "TOV").length;
      return header + 28 + rows * 22;
    }
    const row = moment.kind === "splits" ? 20 : 18;
    return header + moment.marks.length * row;
  }

  if (line) {
    switch (focus) {
      case "surprise":
        return header + 72;
      case "points":
        return header + (pointsAddUp(line) ? 56 : 60);
      case "efficiency":
        return header + 64;
      case "rebounds":
      case "assists":
        return header + 36;
      case "stocks":
        return header + 52;
      case "triple_double":
        return header + 84;
      case "trend":
        return header + (trend?.length ? 64 : 20);
      case "takeover":
        return header + (insight.periodPoints ? 72 : 20);
      default:
        return header + 20;
    }
  }

  if (focus === "threes" && insight.contributors?.length) {
    return header + 16 + Math.min(4, insight.contributors.length) * 22;
  }
  if (game && focus === "quarter") return header + 132;
  if (game?.flow) return header + 93;
  if (game?.home.periods) {
    if (focus === "combined") return header + 132;
    return header + 93;
  }
  return header;
}

/**
 * Rows of the closest heights. The earlier story stays on the left, and the
 * row that contains the earliest story stays first.
 */
export function orderByHeight(items: RecentInsight[], columns: number): RecentInsight[] {
  const width = Math.max(1, columns);
  const ranked = items
    .map((insight, index) => ({ insight, index, weight: visualWeight(insight) }))
    .sort((a, b) => a.weight - b.weight || a.index - b.index);
  const rows: Array<typeof ranked> = [];
  for (let i = 0; i < ranked.length; i += width) {
    rows.push(ranked.slice(i, i + width).sort((a, b) => a.index - b.index));
  }
  rows.sort((a, b) => a[0]!.index - b[0]!.index);
  return rows.flatMap((row) => row.map((item) => item.insight));
}

function pairByHeight(items: RecentInsight[]): RecentInsight[] {
  return orderByHeight(items, 2);
}

/** Homepage Recent Insights: cards from the latest completed games. */
export async function FindingsSection({
  insights,
  empty = false,
}: {
  insights: RecentInsight[];
  empty?: boolean;
}) {
  const t = await getTranslations("Home");
  const tCommon = await getTranslations("Common");
  const asOf = todayIsoDate();
  const stories = insights.filter((x) => x.focus !== "surprise");
  // Two columns, so an odd last card would leave a hole; drop it instead.
  const even = stories.length > 1 && stories.length % 2 ? stories.slice(0, -1) : stories;
  const cards = pairByHeight(even);

  return (
    <section
      className="sports-card flex flex-col gap-3 p-4 sm:p-[21px]"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="type-heading">{t("recentInsights")}</h2>
        <SectionLink href="/findings">{tCommon("seeAll")}</SectionLink>
      </div>
      {empty ? (
        <p className="type-caption text-muted-foreground">{t("insightsEmpty")}</p>
      ) : null}
      {cards.length ? (
        <div data-motion-list className="grid min-w-0 items-stretch gap-4 sm:grid-cols-2">
          {cards.map((insight) => (
            <InsightCard key={insight.id} insight={insight} asOf={asOf} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

type Hero = { value: string; label: string };

type FindingsTranslator = ReturnType<typeof useTranslations>;

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

/**
 * The card's big number and label. Labels the generator already wrote into
 * `insight.hero` stay as archived; the ones built here follow the UI locale.
 * Stat abbreviations (PTS, REB, AST, STL + BLK) stay literal.
 */
function heroFor(insight: RecentInsight, t: FindingsTranslator): Hero | null {
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
          label: t("heroOverAvg", { label: rule.label }),
        };
      }
      case "points":
        return { value: String(line.points), label: "PTS" };
      case "efficiency": {
        const ts = tsPct(line.points, line.fga, line.fta);
        return ts != null ? { value: `${(ts * 100).toFixed(1)}%`, label: t("heroTrueShooting") } : null;
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
        return { value: avg.toFixed(1), label: t("heroPpgLast5") };
      }
    }
  }
  if (game) {
    const margin = Math.abs(game.home.score - game.away.score);
    switch (focus) {
      case "margin":
        return { value: `+${margin}`, label: t("heroMargin") };
      case "comeback": {
        const d = q3Deficit(game);
        return d != null ? { value: `−${d}`, label: t("heroAfterThree") } : null;
      }
      case "clutch":
        return { value: String(margin), label: t("heroPointMargin") };
      case "combined":
        return { value: String(game.home.score + game.away.score), label: t("heroCombinedPoints") };
      case "overtime":
        return { value: "OT", label: t("heroExtraPeriod") };
    }
  }
  return null;
}

/** "DET 109, PHX 107 · W", the player's team first. */
function playerScoreLabel(insight: RecentInsight, t: FindingsTranslator): string {
  const { line, game } = insight;
  if (!line) return insight.context;
  if (!game) return `${t("playerVsOpponent", { team: line.teamAbbr, opponent: line.opponentAbbr })}${line.result ? ` · ${line.result}` : ""}`;
  const mine = game.home.teamId === insight.teamId ? game.home : game.away;
  const theirs = mine === game.home ? game.away : game.home;
  return `${mine.abbr} ${mine.score}, ${theirs.abbr} ${theirs.score}${line.result ? ` · ${line.result}` : ""}`;
}

function gameScoreLabel(game: RecentInsightGame, t: FindingsTranslator): string {
  return t("gameScoreFinal", {
    away: game.away.abbr,
    awayScore: game.away.score,
    home: game.home.abbr,
    homeScore: game.home.score,
  });
}

function ScoreLink({ href, label }: { href: string | null; label: string }) {
  const t = useTranslations("Findings");
  if (!href) return <span>{label}</span>;
  return (
    <AppLink
      href={href}
      className="pointer-events-auto tabular-nums underline-offset-4 hover:text-foreground hover:underline"
      title={t("openBoxScore")}
    >
      {label}
    </AppLink>
  );
}

function categoryLabel(insight: RecentInsight, t: FindingsTranslator): string {
  return insightCategoryLabel(insight.category, t);
}

function tagColor(category: string): string {
  return insightTagColor(category);
}

function insightVisual(insight: RecentInsight) {
  const { line, game, focus, trend } = insight;
  const accent = teamColor(insight.teamId ?? game?.home.teamId);
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
      case "moment":
        return insight.moment ? <InsightMomentChart moment={insight.moment} color={accent} /> : null;
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
}

/** The same chart as the card, named so it can grow into the detail page. */
export function InsightFigure({ insight }: { insight: RecentInsight }) {
  const visual = insightVisual(insight);
  if (!visual) return null;
  return <InsightMorph name={insightMorphName(insight.id)}>{visual}</InsightMorph>;
}

/** `asOf` is unused. The card writes the game date. */
export function InsightCard({ insight, asOf: _asOf }: { insight: RecentInsight; asOf: string | null }) {
  const t = useTranslations("Findings");
  const locale = useLocale();
  const dateLabel = writtenDate(insight.gameDate, locale);

  const gameHref = insight.gameId ? `/games/${encodeURIComponent(insight.gameId)}` : null;
  const playerHref = insight.playerId ? `/players/${encodeURIComponent(insight.playerId)}` : null;

  const { line, game, focus } = insight;
  const hero = heroFor(insight, t);
  const accent = teamColor(insight.teamId ?? game?.home.teamId);
  const isPlayer = Boolean(line && insight.playerId);
  const cardHref = isPlayer ? playerHref : (gameHref ?? playerHref);
  const visual = insightVisual(insight);

  return (
    <article
      data-motion={cardHref ? "card" : undefined}
      className="lit-edge relative flex h-full min-w-0 flex-col overflow-hidden rounded-[11px] bg-foreground/[0.035]"
    >
      <InsightCardLink href={findingHref(insight.id)} name={insightMorphName(insight.id)} label={insight.headline} />
      <span aria-hidden className="h-[3px] w-full" style={{ background: accent }} />
      <div className="pointer-events-none relative z-[2] flex h-full flex-col p-4">
        <div className="flex flex-col gap-2">
        <div className="type-caption flex items-center justify-between gap-2">
          <Badge
            size="sm"
            className="border-transparent font-bold transition-none"
            style={{
              color: tagColor(insight.category),
              backgroundColor: "color-mix(in srgb, currentColor 16%, transparent)",
            }}
          >
            {categoryLabel(insight, t)}
          </Badge>
          <span className="text-muted-foreground">{dateLabel}</span>
        </div>

        <div className="flex flex-nowrap items-center gap-2.5">
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
                  className="type-body pointer-events-auto block truncate font-bold leading-tight tracking-tight hover:underline"
                >
                  {line.playerName}
                </Link>
                <p className="type-caption mt-0.5 flex items-center gap-1.5 text-muted-foreground">
                  {insight.teamId ? <TeamLogo teamKey={insight.teamId} size="2xs" /> : null}
                  <ScoreLink href={gameHref} label={playerScoreLabel(insight, t)} />
                </p>
              </div>
            </>
          ) : game ? (
            <>
              {hero && !visual ? (
                <div className="min-w-0 flex-1">
                  <h3 className="sr-only">{insight.headline}</h3>
                  <p
                    className="text-[30px] font-black leading-none tabular-nums tracking-tight"
                    style={{ color: accent }}
                  >
                    {hero.value}
                  </p>
                  <p className="type-micro mt-1 font-semibold uppercase tracking-wide text-muted-foreground">
                    {hero.label}
                  </p>
                </div>
              ) : (
                <h3 className="type-body min-w-0 flex-1 truncate font-bold leading-snug tracking-tight">
                  {insight.headline}
                </h3>
              )}
              {gameHref ? (
                <AppLink
                  href={gameHref}
                  className="pointer-events-auto ml-auto flex shrink-0 -space-x-2 rounded-full outline-offset-2 hover:opacity-70"
                  aria-label={gameScoreLabel(game, t)}
                >
                  <TeamLogo teamKey={game.away.teamId} size="sm" />
                  <TeamLogo teamKey={game.home.teamId} size="sm" />
                </AppLink>
              ) : (
                <div className="ml-auto flex shrink-0 -space-x-2">
                  <TeamLogo teamKey={game.away.teamId} size="sm" />
                  <TeamLogo teamKey={game.home.teamId} size="sm" />
                </div>
              )}
            </>
          ) : (
            <h3 className="type-body min-w-[8rem] flex-1 font-bold leading-snug tracking-tight">
              {insight.headline}
            </h3>
          )}
          {hero && !visual && (isPlayer || !game) ? (
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
              <p className="type-micro mt-1 font-semibold uppercase tracking-wide text-muted-foreground">
                {hero.label}
              </p>
            </div>
          ) : null}
        </div>

        {game && !isPlayer && gameHref ? (
          <AppLink
            href={gameHref}
            className="type-caption pointer-events-auto -mt-0.5 self-end text-muted-foreground hover:text-foreground hover:underline"
          >
            {gameScoreLabel(game, t)}
          </AppLink>
        ) : null}

        <p className="type-caption line-clamp-2 min-h-7 text-muted-foreground" title={insight.description}>
          {insight.description}
        </p>
        </div>

        {visual ? (
          <div className="mt-6 min-w-0">
            <InsightMorph name={insightMorphName(insight.id)}>{visual}</InsightMorph>
          </div>
        ) : null}
        {!visual && line && focus !== "surprise" ? (
          <div className="mt-6 min-w-0">
            <InsightStatLine line={line} focus={focus} />
          </div>
        ) : null}
        <div aria-hidden className="min-h-4 flex-1" />
      </div>
    </article>
  );
}