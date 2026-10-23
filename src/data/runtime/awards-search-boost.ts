/**
 * Award-winner name boost for Cloudflare player search.
 * Puts Kobe Bryant / Kareem / etc. ahead of same-first-name modern players.
 *
 * Legend seed stays on the module graph; awards names/slugs load from ASSETS.
 */
import legendFile from "./legend-player-aliases.json";
import { getBundledPlayerAwardsNameMaps } from "./player-awards-snapshot";

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

const legendRows = Array.isArray(
  (legendFile as { aliases?: LegendRow[] })?.aliases
)
  ? ((legendFile as { aliases: LegendRow[] }).aliases)
  : [];

/** Normalized display name → preferred player route id. */
export const AWARD_WINNER_NAME_TO_ID: Map<string, string> = new Map();

export const AWARD_WINNER_NAMES: Set<string> = new Set();

let primed = false;

function primeAwardWinnerMaps(): void {
  if (primed) return;
  primed = true;
  const { names: awardNames, slugs: awardSlugs } =
    getBundledPlayerAwardsNameMaps();
  for (const [nbaId, nameRaw] of Object.entries(awardNames)) {
    const name = normalizeName(nameRaw);
    if (!name || AWARD_WINNER_NAME_TO_ID.has(name)) continue;
    const slug = String(awardSlugs[nbaId] ?? "")
      .trim()
      .toLowerCase();
    AWARD_WINNER_NAME_TO_ID.set(name, slug ? `bref:${slug}` : nbaId);
  }
  for (const row of legendRows) {
    const name = normalizeName(row.playerName ?? "");
    const slug = String(row.brefSlug ?? "")
      .trim()
      .toLowerCase();
    const espn = String(row.espnPlayerId ?? "").trim();
    if (!name || AWARD_WINNER_NAME_TO_ID.has(name)) continue;
    AWARD_WINNER_NAME_TO_ID.set(
      name,
      slug ? `bref:${slug}` : espn || String(row.nbaPlayerId ?? "")
    );
  }
  for (const key of AWARD_WINNER_NAME_TO_ID.keys()) {
    AWARD_WINNER_NAMES.add(key);
  }
}

export async function ensureAwardWinnerSearchBoost(): Promise<void> {
  const { ensurePlayerAwards } = await import("./player-awards-snapshot");
  await ensurePlayerAwards();
  primeAwardWinnerMaps();
}

export function isAwardWinnerPlayerName(name: string): boolean {
  primeAwardWinnerMaps();
  return AWARD_WINNER_NAMES.has(normalizeName(name));
}

/** 0 = award/legend (prefer), 1 = everyone else. */
export function awardWinnerSortRank(name: string): number {
  return isAwardWinnerPlayerName(name) ? 0 : 1;
}

/** Full-name query → preferred route id from award/legend map. */
export function awardWinnerIdForQuery(q: string): string | null {
  primeAwardWinnerMaps();
  const key = normalizeName(q);
  if (!key || !key.includes(" ")) return null;
  return AWARD_WINNER_NAME_TO_ID.get(key) ?? null;
}
