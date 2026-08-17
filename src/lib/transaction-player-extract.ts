/**
 * Deterministic extraction of player-name candidates from ESPN transaction blurbs.
 * Pattern-based only — not NLP, not fuzzy matching.
 */

import { ALL_TEAM_ABBRS, TEAM_BRANDS, resolveTeamBrand } from "@/lib/nba-brand";
import { ESPN_TEAM_META } from "@/data/providers/nba/team-meta";
import { normalizePlayerName } from "@/lib/player-name";

export type ExtractedTransactionPlayerMention = {
  rawName: string;
  normalizedName: string;
  positionHint: string | null;
  /** Inclusive start / exclusive end in the original description. */
  start: number;
  end: number;
};

const POSITION =
  "(?:PG|SG|SF|PF|Gs|Fs|Cs|G|F|C)";

const NAME_TOKEN =
  "[A-Z][A-Za-z'.-]*(?:-[A-Z][A-Za-z'.-]*)*";

const SUFFIX = "(?:\\s+(?:Jr\\.?|Sr\\.?|II|III|IV|V))?";

/** One player name (1–4 tokens + optional suffix). */
const PLAYER_NAME = `${NAME_TOKEN}(?:\\s+${NAME_TOKEN}){0,3}${SUFFIX}`;

const TEAM_BLOCKLIST = buildTeamBlocklist();

function buildTeamBlocklist(): Set<string> {
  const out = new Set<string>();
  const add = (s: string) => {
    const n = normalizePlayerName(s);
    if (n.length >= 3) out.add(n);
  };
  for (const abbr of ALL_TEAM_ABBRS) {
    add(abbr);
    const brand = TEAM_BRANDS[abbr];
    if (brand) add(brand.abbr);
  }
  for (const meta of Object.values(ESPN_TEAM_META)) {
    add(meta.city);
    for (const part of meta.city.split(/\s+/)) add(part);
  }
  // Nicknames / common ESPN place labels
  for (const nick of [
    "hawks",
    "celtics",
    "nets",
    "hornets",
    "bulls",
    "cavaliers",
    "cavs",
    "mavericks",
    "mavs",
    "nuggets",
    "pistons",
    "warriors",
    "rockets",
    "pacers",
    "clippers",
    "lakers",
    "grizzlies",
    "heat",
    "bucks",
    "timberwolves",
    "wolves",
    "pelicans",
    "knicks",
    "thunder",
    "magic",
    "sixers",
    "76ers",
    "seventysixers",
    "suns",
    "blazers",
    "trailblazers",
    "kings",
    "spurs",
    "raptors",
    "jazz",
    "wizards",
    "philadelphia",
    "goldenstate",
    "losangeles",
    "newyork",
    "neworleans",
    "sanantonio",
    "oklahomacity",
    "okc",
    "draft",
    "considerations",
    "rights",
    "pick",
    "picks",
    "cash",
    "future",
  ]) {
    add(nick);
  }
  return out;
}

function isBlockedName(name: string): boolean {
  const n = normalizePlayerName(name);
  if (!n || n.length < 4) return true;
  if (TEAM_BLOCKLIST.has(n)) return true;
  // Entire name is a known team city / nickname token set
  const brand = resolveTeamBrand(name);
  if (brand && normalizePlayerName(brand.abbr) === n) return true;
  return false;
}

function pushMention(
  out: ExtractedTransactionPlayerMention[],
  rawName: string,
  positionHint: string | null,
  start: number,
  end: number
) {
  const cleaned = rawName.replace(/\s+/g, " ").replace(/[.,;:]+$/g, "").trim();
  if (!cleaned || isBlockedName(cleaned)) return;
  // Avoid duplicates overlapping same span
  if (out.some((m) => m.start === start && m.end === end)) return;
  out.push({
    rawName: cleaned,
    normalizedName: normalizePlayerName(cleaned),
    positionHint: positionHint?.replace(/s$/i, "") ?? null,
    start,
    end,
  });
}

/**
 * Extract player-name candidates from an ESPN transaction description.
 * Covers common archive patterns (Waived/Signed/Acquired/…) without NLP.
 */
export function extractTransactionPlayerMentions(
  description: string
): ExtractedTransactionPlayerMention[] {
  if (!description?.trim()) return [];
  const text = description;
  const out: ExtractedTransactionPlayerMention[] = [];

  // Position + name (singular): "G Ethan Thompson", "F Paul George"
  const singular = new RegExp(
    `\\b(${POSITION})\\s+(${PLAYER_NAME})(?=\\s+(?:to|from|for|in|on|with|and|,|\\.|$)|$)`,
    "g"
  );
  for (const m of text.matchAll(singular)) {
    const full = m[0];
    const pos = m[1]!;
    const name = m[2]!;
    const start = m.index ?? 0;
    // Plural roster tokens handled separately
    if (/^(Gs|Fs|Cs)$/i.test(pos)) continue;
    pushMention(out, name, pos, start + pos.length + 1, start + full.length);
  }

  // Plural position then A and B: "Gs Jamaree Bouyea and Cormac Ryan"
  // (no second position letter — avoids swallowing "F Name")
  const pluralPair = new RegExp(
    `\\b(Gs|Fs|Cs)\\s+(${PLAYER_NAME})\\s+and\\s+(${PLAYER_NAME})`,
    "gi"
  );
  for (const m of text.matchAll(pluralPair)) {
    const pos = m[1]!;
    const a = m[2]!;
    const b = m[3]!;
    const start = m.index ?? 0;
    const aStart = start + pos.length + 1;
    const aEnd = aStart + a.length;
    const bStart = text.indexOf(b, aEnd);
    pushMention(out, a, pos, aStart, aEnd);
    if (bStart >= 0) pushMention(out, b, pos, bStart, bStart + b.length);
  }

  // "and F Name" already caught by singular; also "and Name" after a player without new pos
  // Covered when second name has its own position in "G X and F Y".

  // Sort by start; drop contained overlaps (prefer longer)
  out.sort((a, b) => a.start - b.start || b.end - a.end);
  const filtered: ExtractedTransactionPlayerMention[] = [];
  for (const m of out) {
    const contained = filtered.some(
      (p) => m.start >= p.start && m.end <= p.end
    );
    if (contained) continue;
    filtered.push(m);
  }
  return filtered;
}

/** True when text looks like draft/cash compensation — never an asset invent. */
export function descriptionLooksLikeDraftCompensation(description: string): boolean {
  return /\bdraft considerations?\b|\bfuture (draft )?considerations?\b|\bcash considerations?\b/i.test(
    description
  );
}
