/** Shared NL helpers used by interpret + partial (avoid circular imports). */

import { PLAYER_ALIASES } from "./entities";

export function possessivePlayerHintFromText(text: string): string | null {
  const m =
    /\b((?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)|'?[A-Za-z]+)'s\b/.exec(text) ??
    /\b(lebron|jokic|curry|giannis|tatum|embiid|doncic|luka|steph|trey\s+murphy)\b/i.exec(
      text
    );
  if (!m) return null;
  const raw = m[1]!.replace(/'s$/i, "").trim();
  const alias = PLAYER_ALIASES[raw.toLowerCase()];
  return alias?.name ?? raw;
}

export function detectVagueCompetitiveLanguage(text: string): string | null {
  if (
    /\blate\s+in\s+close\s+games?\b/i.test(text) ||
    /\bclutch\b/i.test(text) && !/\bclutch\s+possession\b/i.test(text)
  ) {
    return "Phrases like “late in close games” or “clutch” are not deterministic filters in ASK DRBL. Specify quarter, clock, and score margin explicitly - and note those still require PBP execution that is not available yet.";
  }
  if (
    /\b(most\s+valuable|greatest|dominant|how\s+good)\b/i.test(text) &&
    !/\b(peak\s+production|best\s+season|rank|cpi|ts%|true shooting)\b/i.test(
      text
    )
  ) {
    return "Terms like “most valuable,” “greatest,” or “how good” are ambiguous without a documented methodology. Try “peak production season” (Career Resume CPI) or “best season” (Rank My Seasons).";
  }
  return null;
}
