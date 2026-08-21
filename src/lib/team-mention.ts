/**
 * Client-safe team token extraction from free text (abbrs + nicknames).
 */

import { ALL_TEAM_ABBRS, TEAM_BRANDS } from "@/lib/nba-brand";

export type ExtractedTeamMention = {
  raw: string;
  teamKey: string;
  label: string;
  start: number;
  end: number;
};

/** Nickname / city phrases → brand id. Longer phrases first at match time. */
const TEAM_NICKNAMES: Array<[string, string]> = [
  ["trail blazers", "por"],
  ["la clippers", "lac"],
  ["los angeles clippers", "lac"],
  ["la lakers", "lal"],
  ["los angeles lakers", "lal"],
  ["golden state warriors", "gsw"],
  ["golden state", "gsw"],
  ["oklahoma city thunder", "okc"],
  ["oklahoma city", "okc"],
  ["new orleans pelicans", "nop"],
  ["new orleans", "nop"],
  ["new york knicks", "nyk"],
  ["san antonio spurs", "sas"],
  ["philadelphia 76ers", "phi"],
  ["minnesota timberwolves", "min"],
  ["portland trail blazers", "por"],
  ["76ers", "phi"],
  ["sixers", "phi"],
  ["blazers", "por"],
  ["hawks", "atl"],
  ["celtics", "bos"],
  ["nets", "bkn"],
  ["hornets", "cha"],
  ["bulls", "chi"],
  ["cavaliers", "cle"],
  ["cavs", "cle"],
  ["mavericks", "dal"],
  ["mavs", "dal"],
  ["nuggets", "den"],
  ["pistons", "det"],
  ["warriors", "gsw"],
  ["rockets", "hou"],
  ["pacers", "ind"],
  ["clippers", "lac"],
  ["lakers", "lal"],
  ["grizzlies", "mem"],
  ["heat", "mia"],
  ["bucks", "mil"],
  ["timberwolves", "min"],
  ["wolves", "min"],
  ["pelicans", "nop"],
  ["knicks", "nyk"],
  ["thunder", "okc"],
  ["magic", "orl"],
  ["suns", "phx"],
  ["kings", "sac"],
  ["spurs", "sas"],
  ["raptors", "tor"],
  ["jazz", "uta"],
  ["wizards", "was"],
];

type Token = { phrase: string; teamKey: string; label: string };

function uniqueTokens(): Token[] {
  const seen = new Set<string>();
  const out: Token[] = [];
  const add = (phrase: string, teamKey: string, label: string) => {
    const key = phrase.trim().toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push({ phrase: key, teamKey, label });
  };

  for (const [phrase, teamKey] of TEAM_NICKNAMES) {
    const brand = TEAM_BRANDS[teamKey];
    add(phrase, teamKey, brand?.abbr ?? teamKey.toUpperCase());
  }
  for (const id of ALL_TEAM_ABBRS) {
    const brand = TEAM_BRANDS[id];
    if (!brand) continue;
    add(brand.abbr, brand.id, brand.abbr);
    if (brand.id.length >= 3) add(brand.id, brand.id, brand.abbr);
  }
  out.sort((a, b) => b.phrase.length - a.phrase.length);
  return out;
}

const TOKENS = uniqueTokens();

const TEAM_RE = new RegExp(
  `\\b(${TOKENS.map((t) => t.phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`,
  "gi"
);

/**
 * Find team abbreviations and nicknames in `text`.
 * Skips overlapping matches; prefers the longest phrase.
 */
export function extractTeamMentions(text: string): ExtractedTeamMention[] {
  if (!text) return [];
  const hits: ExtractedTeamMention[] = [];
  TEAM_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TEAM_RE.exec(text))) {
    const raw = match[1] ?? match[0];
    const phrase = raw.toLowerCase();
    const token = TOKENS.find((t) => t.phrase === phrase);
    if (!token) continue;
    const start = match.index;
    const end = start + raw.length;
    if (hits.some((h) => start < h.end && end > h.start)) continue;
    hits.push({
      raw,
      teamKey: token.teamKey,
      label: token.label,
      start,
      end,
    });
  }
  return hits.sort((a, b) => a.start - b.start);
}
