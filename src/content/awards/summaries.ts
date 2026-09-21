import type { AwardDefinition } from "@/content/awards/catalog";
import type { AwardHistoryRow } from "@/content/awards/history";
import { getAwardHistory } from "@/content/awards/history";

export type AwardCardSummary = {
  slug: string;
  rowCount: number;
  countLabel: string;
  latestLabel: string;
  latestHref?: string;
  latestSeason?: string;
};

function countLabelFor(award: AwardDefinition, n: number): string {
  switch (award.slug) {
    case "all-star":
      return `${n} players`;
    case "hall-of-fame":
      return `${n} inductees`;
    case "championships":
      return `${n} titles`;
    case "all-nba":
    case "all-defense":
      return `${n} selections`;
    default:
      return `${n} seasons`;
  }
}

/** Landing-card stats from the history bake (newest-first lists). */
export function summarizeAwardCard(
  award: AwardDefinition,
  rows: AwardHistoryRow[] = getAwardHistory(award.slug)
): AwardCardSummary {
  const latest = rows[0];
  return {
    slug: award.slug,
    rowCount: rows.length,
    countLabel: countLabelFor(award, rows.length),
    latestLabel: latest?.winner ?? "—",
    latestHref: latest?.href,
    latestSeason:
      latest && !/^\d+×$/.test(latest.season.trim())
        ? latest.season
        : undefined,
  };
}

export function summarizeAllAwardCards(
  awards: AwardDefinition[]
): AwardCardSummary[] {
  return awards.map((a) => summarizeAwardCard(a));
}

/** Decade key like "2020s" from a season/year string, or null. */
export function decadeKeyFromSeason(season: string): string | null {
  const trimmed = season.trim();
  if (/^\d+×$/.test(trimmed)) return null;
  const yearMatch = /^(\d{4})(?:-\d{2})?$/.exec(trimmed);
  if (!yearMatch) return null;
  const year = Number(yearMatch[1]);
  if (!Number.isFinite(year)) return null;
  const decade = Math.floor(year / 10) * 10;
  return `${decade}s`;
}
