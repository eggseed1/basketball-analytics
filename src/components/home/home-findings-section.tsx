import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";

import { PlayerHeadshot } from "@/components/brand/player-headshot";
import { TeamLogo } from "@/components/brand/team-logo";
import { AppLink } from "@/components/ui/app-link";
import { Badge } from "@/components/ui/badge";
import { SectionLink } from "@/components/ui/section-link";
import { formatGameCalendarDate } from "@/i18n/format-date";
import { findingHref } from "@/lib/finding-href";
import {
  insightCategoryLabel,
  insightTagColor,
} from "@/lib/insight-category";
import { resolveTeamBrand } from "@/lib/nba-brand";
import type { RecentInsight, RecentInsightGame } from "@/lib/recent-insights";
import { cn } from "@/lib/utils";

/**
 * Server-rendered Recent Insights for the homepage first paint.
 * Headlines, descriptions, heroes, and links ship in HTML. Chart SVGs stay off
 * this path (full cards remain on /findings). Marked motion-static so the text
 * is readable before MotionReveal hydrates.
 */
export async function HomeFindingsSection({
  insights,
  empty = false,
}: {
  insights: RecentInsight[];
  empty?: boolean;
}) {
  const t = await getTranslations("Home");
  const tFindings = await getTranslations("Findings");
  const tCommon = await getTranslations("Common");
  const locale = await getLocale();

  const stories = insights.filter((x) => x.focus !== "surprise");
  // Two columns: drop a lone last card rather than leave a hole. Text-first
  // cards are similar height, so no chart-weight reordering.
  const cards =
    stories.length > 1 && stories.length % 2
      ? stories.slice(0, -1)
      : stories;

  return (
    <section
      data-motion-static
      className="sports-card flex flex-col gap-3 p-4 sm:p-[21px]"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="type-heading">{t("recentInsights")}</h2>
        <SectionLink href="/findings">{tCommon("seeAll")}</SectionLink>
      </div>
      {empty ? (
        <p className="type-caption text-muted-foreground">
          {t("insightsEmpty")}
        </p>
      ) : null}
      {cards.length ? (
        <div className="grid min-w-0 items-stretch gap-4 sm:grid-cols-2">
          {cards.map((insight) => (
            <HomeFindingCard
              key={insight.id}
              insight={insight}
              locale={locale}
              category={insightCategoryLabel(insight.category, tFindings)}
              openBoxScore={tFindings("openBoxScore")}
              gameScoreFinal={(game) =>
                tFindings("gameScoreFinal", {
                  away: game.away.abbr,
                  awayScore: game.away.score,
                  home: game.home.abbr,
                  homeScore: game.home.score,
                })
              }
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function accentFor(teamId?: string | null): string {
  return resolveTeamBrand(teamId)?.primary ?? "var(--foreground)";
}

function playerScoreLabel(insight: RecentInsight): string {
  const { line, game } = insight;
  if (!line) return insight.context;
  if (!game) {
    return `${line.teamAbbr} vs ${line.opponentAbbr}${
      line.result ? ` · ${line.result}` : ""
    }`;
  }
  const mine = game.home.teamId === insight.teamId ? game.home : game.away;
  const theirs = mine === game.home ? game.away : game.home;
  return `${mine.abbr} ${mine.score}, ${theirs.abbr} ${theirs.score}${
    line.result ? ` · ${line.result}` : ""
  }`;
}

function HomeFindingCard({
  insight,
  locale,
  category,
  openBoxScore,
  gameScoreFinal,
}: {
  insight: RecentInsight;
  locale: string;
  category: string;
  openBoxScore: string;
  gameScoreFinal: (game: RecentInsightGame) => string;
}) {
  const dateLabel =
    formatGameCalendarDate(insight.gameDate, locale, "monthDayYear") ??
    insight.gameDate;
  const gameHref = insight.gameId
    ? `/games/${encodeURIComponent(insight.gameId)}`
    : null;
  const playerHref = insight.playerId
    ? `/players/${encodeURIComponent(insight.playerId)}`
    : null;
  const { line, game } = insight;
  const hero = insight.hero;
  const accent = accentFor(insight.teamId ?? game?.home.teamId);
  const isPlayer = Boolean(line && insight.playerId);
  const tagColor = insightTagColor(insight.category);

  return (
    <article className="lit-edge relative flex h-full min-w-0 flex-col overflow-hidden rounded-[11px] bg-foreground/[0.035]">
      <AppLink
        href={findingHref(insight.id)}
        className="absolute inset-0 z-[1]"
        aria-label={insight.headline}
      >
        <span className="sr-only">{insight.headline}</span>
      </AppLink>
      <span
        aria-hidden
        className="h-[3px] w-full"
        style={{ background: accent }}
      />
      <div className="pointer-events-none relative z-[2] flex h-full flex-col gap-2 p-4">
        <div className="type-caption flex items-center justify-between gap-2">
          <Badge
            size="sm"
            className="border-transparent font-bold transition-none"
            style={{
              color: tagColor,
              backgroundColor: "color-mix(in srgb, currentColor 16%, transparent)",
            }}
          >
            {category}
          </Badge>
          <span className="text-muted-foreground">{dateLabel}</span>
        </div>

        <div className="flex flex-nowrap items-center gap-2.5">
          {isPlayer && line ? (
            <>
              <PlayerHeadshot
                playerId={insight.playerId!}
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
                  {insight.teamId ? (
                    <TeamLogo teamKey={insight.teamId} size="2xs" />
                  ) : null}
                  {gameHref ? (
                    <AppLink
                      href={gameHref}
                      className="pointer-events-auto tabular-nums underline-offset-4 hover:text-foreground hover:underline"
                      title={openBoxScore}
                    >
                      {playerScoreLabel(insight)}
                    </AppLink>
                  ) : (
                    <span>{playerScoreLabel(insight)}</span>
                  )}
                </p>
              </div>
            </>
          ) : (
            <h3 className="type-body min-w-0 flex-1 font-bold leading-snug tracking-tight">
              {insight.headline}
            </h3>
          )}
          {hero ? (
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
          {game && !isPlayer && gameHref ? (
            <AppLink
              href={gameHref}
              className="pointer-events-auto ml-auto flex shrink-0 -space-x-2 rounded-full outline-offset-2 hover:opacity-70"
              aria-label={gameScoreFinal(game)}
            >
              <TeamLogo teamKey={game.away.teamId} size="sm" />
              <TeamLogo teamKey={game.home.teamId} size="sm" />
            </AppLink>
          ) : null}
        </div>

        <p
          className="type-caption line-clamp-2 min-h-7 text-muted-foreground"
          title={insight.description}
        >
          {insight.description}
        </p>
      </div>
    </article>
  );
}
