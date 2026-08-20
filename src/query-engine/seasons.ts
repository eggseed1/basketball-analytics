import {
  canonicalSeasonFromStartYear,
  currentNbaStartYear,
  parseSeasonParam,
} from "@/data/providers/historical/season-range";

const SEASON_RE = /\b((?:19|20)\d{2})\s*[--/]\s*(\d{2})\b/g;
const YEAR_SEASON_RE = /\b((?:19|20)\d{2})\s+season\b/gi;

export function extractCanonicalSeasons(text: string): string[] {
  const found: string[] = [];
  const push = (s: string) => {
    try {
      const canon = parseSeasonParam(s);
      if (canon && !found.includes(canon)) found.push(canon);
    } catch {
      /* ignore */
    }
  };

  for (const m of text.matchAll(SEASON_RE)) {
    push(`${m[1]}-${m[2]}`);
  }
  for (const m of text.matchAll(YEAR_SEASON_RE)) {
    push(m[1]!);
  }
  return found;
}

export function resolveSeasonPhrases(
  text: string,
  now = new Date()
): { seasons: string[]; notes: string[] } {
  const notes: string[] = [];
  const seasons = extractCanonicalSeasons(text);
  const lower = text.toLowerCase();
  const current = canonicalSeasonFromStartYear(currentNbaStartYear(now));
  const last = canonicalSeasonFromStartYear(currentNbaStartYear(now) - 1);

  if (/\b(current|this)\s+season\b/.test(lower) && !seasons.includes(current)) {
    seasons.push(current);
    notes.push(`Interpreted "current/this season" as ${current}.`);
  }
  if (/\blast\s+season\b/.test(lower) && !seasons.includes(last)) {
    seasons.push(last);
    notes.push(`Interpreted "last season" as ${last}.`);
  }

  // "from 2008-09 through 2015-16" / "from X to Y"
  const range = /from\s+((?:19|20)\d{2}\s*[--/]\s*\d{2})\s+(?:through|to|until|-)\s+((?:19|20)\d{2}\s*[--/]\s*\d{2})/i.exec(
    text
  );
  if (range) {
    try {
      const a = parseSeasonParam(range[1]!.replace(/\s+/g, ""))!;
      const b = parseSeasonParam(range[2]!.replace(/\s+/g, ""))!;
      const start = Math.min(
        Number(a.slice(0, 4)),
        Number(b.slice(0, 4))
      );
      const end = Math.max(Number(a.slice(0, 4)), Number(b.slice(0, 4)));
      for (let y = start; y <= end; y++) {
        const s = canonicalSeasonFromStartYear(y);
        if (!seasons.includes(s)) seasons.push(s);
      }
      notes.push(`Expanded season range ${a} → ${b}.`);
    } catch {
      /* ignore */
    }
  }

  return { seasons, notes };
}
