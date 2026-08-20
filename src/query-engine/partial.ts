/**
 * Partial-support decomposition - never silently drop unsupported clauses.
 */

import { detectUnsupportedClauses, type UnsupportedHit } from "./unsupported";
import { resolveMetric } from "./metrics";
import { extractCanonicalSeasons } from "./seasons";
import { possessivePlayerHintFromText } from "./interpret-helpers";

export type PartialSupportPlan = {
  unsupported: UnsupportedHit[];
  /** Deterministic rewrite the user can run for the supported portion. */
  supportedQuery: string | null;
  supportedSummary: string | null;
  reason: string;
};

function stripUnsupportedLanguage(text: string): string {
  return text
    .replace(/\binside the college three\b/gi, " ")
    .replace(/\binside the college 3\b/gi, " ")
    .replace(/\bat the rim\b/gi, " ")
    .replace(/\bin the paint\b/gi, " ")
    .replace(/\bmid[- ]?range\b/gi, " ")
    .replace(/\bcorner three\b/gi, " ")
    .replace(/\bwith less than \d+\s*minutes?( left)?\b/gi, " ")
    .replace(/\bunder \d+:\d+\b/gi, " ")
    .replace(/\bwith\s*<\s*\d+:?\d*\s*(left)?\b/gi, " ")
    .replace(/\bin the (fourth|4th) quarter\b/gi, " ")
    .replace(/\bin Q[1-4]\b/gi, " ")
    .replace(/\sand (his|her|their)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Only when the user clearly asks for an independent supported clause
 * alongside unsupported PBP dimensions - never from leftover words alone.
 */
function hasIndependentSupportedClause(raw: string): boolean {
  if (
    /\bseason\s+(fg%|field[- ]?goal|ts%|true shooting|efg%?|usage|average|ppg|points)\b/i.test(
      raw
    )
  ) {
    return true;
  }
  if (
    /\band\b/i.test(raw) &&
    /\b(fg%|field[- ]?goal|ts%|true shooting|efg%?|usage|ppg|season)\b/i.test(
      raw
    )
  ) {
    return true;
  }
  if (
    /\bcompared?\s+to\s+(his|her|their)\s+season\b/i.test(raw) ||
    /\bvs\.?\s+(his|her|their)\s+season\b/i.test(raw)
  ) {
    return true;
  }
  return false;
}

/**
 * If the question mixes supported season stats with unsupported PBP clauses,
 * return a disclosed partial plan (never auto-answer the simplified form).
 */
export function planPartialSupport(raw: string): PartialSupportPlan | null {
  const unsupported = detectUnsupportedClauses(raw);
  if (!unsupported.length) return null;
  if (!hasIndependentSupportedClause(raw)) return null;

  const cleaned = stripUnsupportedLanguage(raw);
  const player =
    possessivePlayerHintFromText(cleaned) ??
    possessivePlayerHintFromText(raw);
  const metric = resolveMetric(cleaned) ?? resolveMetric(raw);
  const seasons = extractCanonicalSeasons(raw);

  if (!player || !metric) {
    return null;
  }

  const seasonBit = seasons[0] ? ` in ${seasons[0]}` : "";
  const supportedQuery = `What was ${player}'s ${metric.label}${seasonBit}?`;

  return {
    unsupported,
    supportedQuery,
    supportedSummary: seasonBit
      ? `${player} · ${metric.label} · ${seasons[0]}`
      : `${player} · ${metric.label} (specify season when running)`,
    reason: `I can answer ${player}'s ${metric.label}${
      seasonBit || ""
    }, but the requested conditions require data ASK DRBL does not have yet.`,
  };
}
