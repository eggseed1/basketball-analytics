/**
 * Analytical foundations — progressive disclosure, context, findings.
 * UI and queries consume these shapes; never invent unsupported metrics.
 */

/** Progressive rabbit-hole depth (product UX levels 1–5). */
export type DisclosureLevel = 1 | 2 | 3 | 4 | 5;

export type EvidenceKind =
  | "board"
  | "career"
  | "game"
  | "shot"
  | "possession"
  | "lineup"
  | "transaction"
  | "learn";

export type StatPopulation =
  | "qualified_season"
  | "position"
  | "career_self"
  | "league"
  | "historical_peers"
  | "custom";

/**
 * Level-2 context around a single number.
 * Only include fields that were actually computed.
 */
export type StatContext = {
  /** Display-ready primary value (already formatted). */
  display: string;
  /** Raw numeric value when meaningful (fractions stay in [0,1]). */
  value?: number;
  unit?: "pct" | "per100" | "count" | "rate" | "ordinal" | "other";
  /** 0–100 when ranked in a defined population. */
  percentile?: number;
  population?: StatPopulation;
  populationLabel?: string;
  sampleSize?: number;
  /** vs career / league / prior window — only when methodologically valid. */
  vsCareer?: number;
  vsLeague?: number;
  vsPrior?: number;
  timeframe?: string;
  sourceLabel?: string;
  learnHref?: string;
};

export type AnalyticalFinding = {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
  level: DisclosureLevel;
  href?: string;
  learnHref?: string;
  playerIds?: string[];
  teamIds?: string[];
};

export type ComparisonDimension = {
  id: string;
  label: string;
  aDisplay: string;
  bDisplay: string;
  aValue?: number;
  bValue?: number;
  /** 0–100 peer percentile when season mode has a pool. */
  aPercentile?: number;
  bPercentile?: number;
  /** 0–100 bar fill (percentile or relative matchup scale). */
  aBar?: number;
  bBar?: number;
  /** Positive means A higher on the “better” scale after invert handling. */
  delta?: number;
  note?: string;
  /** Sheet category — Profile · Shooting · Defense · Hustle · Advanced · Impact. */
  group?:
    | "profile"
    | "shooting"
    | "defense"
    | "hustle"
    | "advanced"
    | "impact"
    /** @deprecated legacy compare groups */
    | "counting"
    | "rates"
    | "rate_ability"
    | "realized_value"
    | "external"
    | "box";
};

export type PlayerComparisonResult = {
  aId: string;
  bId: string;
  aName: string;
  bName: string;
  /** Team key/abbr for brand color (season row when available). */
  aTeamKey?: string;
  bTeamKey?: string;
  /** Teams to show under the identity (season club, or career tenure order). */
  aTeamKeys?: string[];
  bTeamKeys?: string[];
  /** Shared season when both sides use the same year; otherwise undefined. */
  season?: string;
  seasonA?: string;
  seasonB?: string;
  mode?: "career" | "season";
  dimensions: ComparisonDimension[];
  /** Plain-language difference drivers (data-backed only). */
  differenceSummary: string[];
};

export const DISCLOSURE_LABELS: Record<DisclosureLevel, string> = {
  1: "Answer",
  2: "Context",
  3: "Investigation",
  4: "Evidence",
  5: "Deep analytics",
};
