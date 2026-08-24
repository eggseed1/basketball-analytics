"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";

const pulse = (
  <div className="h-64 animate-pulse rounded-xl border border-border bg-muted/40" />
);

/** Client-only chart shells — keep recharts out of the Cloudflare Worker SSR graph. */

export const GameScoringScatterLazy = dynamic(
  () =>
    import("@/components/charts/game-scoring-scatter").then((m) => ({
      default: m.GameScoringScatter,
    })),
  { ssr: false, loading: () => pulse }
);

export const RollingEfficiencyChartLazy = dynamic(
  () =>
    import("@/components/charts/rolling-efficiency-chart").then((m) => ({
      default: m.RollingEfficiencyChart,
    })),
  { ssr: false, loading: () => pulse }
);

export const PlayerShotDietLazy = dynamic(
  () =>
    import("@/components/charts/player-shot-diet").then((m) => ({
      default: m.PlayerShotDiet,
    })),
  { ssr: false, loading: () => pulse }
);

export const PlayerCareerTimelineLazy = dynamic(
  () =>
    import("@/components/charts/player-career-timeline").then((m) => ({
      default: m.PlayerCareerTimeline,
    })),
  { ssr: false, loading: () => pulse }
);

export const HistogramBoardLazy = dynamic(
  () =>
    import("@/components/dashboard/histogram-board").then((m) => ({
      default: m.HistogramBoard,
    })),
  { ssr: false, loading: () => pulse }
);

export const ScatterBoardLazy = dynamic(
  () =>
    import("@/components/dashboard/scatter-board").then((m) => ({
      default: m.ScatterBoard,
    })),
  { ssr: false, loading: () => pulse }
);

export const CategoryBarBoardLazy = dynamic(
  () =>
    import("@/components/dashboard/category-bar-board").then((m) => ({
      default: m.CategoryBarBoard,
    })),
  { ssr: false, loading: () => pulse }
);

export const SentimentTrendChartLazy = dynamic(
  () =>
    import("@/components/players/sentiment-trend-chart").then((m) => ({
      default: m.SentimentTrendChart,
    })),
  { ssr: false, loading: () => pulse }
);

export const CareerTeamTrendChartLazy = dynamic(
  () =>
    import("@/components/players/career-team-trend-chart").then((m) => ({
      default: m.CareerTeamTrendChart,
    })),
  { ssr: false, loading: () => pulse }
);

export const PlayerCareerResumeLazy = dynamic(
  () =>
    import("@/components/players/player-career-resume").then((m) => ({
      default: m.PlayerCareerResume,
    })),
  { ssr: false, loading: () => pulse }
);

export type GameScoringScatterLazyProps = ComponentProps<
  typeof GameScoringScatterLazy
>;
