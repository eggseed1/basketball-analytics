/** First BAA/NBA draft year. */
export const EARLIEST_NBA_DRAFT_YEAR = 1947;

export type DraftClassFilter = number | "undrafted";

/** Newest → oldest calendar draft years, including the current year after June. */
export function listDraftClassYears(now = new Date()): number[] {
  const latest = now.getUTCFullYear();
  const years: number[] = [];
  for (let year = latest; year >= EARLIEST_NBA_DRAFT_YEAR; year -= 1) {
    years.push(year);
  }
  return years;
}

/** Newest-first years grouped into decades for the draft class picker. */
export function groupDraftClassYearsByDecade(
  years: number[]
): { decade: number; years: number[] }[] {
  const groups: { decade: number; years: number[] }[] = [];
  for (const year of years) {
    const decade = Math.floor(year / 10) * 10;
    const last = groups[groups.length - 1];
    if (last?.decade === decade) last.years.push(year);
    else groups.push({ decade, years: [year] });
  }
  return groups;
}

export function parseDraftClassParam(
  value: string | string[] | null | undefined
): DraftClassFilter | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw?.trim()) return undefined;
  const token = raw.trim().toLowerCase();
  if (token === "undrafted" || token === "udfa" || token === "none") {
    return "undrafted";
  }
  const year = Number.parseInt(raw, 10);
  if (!Number.isFinite(year) || year < EARLIEST_NBA_DRAFT_YEAR || year > 2100) {
    return undefined;
  }
  return year;
}
