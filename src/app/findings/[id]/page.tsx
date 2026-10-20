import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { PlayerHeadshot } from "@/components/brand/player-headshot";
import { TeamLogo } from "@/components/brand/team-logo";
import { InsightFigure, insightCategoryLabel, insightTagColor } from "@/components/home/findings-section";
import { InsightStatLine } from "@/components/home/insight-visuals";
import { InsightReturnLink } from "@/components/home/insight-morph";
import { PageHeader } from "@/components/layout/page-header";
import { AppLink } from "@/components/ui/app-link";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { GlassSurface } from "@/components/brand/glass-surface";
import { formatGameCalendarDate } from "@/i18n/format-date";
import { canonicalSeasonFromStartYear } from "@/lib/nba-season-phase";
import { insightMorphName } from "@/lib/finding-href";
import { loadFinding } from "@/lib/load-finding";
import { teamPageHref } from "@/lib/team-destination";
import { cn } from "@/lib/utils";
import type { RecentInsight, RecentInsightGame } from "@/lib/recent-insights";

type PageProps = { params: Promise<{ id: string }> };

function seasonForDate(iso: string): string {
  const year = Number(iso.slice(0, 4));
  const month = Number(iso.slice(5, 7));
  const start = month >= 7 ? year : year - 1;
  return canonicalSeasonFromStartYear(start);
}

type FindingsT = Awaited<ReturnType<typeof getTranslations>>;

function periodName(index: number, count: number, t: FindingsT): string {
  if (index < 4) return t("periodQuarter", { n: index + 1 });
  if (count === 5) return t("periodOvertime");
  return t("periodOvertimeN", { n: index - 3 });
}

async function LineScore({ game, season }: { game: RecentInsightGame; season: string }) {
  const t = await getTranslations("Findings");
  const away = game.away.periods;
  const home = game.home.periods;
  if (!away?.length || !home?.length || away.length !== home.length) return null;
  return (
    <table className="w-full text-left text-[14px] tabular-nums">
      <thead>
        <tr className="border-b border-border/40 text-muted-foreground">
          <th className="py-2 pr-3 font-semibold">{t("team")}</th>
          {away.map((_, index) => (
            <th key={index} className="px-2 py-2 text-right font-semibold">
              {periodName(index, away.length, t)}
            </th>
          ))}
          <th className="py-2 pl-3 text-right font-semibold">{t("final")}</th>
        </tr>
      </thead>
      <tbody>
        {[game.away, game.home].map((side) => (
          <tr key={side.teamId} className="border-b border-border/25 last:border-0">
            <th className="py-2 pr-3 font-semibold">
              <AppLink
                href={teamPageHref(side.teamId, { season })}
                className="inline-flex items-center gap-2 hover:underline"
              >
                <TeamLogo teamKey={side.teamId} size="2xs" />
                {side.abbr}
              </AppLink>
            </th>
            {side.periods?.map((points, index) => (
              <td key={index} className="px-2 py-2 text-right">
                {points}
              </td>
            ))}
            <td className="py-2 pl-3 text-right font-semibold">{side.score}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const insight = await loadFinding(id);
  if (!insight) {
    const t = await getTranslations("Findings");
    return { title: t("insightFallbackTitle") };
  }
  return {
    title: insight.headline,
    description: insight.description,
    alternates: { canonical: `/findings/${encodeURIComponent(insight.id)}` },
  };
}

export default async function FindingPage({ params }: PageProps) {
  const { id } = await params;
  const insight = await loadFinding(id);
  if (!insight) notFound();
  return <FindingDetail insight={insight} />;
}

async function FindingDetail({ insight }: { insight: RecentInsight }) {
  const t = await getTranslations("Findings");
  const locale = await getLocale();
  const season = seasonForDate(insight.gameDate);
  const gameHref = insight.gameId ? `/games/${encodeURIComponent(insight.gameId)}` : null;
  const playerHref = insight.playerId
    ? `/players/${encodeURIComponent(insight.playerId)}?season=${encodeURIComponent(season)}`
    : null;
  const teams = insight.game
    ? [
        { id: insight.game.away.teamId, abbr: insight.game.away.abbr },
        { id: insight.game.home.teamId, abbr: insight.game.home.abbr },
      ]
    : insight.teamId
      ? [{ id: insight.teamId, abbr: insight.line?.teamAbbr ?? insight.teamId }]
      : [];
  const scoreLabel = insight.game
    ? `${insight.game.away.abbr} ${insight.game.away.score}, ${insight.game.home.abbr} ${insight.game.home.score}`
    : null;
  const dateLabel = formatGameCalendarDate(insight.gameDate, locale, "fullDate") ?? insight.gameDate;

  return (
    <main className="site-shell flex flex-col gap-6 py-6 sm:py-8">
      <PageHeader
        title={insight.headline}
        subtitle={insight.description}
        meta={
          <span className="inline-flex flex-wrap items-center gap-2">
            <Badge
              size="sm"
              className="border-transparent font-bold transition-none"
              style={{
                color: insightTagColor(insight.category),
                backgroundColor: "color-mix(in srgb, currentColor 16%, transparent)",
              }}
            >
              {insightCategoryLabel(insight.category, t)}
            </Badge>
            <span className="text-muted-foreground">{dateLabel}</span>
          </span>
        }
        actions={
          <InsightReturnLink
            href="/findings"
            name={insightMorphName(insight.id)}
            className={buttonVariants({ variant: "secondary", size: "sm" })}
          >
            {t("backToFindings")}
          </InsightReturnLink>
        }
      >
        <div className="insight-arrive flex flex-wrap items-center gap-x-4 gap-y-2">
          {playerHref && insight.line ? (
            <AppLink href={playerHref} className="inline-flex items-center gap-2 font-semibold hover:underline">
              <PlayerHeadshot
                playerId={insight.playerId}
                name={insight.line.playerName}
                teamKey={insight.teamId}
                size="sm"
              />
              {insight.line.playerName}
            </AppLink>
          ) : null}
          {teams.map((team) => (
            <AppLink
              key={team.id}
              href={teamPageHref(team.id, { season })}
              className="inline-flex items-center gap-1.5 font-semibold hover:underline"
            >
              <TeamLogo teamKey={team.id} size="xs" />
              {team.abbr}
            </AppLink>
          ))}
          {gameHref && scoreLabel ? (
            <AppLink
              href={gameHref}
              className={cn("tabular-nums text-muted-foreground hover:text-foreground hover:underline")}
            >
              {scoreLabel}
            </AppLink>
          ) : null}
        </div>
      </PageHeader>

      <GlassSurface effect="css" className="p-4 sm:p-6">
        <InsightFigure insight={insight} />
        {insight.line && insight.focus !== "surprise" ? (
          <div className="insight-arrive mt-6">
            <InsightStatLine line={insight.line} focus={insight.focus} />
          </div>
        ) : null}
        {insight.game ? (
          <div className="insight-arrive mt-6">
            <LineScore game={insight.game} season={season} />
          </div>
        ) : null}
      </GlassSurface>
    </main>
  );
}
