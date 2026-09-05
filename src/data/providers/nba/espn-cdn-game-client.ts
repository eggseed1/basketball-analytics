import "server-only";

import type { GameBoxScore } from "@/data/types";
import {
  transformEspnBoxScore,
  type EspnSummaryResponse,
} from "@/data/transformers/espn";
import { canonicalSeasonFromStartYear } from "@/data/providers/historical/season-range";
import { fetchEspnCdnGameSummary } from "./espn-cdn-summary";

export { fetchEspnCdnGameSummary } from "./espn-cdn-summary";

function seasonFromSummary(
  summary: EspnSummaryResponse,
  seasonHint?: string
): string {
  const endYear = summary.header?.season?.year;
  if (typeof endYear === "number" && Number.isFinite(endYear)) {
    return canonicalSeasonFromStartYear(endYear - 1);
  }
  return seasonHint ?? canonicalSeasonFromStartYear(new Date().getUTCFullYear() - 1);
}

/**
 * Independent CDN fallback for ESPN event ids (40xxxxxxx). `site.api.espn.com`
 * can be unreachable from some Vercel egress ranges while cdn.espn.com remains
 * healthy. The CDN uses the same ESPN event id namespace as public game links.
 */
export async function fetchEspnCdnGameBoxScore(
  gameId: string,
  seasonHint?: string
): Promise<GameBoxScore | null> {
  const summary = await fetchEspnCdnGameSummary(gameId);
  if (!summary) return null;
  const transformed = transformEspnBoxScore(
    summary,
    seasonFromSummary(summary, seasonHint)
  );
  return transformed?.game?.id ? transformed : null;
}
