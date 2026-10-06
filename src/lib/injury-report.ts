/**
 * League injury report from the structured status feed: status, body part,
 * injury type and listed return date. Written notes are never read.
 */

export type InjuryStatus = "out" | "day-to-day" | "other";

export type InjuryEntry = {
  athleteId: string;
  name: string;
  /** Feed team abbreviation (e.g. "GS", "NY"); resolve before display. */
  teamAbbr: string | null;
  status: InjuryStatus;
  statusLabel: string;
  /** e.g. "Left knee sprain"; null when the feed gives no body part. */
  injury: string | null;
  /** YYYY-MM-DD listed return, an estimate that often moves. */
  returnDate: string | null;
  updated: string | null;
  /** Points per game used to rank the list, with the season it came from. */
  ppg: number | null;
  ppgSeason: string | null;
};

type RawDetails = { type?: string; detail?: string; side?: string; returnDate?: string };
type RawInjury = {
  status?: string;
  date?: string;
  details?: RawDetails;
  athlete?: {
    displayName?: string;
    links?: { href?: string }[];
    headshot?: { href?: string };
    team?: { abbreviation?: string };
  };
};
type RawFeed = { injuries?: { injuries?: RawInjury[] }[] };

const UNSPECIFIED = /^(not specified|unknown|other)$/i;

function athleteIdOf(a: RawInjury["athlete"]): string | null {
  for (const href of [...(a?.links ?? []).map((l) => l.href), a?.headshot?.href]) {
    const m = href?.match(/\/id\/(\d+)\b/) ?? href?.match(/\/players\/full\/(\d+)\.png/);
    if (m) return m[1]!;
  }
  return null;
}

export function injuryLabel(d: RawDetails | undefined): string | null {
  const type = d?.type?.trim();
  if (!type || UNSPECIFIED.test(type)) return null;
  if (/^(rest|undisclosed|not injury related|illness|personal)$/i.test(type)) {
    return type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
  }
  const side = d?.side && !UNSPECIFIED.test(d.side) ? d.side.trim() : "";
  const detail = d?.detail && !UNSPECIFIED.test(d.detail) ? d.detail.trim().toLowerCase() : "";
  const label = [side, type, detail]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/\bachilles\b/g, "Achilles");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function statusOf(raw: string | undefined): InjuryStatus {
  if (/^out$/i.test(raw ?? "")) return "out";
  if (/day[- ]to[- ]day/i.test(raw ?? "")) return "day-to-day";
  return "other";
}

/** Entries from the raw feed, without ranking stats attached. */
export function parseInjuryFeed(feed: RawFeed): InjuryEntry[] {
  const out: InjuryEntry[] = [];
  const seen = new Set<string>();
  for (const team of feed.injuries ?? []) {
    for (const row of team.injuries ?? []) {
      const athleteId = athleteIdOf(row.athlete);
      const name = row.athlete?.displayName?.trim();
      if (!athleteId || !name || seen.has(athleteId)) continue;
      seen.add(athleteId);
      const ret = row.details?.returnDate;
      out.push({
        athleteId,
        name,
        teamAbbr: row.athlete?.team?.abbreviation ?? null,
        status: statusOf(row.status),
        statusLabel: row.status?.trim() || "Listed",
        injury: injuryLabel(row.details),
        returnDate: ret && /^\d{4}-\d{2}-\d{2}$/.test(ret) ? ret : null,
        updated: row.date ?? null,
        ppg: null,
        ppgSeason: null,
      });
    }
  }
  return out;
}

const NOT_AN_INJURY = /^(rest|personal|not injury related)$/i;

/** True for rest days and personal or other non-injury absences. */
export function isNonInjury(entry: InjuryEntry): boolean {
  return entry.injury != null && NOT_AN_INJURY.test(entry.injury);
}

/**
 * Scoring weighted by how much the absence matters: out counts in full,
 * day-to-day a bit less, rest and personal days far less. Players without a
 * season line go last.
 */
function weight(e: InjuryEntry): number {
  if (e.ppg == null) return -1;
  const factor = isNonInjury(e) ? 0.3 : e.status === "out" ? 1 : 0.8;
  return e.ppg * factor;
}

export function rankInjuries(entries: InjuryEntry[]): InjuryEntry[] {
  const statusRank = (s: InjuryStatus) => (s === "out" ? 0 : s === "day-to-day" ? 1 : 2);
  return [...entries].sort(
    (a, b) =>
      weight(b) - weight(a) ||
      statusRank(a.status) - statusRank(b.status) ||
      (b.updated ?? "").localeCompare(a.updated ?? "")
  );
}
