import "server-only";

import type { GameBoxScore } from "@/data/types";
import {
  transformEspnBoxScore,
  type EspnSummaryResponse,
} from "@/data/transformers/espn";
import { canonicalSeasonFromStartYear } from "@/data/providers/historical/season-range";

const CDN_BASE = "https://cdn.espn.com/core/nba";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * ESPN's CDN wrapper has changed shape over time (`content`, `gamepackageJSON`,
 * nested page modules). Find the actual site-summary object without coupling the
 * route to one wrapper revision.
 */
function findSummary(value: unknown, depth = 0): EspnSummaryResponse | null {
  if (depth > 7) return null;

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        return findSummary(JSON.parse(trimmed), depth + 1);
      } catch {
        return null;
      }
    }
    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findSummary(item, depth + 1);
      if (found) return found;
    }
    return null;
  }

  if (!isRecord(value)) return null;

  const header = value.header;
  if (
    isRecord(header) &&
    Array.isArray(header.competitions) &&
    header.competitions.length > 0
  ) {
    return value as EspnSummaryResponse;
  }

  // Check common wrapper keys first, then fall back to a bounded recursive scan.
  for (const key of [
    "gamepackageJSON",
    "gamepackage",
    "content",
    "page",
    "boxscore",
    "game",
  ]) {
    if (!(key in value)) continue;
    const found = findSummary(value[key], depth + 1);
    if (found) return found;
  }

  for (const nested of Object.values(value)) {
    const found = findSummary(nested, depth + 1);
    if (found) return found;
  }
  return null;
}

async function fetchCdnPayload(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json, text/plain, */*",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36",
    },
    signal: AbortSignal.timeout(3_000),
    next: { revalidate: 60 * 10 },
  } as RequestInit);
  if (!response.ok) {
    throw new Error(`ESPN CDN request failed (${response.status}): ${url}`);
  }
  return response.json();
}

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
  const id = String(gameId ?? "").trim();
  if (!/^40\d{6,}$/.test(id)) return null;

  // `game` contains the complete `gamepackageJSON` (header + boxscore). Trying
  // `boxscore` first can return a slim wrapper without the header we need to
  // normalize teams/status, wasting the entire serverless budget.
  const urls = [
    `${CDN_BASE}/game?xhr=1&gameId=${encodeURIComponent(id)}`,
    `${CDN_BASE}/boxscore?xhr=1&gameId=${encodeURIComponent(id)}`,
  ];

  let lastError: unknown;
  for (const url of urls) {
    try {
      const payload = await fetchCdnPayload(url);
      const summary = findSummary(payload);
      if (!summary) continue;
      const transformed = transformEspnBoxScore(
        summary,
        seasonFromSummary(summary, seasonHint)
      );
      if (transformed?.game?.id) return transformed;
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) throw lastError;
  return null;
}
