/**
 * Season-in-review helpers: awards for a season and draft-year mapping.
 */

import { AWARD_DEFINITIONS } from "@/content/awards/catalog";
import { getAwardHistory } from "@/content/awards/history";
import { startYearFromCanonicalSeason } from "@/data/providers/historical/season-range";

const SEASON_AWARD_SLUGS = [
  "championships",
  "mvp",
  "finals-mvp",
  "dpoy",
  "roy",
] as const;

export type SeasonAwardRow = {
  slug: string;
  shortLabel: string;
  title: string;
  winner: string;
  href?: string;
  note?: string;
  kind: "player" | "team";
  /** Route id for headshot / team mark (player id or canonical team id). */
  entityId?: string;
};

function entityFromHref(
  href: string | undefined,
  slug: string
): { kind: "player" | "team"; entityId?: string } {
  if (!href) {
    return { kind: slug === "championships" ? "team" : "player" };
  }
  const player = href.match(/\/players\/([^/?#]+)/);
  if (player?.[1]) return { kind: "player", entityId: player[1] };
  const team = href.match(/\/teams\/([^/?#]+)/);
  if (team?.[1]) return { kind: "team", entityId: team[1] };
  return { kind: slug === "championships" ? "team" : "player" };
}

/** Major awards won for this season (champion, MVP, FMVP, DPOY, ROY). */
export function awardsForSeason(season: string): SeasonAwardRow[] {
  const out: SeasonAwardRow[] = [];
  for (const slug of SEASON_AWARD_SLUGS) {
    const def = AWARD_DEFINITIONS.find((a) => a.slug === slug);
    if (!def) continue;
    const hit = getAwardHistory(slug).find((row) => row.season === season);
    if (!hit) continue;
    const entity = entityFromHref(hit.href, slug);
    out.push({
      slug,
      shortLabel: slug === "championships" ? "Champion" : def.shortLabel,
      title: def.title,
      winner: hit.winner,
      href: hit.href,
      note: hit.note,
      kind: entity.kind,
      entityId: entity.entityId,
    });
  }
  return out;
}

/** Calendar draft year that stocks the season (1978-79 → 1978). */
export function draftYearForSeason(season: string): number | null {
  try {
    return startYearFromCanonicalSeason(season);
  } catch {
    return null;
  }
}
