/**
 * Award-winner name boost for Cloudflare player search.
 * Puts Kobe Bryant / Kareem / etc. ahead of same-first-name modern players.
 */
import awardsFile from "./player-awards-snapshot.json";
import legendFile from "./legend-player-aliases.json";

type AwardsFile = {
  names?: Record<string, string>;
  slugs?: Record<string, string>;
};

type LegendRow = {
  espnPlayerId?: string;
  nbaPlayerId?: string;
  brefSlug?: string;
  playerName?: string;
};

function normalizeName(value: string): string {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const awards = awardsFile as AwardsFile;
const awardNames =
  awards.names && typeof awards.names === "object" ? awards.names : {};
const awardSlugs =
  awards.slugs && typeof awards.slugs === "object" ? awards.slugs : {};

const legendRows = Array.isArray(
  (legendFile as { aliases?: LegendRow[] })?.aliases
)
  ? ((legendFile as { aliases: LegendRow[] }).aliases)
  : [];

/** Normalized display name → preferred player route id. */
export const AWARD_WINNER_NAME_TO_ID: Map<string, string> = (() => {
  const map = new Map<string, string>();
  for (const [nbaId, nameRaw] of Object.entries(awardNames)) {
    const name = normalizeName(nameRaw);
    if (!name || map.has(name)) continue;
    const slug = String(awardSlugs[nbaId] ?? "")
      .trim()
      .toLowerCase();
    map.set(name, slug ? `bref:${slug}` : nbaId);
  }
  for (const row of legendRows) {
    const name = normalizeName(row.playerName ?? "");
    const slug = String(row.brefSlug ?? "")
      .trim()
      .toLowerCase();
    const espn = String(row.espnPlayerId ?? "").trim();
    if (!name || map.has(name)) continue;
    map.set(name, slug ? `bref:${slug}` : espn || String(row.nbaPlayerId ?? ""));
  }
  return map;
})();

export const AWARD_WINNER_NAMES: Set<string> = new Set(
  AWARD_WINNER_NAME_TO_ID.keys()
);

export function isAwardWinnerPlayerName(name: string): boolean {
  return AWARD_WINNER_NAMES.has(normalizeName(name));
}

/** 0 = award/legend (prefer), 1 = everyone else. */
export function awardWinnerSortRank(name: string): number {
  return isAwardWinnerPlayerName(name) ? 0 : 1;
}

/** Full-name query → preferred route id from award/legend map. */
export function awardWinnerIdForQuery(q: string): string | null {
  const key = normalizeName(q);
  if (!key || !key.includes(" ")) return null;
  return AWARD_WINNER_NAME_TO_ID.get(key) ?? null;
}
