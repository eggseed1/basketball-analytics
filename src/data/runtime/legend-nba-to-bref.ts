/**
 * NBA PERSON_ID → bref:{slug} remaps for retired/HOF legends.
 * Prefer BRef career on Cloudflare (ESPN athlete pages hang/timeout for many retirees).
 * Active stars stay on ESPN athlete ids.
 *
 * Sources: curated legend seed + awards bake slugs (covers classic 76xxx person ids).
 */
import legendFile from "./legend-player-aliases.json";
import awardsFile from "./player-awards-snapshot.json";

type LegendRow = {
  nbaPlayerId?: string;
  brefSlug?: string;
  playerName?: string;
};

type AwardsFile = {
  names?: Record<string, string>;
  slugs?: Record<string, string>;
};

/** Keep current stars on ESPN routes even when seeded in awards/legend files. */
const KEEP_ESPN_NBA_IDS = new Set([
  "2544", // LeBron James
  "201142", // Kevin Durant
  "201566", // Russell Westbrook
  "201935", // James Harden
  "201939", // Stephen Curry
  "203507", // Giannis Antetokounmpo
  "203999", // Nikola Jokic
  "1629029", // Luka Doncic
  "1630162", // Anthony Edwards
  "1628369", // Jayson Tatum
  "1628378", // Donovan Mitchell
  "1628983", // Shai Gilgeous-Alexander
  "1629027", // Trae Young
  "203076", // Anthony Davis
  "202695", // Kawhi Leonard
  "203954", // Joel Embiid
  "1627759", // Jaylen Brown
  "1631094", // Paolo Banchero
  "1641705", // Victor Wembanyama
]);

const legendRows = Array.isArray(
  (legendFile as { aliases?: LegendRow[] })?.aliases
)
  ? ((legendFile as { aliases: LegendRow[] }).aliases)
  : [];

const awards = awardsFile as AwardsFile;
const awardSlugs =
  awards.slugs && typeof awards.slugs === "object" ? awards.slugs : {};
const awardNames =
  awards.names && typeof awards.names === "object" ? awards.names : {};

export const LEGEND_NBA_TO_BREF: Record<string, string> = {
  // Explicit ESPN id collisions (NBA person id ≠ that ESPN athlete).
  "893": "bref:jordami01",
  "787": "bref:barklch01",
};

for (const row of legendRows) {
  const nbaId = String(row.nbaPlayerId ?? "").trim();
  const slug = String(row.brefSlug ?? "")
    .trim()
    .toLowerCase();
  if (!nbaId || !slug) continue;
  if (KEEP_ESPN_NBA_IDS.has(nbaId)) continue;
  if (!LEGEND_NBA_TO_BREF[nbaId]) {
    LEGEND_NBA_TO_BREF[nbaId] = `bref:${slug}`;
  }
}

for (const [nbaIdRaw, slugRaw] of Object.entries(awardSlugs)) {
  const nbaId = String(nbaIdRaw ?? "").trim();
  const slug = String(slugRaw ?? "")
    .trim()
    .toLowerCase();
  if (!nbaId || !slug) continue;
  if (KEEP_ESPN_NBA_IDS.has(nbaId)) continue;
  if (!LEGEND_NBA_TO_BREF[nbaId]) {
    LEGEND_NBA_TO_BREF[nbaId] = `bref:${slug}`;
  }
}

/** BRef slug → display name from the awards bake. */
export const BREF_SLUG_TO_NAME: Record<string, string> = {};

/**
 * Wrong NBA PERSON_IDs that still appear in old curated links / bookmarks.
 * Values are canonical PERSON_IDs used by awards + retired-jersey tables.
 */
export const LEGACY_NBA_PERSON_ID_ALIASES: Record<string, string> = {
  "1563": "708", // Kevin Garnett — early award history typo
};

export function resolveLegacyNbaPersonId(
  rawId: string | null | undefined
): string | null {
  const id = String(rawId ?? "").trim();
  if (!id) return null;
  if (!/^\d+$/.test(id)) return id;
  return LEGACY_NBA_PERSON_ID_ALIASES[id] ?? id;
}
for (const [nbaId, slugRaw] of Object.entries(awardSlugs)) {
  const slug = String(slugRaw ?? "")
    .trim()
    .toLowerCase();
  const name = String(awardNames[nbaId] ?? "").trim();
  if (slug && name && !BREF_SLUG_TO_NAME[slug]) {
    BREF_SLUG_TO_NAME[slug] = name;
  }
}
for (const row of legendRows) {
  const slug = String(row.brefSlug ?? "")
    .trim()
    .toLowerCase();
  const name = String(row.playerName ?? "").trim();
  if (slug && name && !BREF_SLUG_TO_NAME[slug]) {
    BREF_SLUG_TO_NAME[slug] = name;
  }
}

export function remapLegendNbaIdToBref(rawId: string): string | null {
  const id = String(rawId ?? "").trim();
  return LEGEND_NBA_TO_BREF[id] ?? null;
}

/** Reverse of LEGEND_NBA_TO_BREF — slug (no `bref:` prefix) → NBA PERSON_ID. */
export const LEGEND_BREF_TO_NBA: Record<string, string> = {};
for (const [nbaId, brefRoute] of Object.entries(LEGEND_NBA_TO_BREF)) {
  const slug = String(brefRoute ?? "")
    .trim()
    .toLowerCase()
    .replace(/^bref:/, "")
    .split("|")[0]
    ?.trim();
  if (slug && !LEGEND_BREF_TO_NBA[slug]) {
    LEGEND_BREF_TO_NBA[slug] = nbaId;
  }
}

/**
 * Coerce a player route / identity id to an NBA PERSON_ID for awards,
 * retired jerseys, and other NBA-id keyed lookups.
 *
 * Player pages remap many legends to `bref:{slug}` for CF-safe career data;
 * awards + jersey retirement stay keyed by NBA PERSON_ID (e.g. Pierce `1718`).
 */
export function nbaPersonIdFromPlayerRoute(
  rawId: string | null | undefined
): string | null {
  const id = String(rawId ?? "").trim();
  if (!id) return null;
  if (/^\d+$/.test(id)) return resolveLegacyNbaPersonId(id);
  const lower = id.toLowerCase();
  const slug = lower.startsWith("bref:")
    ? lower.slice(lower.indexOf(":") + 1).split("|")[0]?.trim()
    : lower;
  if (!slug) return null;
  return LEGEND_BREF_TO_NBA[slug] ?? null;
}

export function displayNameForBrefSlug(slugOrRoute: string): string | null {
  const raw = String(slugOrRoute ?? "").trim();
  if (!raw) return null;
  const slug = raw.toLowerCase().startsWith("bref:")
    ? raw.slice(raw.indexOf(":") + 1).split("|")[0]?.trim().toLowerCase()
    : raw.toLowerCase();
  if (!slug) return null;
  return BREF_SLUG_TO_NAME[slug] ?? null;
}
