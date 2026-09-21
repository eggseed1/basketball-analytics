/**
 * View-gated loaders for heavy player-page islands.
 * Dynamic import keeps shooting / games / depth / sentiment / career-analysis
 * off the default overview module graph (CF Worker + overview first paint).
 */

import type { ComponentProps } from "react";

export async function PlayerGamesIslandDeferred(
  props: ComponentProps<
    typeof import("@/components/players/player-games-island").PlayerGamesIsland
  >
) {
  const { PlayerGamesIsland } = await import(
    "@/components/players/player-games-island"
  );
  return <PlayerGamesIsland {...props} />;
}

export async function PlayerVisualizationsIslandDeferred(
  props: ComponentProps<
    typeof import("@/components/players/player-visualizations").PlayerVisualizationsIsland
  >
) {
  const { PlayerVisualizationsIsland } = await import(
    "@/components/players/player-visualizations"
  );
  return <PlayerVisualizationsIsland {...props} />;
}

export async function PlayerStatDepthIslandDeferred(
  props: ComponentProps<
    typeof import("@/components/players/player-stat-depth-island").PlayerStatDepthIsland
  >
) {
  const { PlayerStatDepthIsland } = await import(
    "@/components/players/player-stat-depth-island"
  );
  return <PlayerStatDepthIsland {...props} />;
}

export async function PlayerSentimentTabIslandDeferred(
  props: ComponentProps<
    typeof import("@/components/players/player-sentiment-tab-island").PlayerSentimentTabIsland
  >
) {
  const { PlayerSentimentTabIsland } = await import(
    "@/components/players/player-sentiment-tab-island"
  );
  return <PlayerSentimentTabIsland {...props} />;
}

export async function PlayerCareerAnalysisIslandDeferred(
  props: ComponentProps<
    typeof import("@/components/players/player-career-analysis-island").PlayerCareerAnalysisIsland
  >
) {
  const { PlayerCareerAnalysisIsland } = await import(
    "@/components/players/player-career-analysis-island"
  );
  return <PlayerCareerAnalysisIsland {...props} />;
}
