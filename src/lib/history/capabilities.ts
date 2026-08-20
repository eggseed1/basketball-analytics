/**
 * History product capability registry (P18A).
 * Never infer support from year alone inside UI — look up here.
 *
 * Null semantics: 0 = measured zero; null = not measured / unavailable.
 */

export const HISTORY_VERSION = "drbl-history-v1" as const;

export type CapabilityLevel =
  | "SUPPORTED"
  | "PARTIAL"
  | "UNAVAILABLE"
  | "RESEARCH_ONLY";

export type HistoryCapabilityField =
  | "boxScore"
  | "pbp"
  | "scoreTimeline"
  | "quarterScores"
  | "shotEvents"
  | "shotCoordinates"
  | "shotZones"
  | "shotChart"
  | "assists"
  | "rebounds"
  | "turnovers"
  | "fouls"
  | "freeThrows"
  | "recordedSubs"
  | "canonicalLineups"
  | "drbl"
  | "war1";

export type SchemaFamily =
  | "STATS_V3_ADAPT"
  | "CDN_LIVEDATA"
  | "MIXED"
  | "UNKNOWN";

export interface SeasonCapabilityRow {
  season: string;
  schemaFamily: SchemaFamily;
  fields: Record<HistoryCapabilityField, CapabilityLevel>;
  notes?: string;
}

const ALL_FIELDS: HistoryCapabilityField[] = [
  "boxScore",
  "pbp",
  "scoreTimeline",
  "quarterScores",
  "shotEvents",
  "shotCoordinates",
  "assists",
  "rebounds",
  "turnovers",
  "fouls",
  "freeThrows",
  "recordedSubs",
  "canonicalLineups",
  "drbl",
  "war1",
];

function row(
  season: string,
  schemaFamily: SchemaFamily,
  overrides: Partial<Record<HistoryCapabilityField, CapabilityLevel>>,
  notes?: string
): SeasonCapabilityRow {
  const fields = Object.fromEntries(
    ALL_FIELDS.map((f) => [f, "UNAVAILABLE" as CapabilityLevel])
  ) as Record<HistoryCapabilityField, CapabilityLevel>;
  for (const [k, v] of Object.entries(overrides)) {
    fields[k as HistoryCapabilityField] = v;
  }
  return { season, schemaFamily, fields, notes };
}

/** Factual box + PBP descriptive defaults for stats-v3 archive eras. */
const ARCHIVE_FACTUAL: Partial<
  Record<HistoryCapabilityField, CapabilityLevel>
> = {
  boxScore: "SUPPORTED",
  pbp: "SUPPORTED",
  scoreTimeline: "PARTIAL", // per-game validation required
  quarterScores: "PARTIAL",
  shotEvents: "SUPPORTED",
  shotCoordinates: "PARTIAL", // often present but sparse / zeroed
  shotZones: "PARTIAL",
  shotChart: "PARTIAL",
  assists: "SUPPORTED",
  rebounds: "SUPPORTED",
  turnovers: "SUPPORTED",
  fouls: "SUPPORTED",
  freeThrows: "SUPPORTED",
  recordedSubs: "SUPPORTED",
  canonicalLineups: "RESEARCH_ONLY",
  drbl: "UNAVAILABLE",
  war1: "UNAVAILABLE",
};

const MODERN_DRBL: Partial<Record<HistoryCapabilityField, CapabilityLevel>> = {
  ...ARCHIVE_FACTUAL,
  shotCoordinates: "SUPPORTED",
  shotZones: "SUPPORTED",
  shotChart: "SUPPORTED",
  quarterScores: "SUPPORTED",
  scoreTimeline: "SUPPORTED",
  canonicalLineups: "RESEARCH_ONLY",
  drbl: "SUPPORTED",
  war1: "SUPPORTED",
};

function seasonLabel(startYear: number): string {
  const end = String(startYear + 1).slice(-2);
  return `${startYear}-${end}`;
}

/**
 * Authoritative season capability table for product UI (1996-97 → present).
 * Game-level flags (e.g. scoreTimelineAvailable) still override per artifact.
 * DRBL/WAR1 only 2020-21+; never invent pre-2020 support.
 */
export const SEASON_CAPABILITIES: SeasonCapabilityRow[] = (() => {
  const rows: SeasonCapabilityRow[] = [];
  for (let y = 1996; y <= 2025; y++) {
    const season = seasonLabel(y);
    if (y >= 2020) {
      rows.push(row(season, "CDN_LIVEDATA", MODERN_DRBL));
      continue;
    }
    if (season === "2019-20") {
      rows.push(
        row(
          season,
          "STATS_V3_ADAPT",
          { ...ARCHIVE_FACTUAL, pbp: "PARTIAL", scoreTimeline: "PARTIAL" },
          "Known source anomalies — descriptive product OK; canonical DRBL blocked"
        )
      );
      continue;
    }
    const notes =
      season === "1996-97"
        ? "Archive floor season"
        : season === "2005-06"
          ? "P18A pilot"
          : undefined;
    rows.push(row(season, "STATS_V3_ADAPT", ARCHIVE_FACTUAL, notes));
  }
  return rows;
})();

const BY_SEASON = new Map(SEASON_CAPABILITIES.map((r) => [r.season, r]));

export function getSeasonCapabilities(
  season: string
): SeasonCapabilityRow | null {
  return BY_SEASON.get(season) ?? null;
}

export function getCapability(
  season: string,
  field: HistoryCapabilityField
): CapabilityLevel {
  const row = getSeasonCapabilities(season);
  return row?.fields[field] ?? "UNAVAILABLE";
}

export function isDrblSeasonCapability(season: string): boolean {
  return getCapability(season, "drbl") === "SUPPORTED";
}

export function historyCapabilityFields(): HistoryCapabilityField[] {
  return [...ALL_FIELDS];
}
