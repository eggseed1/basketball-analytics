import { Suspense } from "react";

import { LeaguePlayerScatterIsland } from "@/components/explore/league-player-scatter-island";
import { LeagueUsageEfficiencyIsland } from "@/components/explore/league-usage-efficiency-island";
import { PlayerRaceTrackerIsland } from "@/components/explore/player-race-tracker-island";
import {
  PlayerVisualizationsHubChrome,
  type VizView,
} from "@/components/explore/player-visualizations-hub";
import { PageHeader } from "@/components/layout/page-header";
import { getPlayerRaceTrackerSeasonOptions } from "@/data/queries/player-race-tracker";
import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
} from "@/data/providers/historical/season-range";
import { leagueScatterDefaultRankEnd, leagueScatterMeta } from "@/lib/league-player-scatter";
import {
  parsePlayerRaceFieldSize,
  parsePlayerRaceMetric,
  parsePlayerRaceMinMinutes,
  parsePlayerRaceRankEnd,
  parseVizScatterMinMinutes,
  playerRaceMetricLabel,
  type PlayerRaceFieldSize,
} from "@/lib/player-race-tracker";
import { parseVizRankEnd } from "@/lib/viz-field-filter";

export const metadata = {
  title: "Player visualizations",
  description:
    "NBA player race charts and league scatters — usage, impact, shot diet, creation, FT pressure, glass, and scoring volume.",
};

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function one(
  sp: Record<string, string | string[] | undefined>,
  key: string
): string | undefined {
  const v = sp[key];
  return Array.isArray(v) ? v[0] : v;
}

function parseView(raw: string | undefined): VizView {
  if (
    raw === "usage" ||
    raw === "diet" ||
    raw === "creation" ||
    raw === "volume" ||
    raw === "impact" ||
    raw === "ft" ||
    raw === "glass" ||
    raw === "defense" ||
    raw === "bpm"
  ) {
    return raw;
  }
  return "race";
}

function parseVizFieldSize(raw: string | undefined): PlayerRaceFieldSize {
  if (raw == null || raw === "") {
    return "all";
  }
  return parsePlayerRaceFieldSize(raw);
}

export default async function PlayerVisualizationsPage({
  searchParams,
}: PageProps) {
  const sp = await searchParams;
  const view = parseView(one(sp, "view"));
  const currentSeason = canonicalSeasonFromStartYear(currentNbaStartYear());
  const seasonParam = one(sp, "season");
  // Prefer the URL season immediately — don't block the shell on the logs manifest.
  const season =
    seasonParam && /^\d{4}-\d{2}$/.test(seasonParam)
      ? seasonParam
      : currentSeason === "2026-27"
        ? "2025-26"
        : currentSeason;
  const metric = parsePlayerRaceMetric(one(sp, "metric"));
  const metricLabel = playerRaceMetricLabel(metric).toLowerCase();
  const fieldSize = parseVizFieldSize(one(sp, "top"));
  const raceRankEnd = parsePlayerRaceRankEnd(one(sp, "end"), metric);
  const scatterKind =
    view === "diet" ||
    view === "creation" ||
    view === "volume" ||
    view === "impact" ||
    view === "ft" ||
    view === "glass" ||
    view === "defense" ||
    view === "bpm"
      ? view
      : null;
  const scatterRankEnd = scatterKind
    ? parseVizRankEnd(one(sp, "end"), leagueScatterDefaultRankEnd(scatterKind))
    : parseVizRankEnd(one(sp, "end"), "high");
  const usageRankEnd = parseVizRankEnd(one(sp, "end"), "high");
  const raceMinMinutes = parsePlayerRaceMinMinutes(one(sp, "minmp"));
  const scatterMinMinutes = parseVizScatterMinMinutes(one(sp, "minmp"));
  const pin = one(sp, "pin") ?? "";
  const team = one(sp, "team") ?? "";

  const scatterMeta = scatterKind ? leagueScatterMeta(scatterKind) : null;

  const rankEndForBlurb =
    view === "race"
      ? raceRankEnd
      : view === "usage"
        ? usageRankEnd
        : scatterRankEnd;
  const fieldBlurb =
    fieldSize === "all"
      ? "full league field"
      : rankEndForBlurb === "low"
        ? `bottom ${fieldSize}`
        : rankEndForBlurb === "both"
          ? `both ends · ${fieldSize}`
          : `top ${fieldSize}`;
  const activeMinMinutes =
    view === "race" ? raceMinMinutes : scatterMinMinutes;
  const minutesBlurb =
    activeMinMinutes > 0
      ? `, ≥${activeMinMinutes.toLocaleString()} MP`
      : "";

  const subtitle =
    view === "usage"
      ? `${season} · ${fieldBlurb}${minutesBlurb} — usage rate × true shooting. Pick a team or pin a player to highlight, or click a point to open their page.`
      : scatterMeta
        ? `${season} · ${fieldBlurb}${minutesBlurb} · ${scatterMeta.blurb} Pick a team or pin a player to highlight, or click a point to open their page.`
        : `${season} player race — ${fieldBlurb} by ${metricLabel}${minutesBlurb}. Rate stats show season levels; counting and season totals accumulate over time. Pick a team to highlight the roster, or search to pin anyone.`;

  return (
    <main className="site-shell flex flex-1 flex-col gap-5 py-6 sm:py-8">
      <PageHeader
        eyebrow="Players"
        title="Visualizations"
        subtitle={subtitle}
      />

      <Suspense fallback={null}>
        <PlayerVisualizationsHubChromeAsync
          view={view}
          season={season}
        />
      </Suspense>

      <Suspense
        fallback={
          <div className="sports-card h-[480px] animate-pulse bg-secondary/40" />
        }
      >
        {view === "usage" ? (
          <LeagueUsageEfficiencyIsland
            season={season}
            pin={pin || undefined}
            team={team || undefined}
            minMinutes={scatterMinMinutes}
            fieldSize={fieldSize}
            rankEnd={usageRankEnd}
          />
        ) : scatterKind ? (
          <LeaguePlayerScatterIsland
            kind={scatterKind}
            season={season}
            pin={pin || undefined}
            team={team || undefined}
            minMinutes={scatterMinMinutes}
            fieldSize={fieldSize}
            rankEnd={scatterRankEnd}
          />
        ) : (
          <PlayerRaceTrackerIsland
            season={season}
            metric={metric}
            topN={fieldSize}
            pin={pin || undefined}
            team={team || undefined}
            rankEnd={raceRankEnd}
            minMinutes={raceMinMinutes}
          />
        )}
      </Suspense>
    </main>
  );
}

async function PlayerVisualizationsHubChromeAsync({
  view,
  season,
}: {
  view: VizView;
  season: string;
}) {
  const seasonOptions = await getPlayerRaceTrackerSeasonOptions();
  const options = seasonOptions.length ? seasonOptions : [season];
  return (
    <PlayerVisualizationsHubChrome
      view={view}
      season={options.includes(season) ? season : (options[0] ?? season)}
      seasonOptions={options}
    />
  );
}
